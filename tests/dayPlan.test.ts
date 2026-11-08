import { describe, expect, it } from 'vitest'
import { mealsAhead, planDay, stepOf, type PlanCandidate } from '../server/utils/dayPlan'

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
})
