import { describe, expect, it } from 'vitest'
import { recommendWater } from '../shared/water'

const none = { sex: null, heightCm: null, activity: null, trainingDays: null }

describe('recommendWater', () => {
  it('falls back to EFSA drinks by sex, then a middle default', () => {
    expect(recommendWater({ ...none, sex: 'm' }, null)).toMatchObject({ ml: 2000, basis: 'sex' })
    expect(recommendWater({ ...none, sex: 'f' }, null)).toMatchObject({ ml: 1600, basis: 'sex' })
    expect(recommendWater(none, null)).toMatchObject({ ml: 1800, basis: 'default' })
  })
  it('uses 24 ml/kg (30 ml/kg total water minus ~20% from food)', () => {
    expect(recommendWater({ ...none, sex: 'm', heightCm: 180 }, 80).ml).toBe(1900)
  })
  it('adds daily activity and the weekly average of training', () => {
    // 80 kg → 1920, active +300, 4 sessions × 500 / 7 ≈ 286 → 2506
    expect(recommendWater({ sex: 'm', heightCm: 180, activity: 'active', trainingDays: 4 }, 80).ml).toBe(2500)
  })
  it('caps the base weight at BMI 27 and clamps the result', () => {
    // 140 kg at 175 cm → ref 82.7 kg → 1985 → 2000
    expect(recommendWater({ ...none, heightCm: 175 }, 140).ml).toBe(2000)
    expect(recommendWater({ ...none, heightCm: 150 }, 40).ml).toBe(1500)
    expect(recommendWater({ sex: 'm', heightCm: 200, activity: 'physical', trainingDays: 7 }, 108).ml).toBe(3600)
  })
})
