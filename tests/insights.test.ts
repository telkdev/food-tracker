import { describe, expect, it } from 'vitest'
import { buildInsights, isLeanProtein, isLowProteinDense, isVegOrFruit, type InsightEntry } from '../server/utils/insights'

const food = (date: string, name: string, grams: number, per100: [number, number, number, number], meal: InsightEntry['meal'] = 'lunch', extra: Partial<InsightEntry> = {}): InsightEntry => {
  const [kcal, p, f, c] = per100
  return { date, meal, name, key: null, grams, per100: { kcal, p, f, c }, kcal: kcal * grams / 100, p: p * grams / 100, f: f * grams / 100, c: c * grams / 100, source: 'label', hour: 13, ...extra }
}
const addDays = (d: string, k: number) => new Date(Date.parse(`${d}T12:00:00Z`) + k * 86400_000).toISOString().slice(0, 10)
const TODAY = '2026-11-15'
const goal = { kcal: 2150, p: 200, f: 70, c: 200 }
const ids = (r: ReturnType<typeof buildInsights>) => r.insights.map(i => i.id)

// A day like Vasyl's recent ones: decent kcal, protein ~100 g, sweets, no veg
function sweetDay(date: string) {
  return [
    food(date, 'Twaróg chudy', 165, [86, 17, 0.5, 3.5], 'breakfast'),
    food(date, 'Тортилья', 70, [316, 9, 7, 55], 'breakfast'),
    food(date, 'Шинка', 50, [101, 19, 2.5, 1], 'breakfast'),
    food(date, 'Рис варёный', 200, [125, 2.6, 0.9, 26], 'lunch'),
    food(date, 'chicken breast, cooked', 120, [165, 31, 3.6, 0], 'lunch'),
    food(date, 'Knoppers', 80, [513, 9, 32, 48], 'snack'),
    food(date, 'Сгущёнка', 60, [322, 7, 8, 55], 'snack'),
    food(date, 'Ciasto Sacher', 100, [357, 3, 18, 45], 'dinner'),
  ]
}

describe('classifiers', () => {
  it('vegetables and fruit by name, not juice or cake', () => {
    expect(isVegOrFruit('Огурец свежий')).toBe(true)
    expect(isVegOrFruit('Pomidory koktajlowe')).toBe(true)
    expect(isVegOrFruit('яблоко')).toBe(true)
    expect(isVegOrFruit('Banana')).toBe(true)
    expect(isVegOrFruit('Сок яблочный')).toBe(false)
    expect(isVegOrFruit('Ciasto jabłkowe')).toBe(false)
    expect(isVegOrFruit('Skyr jogurt pitny wiśnia')).toBe(false)
    expect(isVegOrFruit('Масло сливочное')).toBe(false)
    expect(isVegOrFruit('Twaróg chudy')).toBe(false)
  })
  it('energy-dense low-protein vs lean protein', () => {
    expect(isLowProteinDense({ kcal: 513, p: 9, f: 32 })).toBe(true) // Knoppers
    expect(isLowProteinDense({ kcal: 884, p: 0, f: 100 })).toBe(false) // oil: a cooking fat, not a treat
    expect(isLowProteinDense({ kcal: 338, p: 25, f: 26 })).toBe(false) // cheese
    expect(isLeanProtein({ kcal: 86, p: 17, f: 0.5 })).toBe(true) // twaróg chudy
    expect(isLeanProtein({ kcal: 387, p: 77, f: 4.8 })).toBe(true) // whey
    expect(isLeanProtein({ kcal: 333, p: 13, f: 30 })).toBe(false) // sausages
  })
})

