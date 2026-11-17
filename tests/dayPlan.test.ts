import { describe, expect, it } from 'vitest'
import { mealsAhead, planDay, planDayV2, stepOf, type PlanCandidate, type PlanCombo } from '../server/utils/dayPlan'

const c = (name: string, per100: [number, number, number, number], typical_g: number, usual_meal: PlanCandidate['usual_meal'] = 'lunch'): PlanCandidate => ({
  key: name, name, product_id: null, per100: { kcal: per100[0], p: per100[1], f: per100[2], c: per100[3] },
  source: 'generic', typical_g, usual_meal, last_date: '2026-11-07',
})

// Vasyl's real 7–8 Nov 2026 foods (per 100 g)
const recent = [
  c('cheese Favita', [226, 10, 18, 6], 55, 'breakfast'),
  c('boiled egg', [155, 12.6, 10.6, 1.2], 50, 'breakfast'),
  c('egg white', [52, 11, 0.2, 0.7], 62, 'breakfast'),
  c('grill sausages', [333, 13, 30, 2], 42, 'breakfast'),
  c('tiramisu', [283, 4.6, 17, 26], 87, 'snack'),
  c('wholegrain bread', [260, 9, 3.6, 43], 50, 'breakfast'),
  c('pasta, cooked', [158, 5.8, 0.9, 30.9], 100),
  c('chicken breast, cooked', [165, 31, 3.6, 0], 90),
  c('pork-buckwheat cutlets', [205, 13, 12, 12], 119, 'dinner'),
  c('Sacher cake', [357, 3, 18, 45], 100, 'snack'),
  c('skyr drink cherry', [80, 6.5, 1.5, 10], 350, 'snack'),
  c('whey', [387, 77, 4.8, 9.7], 31, 'snack'),
  c('skyr drink natural', [64, 7.6, 1.8, 4.3], 350, 'snack'),
]

describe('planDay', () => {
  it('after a fatty breakfast: lean protein, stays under the fat limit', () => {
    // 8 Nov after breakfast: 764/2150 kcal, P 31/200, F 50/70, C 45/200
    const r = planDay(recent, { kcal: 1386, p: 169, f: 20, c: 155 }, { ahead: mealsAhead(['breakfast']) })
    expect(r.plan.f).toBeLessThanOrEqual(23)
    expect(r.plan.p).toBeGreaterThan(120)
    expect(Math.abs(r.plan.kcal - 1386)).toBeLessThan(250)
    const names = r.items.map(i => i.name)
    expect(names).toContain('chicken breast, cooked')
    expect(names).not.toContain('grill sausages')
    expect(names).not.toContain('Sacher cake')
    expect(r.items.every(i => i.meal !== 'breakfast')).toBe(true)
    expect(r.items.length).toBeLessThanOrEqual(7)
  })

  it('plans nothing when the kcal goal is reached', () => {
    const r = planDay(recent, { kcal: -100, p: 20, f: -5, c: 10 })
    expect(r.items).toEqual([])
    expect(r.gaps[0]).toMatch(/already reached/)
  })

  it('reports a protein gap it cannot close', () => {
    const r = planDay([c('pasta', [158, 5.8, 0.9, 30.9], 100), c('bread', [260, 9, 3.6, 43], 50)], { kcal: 800, p: 120, f: 20, c: 100 })
    expect(r.gaps.some(g => g.startsWith('protein'))).toBe(true)
  })

  it('ignores macro goals that are not set', () => {
    const r = planDay(recent, { kcal: 600, p: null, f: null, c: null })
    expect(Math.abs(r.plan.kcal - 600)).toBeLessThan(120)
    expect(r.left_after.p).toBeNull()
  })

  it('grams are multiples of the portion step', () => {
    const r = planDay(recent, { kcal: 1386, p: 169, f: 20, c: 155 })
    for (const i of r.items) expect(i.grams % stepOf(recent.find(x => x.name === i.name)!.typical_g)).toBe(0)
  })
})

describe('mealsAhead', () => {
  it('starts after the last main meal logged; snack is always open', () => {
    expect(mealsAhead([])).toEqual(['breakfast', 'lunch', 'dinner', 'snack'])
    expect(mealsAhead(['breakfast'])).toEqual(['lunch', 'dinner', 'snack'])
    expect(mealsAhead(['breakfast', 'snack', 'dinner'])).toEqual(['snack'])
  })

  it('reaches for an older food or a staple only when recent foods cannot close protein', () => {
    const sweets = [c('tiramisu', [283, 4.6, 17, 26], 87, 'snack'), c('pasta, cooked', [158, 5.8, 0.9, 30.9], 150)]
    const staple: PlanCandidate = { ...c('chicken breast, boiled', [150, 30, 3, 0], 150, 'dinner'), tier: 3 }
    const t = { kcal: 900, p: 80, f: 25, c: 90 }
    const only = planDay(sweets, t, { ahead: ['dinner', 'snack'] })
    const both = planDay([...sweets, staple], t, { ahead: ['dinner', 'snack'] })
    expect(both.items.find(i => i.name === 'chicken breast, boiled')?.from).toBe('staple')
    expect(both.left_after.p!).toBeLessThan(only.left_after.p! - 30)
    // when recent foods already fit, the staple stays out
    const lean = c('skyr drink natural', [64, 7.6, 1.8, 4.3], 350, 'snack')
    const fine = planDay([lean, c('pasta, cooked', [158, 5.8, 0.9, 30.9], 150), staple], { kcal: 500, p: 35, f: 10, c: 60 }, { ahead: ['dinner', 'snack'] })
    expect(fine.items.some(i => i.from === 'staple')).toBe(false)
  })
})

