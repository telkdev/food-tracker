import { describe, expect, it } from 'vitest'
import { recommendTargets, weightTrend, type Profile } from '../shared/targets'

const base: Profile = { goalType: 'recomp', sex: 'm', birthYear: 1993, heightCm: 180, activity: 'light', trainingDays: 3, experience: 'new' }

describe('recommendTargets', () => {
  it('Mifflin-St Jeor maintenance and recomp goals for an 80 kg man', () => {
    const r = recommendTargets(base, 80, '2026-11-15')!
    // BMR = 800 + 1125 - 165 + 5 = 1765; × (1.35 + 0.075) = 2515
    expect(r.bmr).toBe(1765)
    expect(r.maintenance).toBe(2500)
    expect(r.kcal).toBe(2250) // −10%
    expect(r.p).toBe(160) // 2.0 g/kg
    expect(r.f).toBeGreaterThanOrEqual(56)
    expect(r.p * 4 + r.f * 9 + r.c * 4).toBeGreaterThan(r.kcal - 40)
    expect(r.p * 4 + r.f * 9 + r.c * 4).toBeLessThan(r.kcal + 40)
  })
  it('goal types', () => {
    const cut = recommendTargets({ ...base, goalType: 'cut' }, 80, '2026-11-15')!
    const bulk = recommendTargets({ ...base, goalType: 'bulk' }, 80, '2026-11-15')!
    expect(cut.kcal).toBeLessThan(bulk.kcal)
    expect(cut.p).toBe(175)
  })
  it('protein from a reference weight above BMI 27', () => {
    const r = recommendTargets(base, 120, '2026-11-15')!
    expect(r.bmi).toBeGreaterThan(36)
    expect(r.refKg).toBeCloseTo(87.5, 0)
    expect(r.p).toBe(175)
  })
  it('null when data is missing', () => {
    expect(recommendTargets({ ...base, sex: null }, 80, '2026-11-15')).toBeNull()
    expect(recommendTargets(base, null, '2026-11-15')).toBeNull()
  })
})

describe('weightTrend', () => {
  it('kg per week by least squares', () => {
    const pts = [{ date: '2026-11-01', kg: 82 }, { date: '2026-11-08', kg: 81.5 }, { date: '2026-11-15', kg: 81 }]
    expect(weightTrend(pts, '2026-11-15')!.perWeek).toBeCloseTo(-0.5, 2)
  })
  it('needs a week of span', () => {
    expect(weightTrend([{ date: '2026-11-13', kg: 80 }, { date: '2026-11-15', kg: 79 }], '2026-11-15')).toBeNull()
  })
})
