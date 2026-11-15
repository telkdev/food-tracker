import { describe, expect, it } from 'vitest'
import { mapNutriments } from '../server/utils/off'

describe('Open Food Facts fiber / sugar / salt', () => {
  const base = { 'energy-kcal_100g': 380, 'proteins_100g': 13, 'fat_100g': 7, 'carbohydrates_100g': 60 }

  it('maps fiber, sugars and salt when present', () => {
    expect(mapNutriments({ ...base, fiber_100g: 10, sugars_100g: 1.2, salt_100g: 0.02 }))
      .toEqual({ kcal: 380, p: 13, f: 7, c: 60, fiber: 10, sugar: 1.2, salt: 0.02 })
  })

  it('leaves unknown extras out instead of 0', () => {
    expect(mapNutriments(base)).toEqual({ kcal: 380, p: 13, f: 7, c: 60 })
    expect(mapNutriments({ ...base, fiber_100g: '' })).toEqual({ kcal: 380, p: 13, f: 7, c: 60 })
  })

  it('derives salt from sodium', () => {
    expect(mapNutriments({ ...base, sodium_100g: 0.4 })!.salt).toBe(1)
  })

  it('drops values that break sanity rules', () => {
    const r = mapNutriments({ ...base, sugars_100g: 75, fiber_100g: -1, salt_100g: 140 })!
    expect(r.sugar).toBeUndefined()
    expect(r.fiber).toBeUndefined()
    expect(r.salt).toBeUndefined()
  })
})
