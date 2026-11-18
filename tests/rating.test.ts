import { describe, expect, it } from 'vitest'
import { dayScore, kcalScore, proteinGoalOf, proteinScore, rank, topFoods, weekScore } from '../server/utils/rating'

describe('rating score', () => {
  it('kcal: full marks near the goal, less when far under or over', () => {
    expect(kcalScore(2000, 2000)).toBe(100)
    expect(kcalScore(1800, 2000)).toBe(100)
    expect(kcalScore(2100, 2000)).toBe(100)
    expect(kcalScore(800, 2000)).toBe(0)
    expect(kcalScore(2800, 2000)).toBe(0)
    // eating less is not "better"
    expect(kcalScore(1200, 2000)).toBeLessThan(kcalScore(2000, 2000))
    expect(kcalScore(1300, 2000)).toBe(50)
  })
  it('protein: share of goal, capped', () => {
    expect(proteinScore(150, 150)).toBe(100)
    expect(proteinScore(200, 150)).toBe(100)
    expect(proteinScore(75, 150)).toBe(50)
  })
  it('protein goal falls back to 25% of kcal', () => {
    expect(proteinGoalOf(null, 2400)).toEqual({ g: 150, auto: true })
    expect(proteinGoalOf(180, 2400)).toEqual({ g: 180, auto: false })
  })
  it('day and week', () => {
    expect(dayScore(undefined, 2000, 150)).toBeNull()
    expect(dayScore({ kcal: 0, p: 0, entries: 0 }, 2000, 150)).toBeNull()
    expect(dayScore({ kcal: 2000, p: 150, entries: 5 }, 2000, 150)).toBe(100)
    expect(dayScore({ kcal: 2000, p: 75, entries: 5 }, 2000, 150)).toBe(80)
    expect(weekScore([100, 100, null, null, null, null, null])).toBe(29)
  })
  it('top foods merge names and sort by kcal', () => {
    expect(topFoods([{ name: 'Rice', kcal: 300 }, { name: 'rice ', kcal: 200 }, { name: 'Egg', kcal: 400 }, { name: 'Tea', kcal: 1 }], 2)).toEqual(['Rice', 'Egg'])
  })
  it('ranks best first, shares ties, unscored last', () => {
    const r = rank([
      { id: 'a', name: 'A', score: 70, streak: 1 },
      { id: 'b', name: 'B', score: null, streak: 9 },
      { id: 'c', name: 'C', score: 90, streak: 0 },
      { id: 'd', name: 'D', score: 70, streak: 3 },
    ])
    expect(r.map(u => [u.id, u.rank])).toEqual([['c', 1], ['d', 2], ['a', 2], ['b', null]])
  })
})
