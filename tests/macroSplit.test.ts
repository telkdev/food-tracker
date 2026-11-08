import { describe, expect, it } from 'vitest'
import { macroEnergySplit } from '../app/utils/format'

describe('macroEnergySplit', () => {
  it('weights fat by 9 kcal/g, not by grams', () => {
    // 10 g of each: 40 / 90 / 40 kcal
    expect(macroEnergySplit(10, 10, 10)).toEqual({ p: 24, f: 53, c: 23 })
  })
  it('always sums to 100', () => {
    for (const [p, f, c] of [[1, 1, 1], [3.3, 0.7, 12.1], [25, 0.2, 0], [0.1, 0, 99]]) {
      const s = macroEnergySplit(p, f, c)!
      expect(s.p + s.f + s.c).toBe(100)
    }
  })
  it('returns null when there is nothing to split (water, black coffee)', () => {
    expect(macroEnergySplit(0, 0, 0)).toBeNull()
    expect(macroEnergySplit(null, null, null)).toBeNull()
  })
})