describe('buildInsights', () => {
  it('too few days: only the data note and the basics', () => {
    const r = buildInsights({ today: TODAY, goal, entries: sweetDay(addDays(TODAY, -1)) })
    expect(ids(r)).toEqual(['noData', 'basics_recomp', 'noWeight'])
  })

  it('low protein, treats, no veg; suggests his own lean protein foods', () => {
    const entries = Array.from({ length: 10 }, (_, i) => sweetDay(addDays(TODAY, -1 - i))).flat()
    const r = buildInsights({ today: TODAY, goal: { ...goal, f: 50 }, entries, streakDays: 10 })
    const got = ids(r)
    expect(got).toContain('proteinLow')
    expect(got).toContain('treats')
    expect(got).toContain('veg')
    expect(got).toContain('fatOver')
    expect(got).toContain('streak')
    expect(got).not.toContain('proteinOk')
    const low = r.insights.find(i => i.id === 'proteinLow')!
    expect(low.params.gap).toBeGreaterThan(80)
    expect(low.foods!.map(f => f.name)).toEqual(expect.arrayContaining(['Twaróg chudy', 'chicken breast, cooked']))
    expect(low.foods!.map(f => f.name)).not.toContain('Knoppers')
    const treats = r.insights.find(i => i.id === 'treats')!
    expect(treats.foods![0]!.name).toBe('Knoppers')
    // warnings first, info last
    expect(r.insights[0]!.level).toBe('warn')
    expect(r.insights.at(-1)!.level).toBe('info')
    expect(r.stats.complete_days).toBe(10)
  })

  it('today is not analysed and partial days are left out of averages', () => {
    const entries = [
      ...Array.from({ length: 5 }, (_, i) => sweetDay(addDays(TODAY, -1 - i))).flat(),
      food(addDays(TODAY, -6), 'coffee with milk', 200, [40, 2, 1.5, 4]), // 80 kcal: forgot to log
      ...sweetDay(TODAY),
    ]
    const r = buildInsights({ today: TODAY, goal, entries })
    expect(r.stats.complete_days).toBe(5)
    expect(r.stats.partial_days).toBe(1)
    expect(r.stats.logged_days).toBe(6)
    expect(ids(r)).toContain('fewDays')
  })

  it('protein drop between weeks (like 9–10 vs 13–14 Nov)', () => {
    const hi = (d: string) => [...sweetDay(d), food(d, 'whey', 60, [387, 77, 4.8, 9.7], 'snack'), food(d, 'chicken breast, cooked', 150, [165, 31, 3.6, 0], 'dinner')]
    const entries = [
      ...Array.from({ length: 6 }, (_, i) => hi(addDays(TODAY, -8 - i))).flat(),
      ...Array.from({ length: 6 }, (_, i) => sweetDay(addDays(TODAY, -1 - i))).flat(),
    ]
    const r = buildInsights({ today: TODAY, goal: { ...goal, p: null }, entries })
    const drop = r.insights.find(i => i.id === 'proteinDrop')
    expect(drop).toBeDefined()
    expect(Number(drop!.params.before) - Number(drop!.params.now)).toBeGreaterThan(40)
    expect(ids(r)).toContain('proteinNoGoal')
  })

  it('a clean recomp diet gets praise, not warnings', () => {
    const clean = (d: string) => [
      food(d, 'Skyr naturalny', 300, [64, 11, 0.2, 4], 'breakfast'),
      food(d, 'Owsianka, gotowana', 300, [70, 2.5, 1.5, 12], 'breakfast'),
      food(d, 'Banan', 120, [89, 1.1, 0.3, 23], 'breakfast'),
      food(d, 'chicken breast, cooked', 220, [165, 31, 3.6, 0], 'lunch'),
      food(d, 'Рис варёный', 200, [125, 2.6, 0.9, 26], 'lunch'),
      food(d, 'Огурцы и помидоры', 300, [18, 0.9, 0.2, 3.5], 'lunch'),
      food(d, 'Łosoś pieczony', 150, [206, 22, 12, 0], 'dinner'),
      food(d, 'Ziemniaki gotowane', 150, [86, 1.7, 0.1, 20], 'dinner'),
      food(d, 'Broccoli', 200, [35, 2.4, 0.4, 7], 'dinner'),
      food(d, 'whey', 40, [387, 77, 4.8, 9.7], 'snack'),
      food(d, 'Twaróg chudy', 250, [86, 17, 0.5, 3.5], 'snack'),
      food(d, 'Orzechy włoskie', 20, [654, 15, 65, 14], 'snack'),
    ]
    const entries = Array.from({ length: 14 }, (_, i) => clean(addDays(TODAY, -1 - i))).flat()
    const r = buildInsights({ today: TODAY, goal: { kcal: 2150, p: 180, f: 70, c: 200 }, entries })
    const got = ids(r)
    expect(r.insights.filter(i => i.level === 'warn')).toEqual([])
    expect(got).toContain('proteinOk')
    expect(got).toContain('kcalOk')
    expect(got).toContain('vegOk')
    expect(got).not.toContain('treats')
  })

  it('weekend surplus and late eating', () => {
    const entries: InsightEntry[] = []
    for (let i = 1; i <= 14; i++) {
      const d = addDays(TODAY, -i)
      const wd = new Date(`${d}T12:00:00Z`).getUTCDay()
      entries.push(...sweetDay(d))
      if (wd === 0 || wd === 6) entries.push(food(d, 'Pizza', 400, [266, 11, 10, 33], 'dinner', { hour: 22 }))
      entries.push(food(d, 'late snack', 200, [400, 5, 20, 50], 'snack', { hour: 23 }))
    }
    const got = ids(buildInsights({ today: TODAY, goal, entries }))
    expect(got).toContain('weekend')
    expect(got).toContain('late')
  })

  it('goal type changes the thresholds', () => {
    // 2350 kcal on a 2150 goal: +9%: over for recomp, fine for a bulk
    const day = (d: string) => [food(d, 'x', 1000, [235, 20, 6, 25])]
    const entries = Array.from({ length: 10 }, (_, i) => day(addDays(TODAY, -1 - i))).flat()
    expect(ids(buildInsights({ today: TODAY, goal, entries, goalType: 'recomp' }))).toContain('kcalOver')
    const bulk = buildInsights({ today: TODAY, goal, entries, goalType: 'bulk' })
    expect(ids(bulk)).toContain('kcalOk')
    expect(ids(bulk)).toContain('basics_bulk')
  })
})

