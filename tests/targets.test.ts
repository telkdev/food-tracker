import { describe, expect, it } from 'vitest'
import { recommendTargets, stepsFactor, weightTrend, type Profile } from '../shared/targets'

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
  it('steps replace the questionnaire activity after 7 days of data', () => {
    expect(stepsFactor(3000)).toBe(1.2)
    expect(stepsFactor(6000)).toBe(1.35)
    expect(stepsFactor(12000)).toBe(1.65)
    expect(stepsFactor(30000)).toBe(1.75)
    expect(stepsFactor(500)).toBe(1.2)
    const q = recommendTargets(base, 80, '2026-11-15')!
    expect(q.activitySource).toBe('questionnaire')
    // too few days: questionnaire still wins
    expect(recommendTargets(base, 80, '2026-11-15', { avg: 12000, days: 4 })!.maintenance).toBe(q.maintenance)
    const s = recommendTargets(base, 80, '2026-11-15', { avg: 12000, days: 10 })!
    expect(s.activitySource).toBe('steps')
    expect(s.avgSteps).toBe(12000)
    expect(s.factor).toBeCloseTo(1.725, 3)
    expect(s.maintenance).toBeGreaterThan(q.maintenance)
    // steps cover a missing activity answer
    expect(recommendTargets({ ...base, activity: null }, 80, '2026-11-15', { avg: 8000, days: 14 })).not.toBeNull()
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