describe('planDayV2 (whole past meals, then a top-up)', () => {
  // Vasyl's real 11–17 Nov 2026 foods; today: lavash breakfast, 250 g cottage cheese + serek for lunch
  const f = (name: string, per100: [number, number, number, number], typical_g: number, usual_meal: PlanCandidate['usual_meal'], extra: Partial<PlanCandidate> = {}): PlanCandidate =>
    ({ ...c(name, per100, typical_g, usual_meal), ...extra })
  const foods = [
    f('goulash', [140, 14, 7.5, 4], 220, 'dinner', { single: false }),
    f('rye bread', [250, 8.6, 3, 47], 35, 'lunch', { single: false }),
    f('gnocchi', [150, 4, 0.5, 33], 60, 'dinner', { single: false }),
    f('pasta, cooked', [155, 5.5, 0.8, 31], 130, 'dinner', { single: false }),
    f('bolognese', [140, 9, 9, 5], 105, 'dinner', { single: false }),
    f('turkey, cooked', [147, 30, 2, 0], 122, 'lunch'),
    f('brown rice', [125, 3.3, 0.7, 23.6], 67, 'lunch', { single: false }),
    f('cottage cheese', [86, 18, 0, 3.5], 250, 'lunch', { single: false }),
    f('skyr drink', [80, 6.5, 1.5, 10], 180, 'snack', { max_g: 270 }),
  ]
  const combos: PlanCombo[] = [
    { key: 'goulash', date: '2026-11-16', meal: 'dinner', count: 1, tier: 0, parts: [{ key: 'goulash', grams: 220 }, { key: 'rye bread', grams: 70 }, { key: 'gnocchi', grams: 60 }] },
    { key: 'bolo', date: '2026-11-12', meal: 'dinner', count: 1, tier: 1, parts: [{ key: 'pasta, cooked', grams: 130 }, { key: 'bolognese', grams: 105 }] },
    { key: 'turkey', date: '2026-11-11', meal: 'lunch', count: 1, tier: 1, parts: [{ key: 'turkey, cooked', grams: 122 }, { key: 'brown rice', grams: 67 }, { key: 'rye bread', grams: 40 }] },
  ]
  const target = { kcal: 1330, p: 110, f: 43, c: 147 }

  it('dinner is one of his past dinners, scaled as a whole; nothing is a pile of single foods', () => {
    const r = planDayV2(foods, combos, target, { ahead: ['dinner', 'snack'] })
    const dinner = r.items.filter(i => i.meal === 'dinner' && i.as_on)
    expect(dinner.length).toBeGreaterThanOrEqual(2)
    expect(new Set(dinner.map(i => i.as_on)).size).toBe(1)
    expect(r.items.filter(i => !i.as_on).length).toBeLessThanOrEqual(2)
    expect(Math.abs(r.plan.kcal - target.kcal)).toBeLessThan(250)
  })

  it('another variant is a different meal', () => {
    const a = planDayV2(foods, combos, target, { ahead: ['dinner', 'snack'], variant: 0 })
    const b = planDayV2(foods, combos, target, { ahead: ['dinner', 'snack'], variant: 1 })
    expect(a.variants).toBeGreaterThan(1)
    expect(b.variant).toBe(1)
    const meal = (r: typeof a) => r.items.filter(i => i.as_on).map(i => i.key).sort().join()
    expect(meal(a)).not.toBe(meal(b))
  })

  it('a meal mostly made of what he already ate today is pushed back', () => {
    const today = new Map([['cottage cheese', 250]])
    const withCottage: PlanCombo[] = [...combos, { key: 'cc', date: '2026-11-12', meal: 'dinner', count: 1, tier: 1, parts: [{ key: 'cottage cheese', grams: 250 }, { key: 'pasta, cooked', grams: 100 }] }]
    const r = planDayV2(foods, withCottage, target, { ahead: ['dinner', 'snack'], eatenToday: today })
    expect(r.items.map(i => i.key)).not.toContain('cottage cheese')
  })

  it('falls back to single foods when there are no past meals', () => {
    const r = planDayV2(recent, [], { kcal: 900, p: 80, f: 25, c: 90 }, { ahead: ['dinner', 'snack'] })
    expect(r.items.length).toBeGreaterThan(0)
    expect(r.variants).toBe(1)
  })
})