describe('gaps', () => {
  it('days before the first entry are not missed; real gaps are', () => {
    const fresh = Array.from({ length: 8 }, (_, i) => sweetDay(addDays(TODAY, -1 - i))).flat()
    expect(ids(buildInsights({ today: TODAY, goal, entries: fresh }))).not.toContain('gaps')
    const holes = [0, 1, 4, 5, 8, 9, 12, 13].flatMap(i => sweetDay(addDays(TODAY, -1 - i)))
    const g = buildInsights({ today: TODAY, goal, entries: holes }).insights.find(i => i.id === 'gaps')
    expect(g?.params).toMatchObject({ missed: 6, days: 14 })
  })
})

describe('profile and weight rules', () => {
  const entries = Array.from({ length: 10 }, (_, i) => sweetDay(addDays(TODAY, -1 - i))).flat()
  const targets = { bmr: 1765, maintenance: 2500, kcal: 2250, p: 160, f: 65, c: 270, refKg: 80, bmi: 24.7, pPerKg: 2 }
  it('a 200 g protein goal at 80 kg is flagged as higher than needed', () => {
    const r = buildInsights({ today: TODAY, goal, entries, weightKg: 80, targets, weights: [{ date: TODAY, kg: 80 }] })
    const hi = r.insights.find(i => i.id === 'proteinGoalHigh')
    expect(hi?.params).toMatchObject({ goal: 200, rec: 160, perKg: 2.5 })
    expect(ids(r)).not.toContain('noWeight')
  })
  it('weight trend for recomp: losing 0.5 kg a week is a cut', () => {
    const weights = [{ date: addDays(TODAY, -14), kg: 81 }, { date: addDays(TODAY, -7), kg: 80.5 }, { date: addDays(TODAY, -1), kg: 80 }]
    const r = buildInsights({ today: TODAY, goal, entries, weightKg: 80, weights })
    expect(ids(r)).toContain('weightDown_recomp')
  })
  it('stale weigh-in asks to weigh again', () => {
    const r = buildInsights({ today: TODAY, goal, entries, weightKg: 80, weights: [{ date: addDays(TODAY, -12), kg: 80 }] })
    expect(ids(r)).toContain('weighIn')
  })
})
