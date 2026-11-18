import { describe, expect, it } from 'vitest'
import { nutrientSources } from '../app/utils/sources'
import type { Entry, Meal } from '../app/utils/types'

const e = (name: string, grams: number, per100: Entry['per100'], extra: Partial<Entry> = {}): Entry => ({
  id: name + grams, name, grams, per100,
  kcal: per100.kcal * grams / 100, p: per100.p * grams / 100, f: per100.f * grams / 100, c: per100.c * grams / 100,
  fiber: per100.fiber != null ? per100.fiber * grams / 100 : undefined,
  sugar: per100.sugar != null ? per100.sugar * grams / 100 : undefined,
  salt: per100.salt != null ? per100.salt * grams / 100 : undefined,
  source: 'label', note: null, product_id: null, logged_at: '', ...extra,
})
const day = (m: Partial<Record<Meal, Entry[]>>) => ({
  meals: Object.fromEntries((['breakfast', 'lunch', 'dinner', 'snack'] as Meal[]).map(k => [k, { totals: { kcal: 0, p: 0, f: 0, c: 0 }, entries: m[k] ?? [] }])) as never,
})

describe('nutrientSources', () => {
  const apple = { kcal: 52, p: 0.3, f: 0.2, c: 14, fiber: 2.4, sugar: 10, salt: 0 }
  const chicken = { kcal: 165, p: 31, f: 3.6, c: 0, fiber: 0, sugar: 0, salt: 0.2 }
  const bread = { kcal: 250, p: 9, f: 3, c: 45 }

  it('sorts by contribution and computes shares', () => {
    const b = nutrientSources(day({ breakfast: [e('Apple', 200, apple)], lunch: [e('Chicken', 150, chicken), e('Bread', 50, bread)] }), 'p')
    expect(b.items.map(i => i.name)).toEqual(['Chicken', 'Bread', 'Apple'])
    expect(b.total).toBeCloseTo(46.5 + 4.5 + 0.6)
    expect(b.items.reduce((s, i) => s + i.share, 0)).toBeCloseTo(1)
  })

  it('merges the same food from several meals', () => {
    const b = nutrientSources(day({ breakfast: [e('Apple', 100, apple)], snack: [e('apple ', 150, apple)] }), 'sugar')
    expect(b.items).toHaveLength(1)
    expect(b.items[0]).toMatchObject({ g: 25, grams: 250, times: 2, meals: ['breakfast', 'snack'], share: 1 })
  })

  it('counts foods with zero and with no data separately', () => {
    const b = nutrientSources(day({ lunch: [e('Apple', 100, apple), e('Chicken', 100, chicken), e('Bread', 100, bread)] }), 'fiber')
    expect(b.items.map(i => i.name)).toEqual(['Apple'])
    expect(b.zero).toBe(1)
    expect(b.unknown).toEqual({ count: 1, kcal: 250 })
  })
})
