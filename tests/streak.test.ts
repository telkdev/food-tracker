import { describe, expect, it } from 'vitest'
import { computeStreak, isMilestone, nextMilestone } from '../server/utils/streak'

const T = '2026-11-07'

describe('computeStreak', () => {
  it('is 0 with no entries', () => {
    expect(computeStreak([], T)).toMatchObject({ days: 0, today_logged: false, since: null, next_milestone: 10 })
  })
  it('counts consecutive days ending today', () => {
    expect(computeStreak(['2026-11-07', '2026-11-06', '2026-11-05', '2026-11-01'], T)).toMatchObject({ days: 3, today_logged: true, since: '2026-11-05' })
  })
  it('keeps yesterday\'s streak while today is not logged yet', () => {
    expect(computeStreak(['2026-11-06', '2026-11-05'], T)).toMatchObject({ days: 2, today_logged: false })
  })
  it('breaks after a missed full day', () => {
    expect(computeStreak(['2026-11-05', '2026-11-04'], T).days).toBe(0)
  })
  it('crosses month and DST boundaries', () => {
    const days = ['2026-11-02', '2026-11-01', '2026-10-31', '2026-10-30', '2026-10-25', '2026-10-24']
    expect(computeStreak(days, '2026-11-02').days).toBe(4)
    expect(computeStreak(['2026-10-26', '2026-10-25', '2026-10-24'], '2026-10-26').days).toBe(3)
  })
  it('ignores future dates', () => {
    expect(computeStreak(['2026-11-08', '2026-11-07'], T).days).toBe(1)
  })

  describe('carried-over streak', () => {
    const carry = { days: 52, until: '2026-11-06' }
    it('continues when the day after carry_until is logged', () => {
      expect(computeStreak(['2026-11-07'], T, carry)).toMatchObject({ days: 53, carried: 52, today_logged: true, since: '2026-09-16' })
    })
    it('still shows the carried streak on the next day before anything is logged', () => {
      expect(computeStreak([], T, carry)).toMatchObject({ days: 52, today_logged: false })
    })
    it('is lost once a day after carry_until is missed', () => {
      expect(computeStreak([], '2026-11-08', carry).days).toBe(0)
      expect(computeStreak(['2026-11-08'], '2026-11-08', carry).days).toBe(1)
    })
    it('does not double-count days logged both here and in the other app', () => {
      expect(computeStreak(['2026-11-05', '2026-11-06', '2026-11-07'], T, carry)).toMatchObject({ days: 53, carried: 50 })
    })
    it('extends further back when real entries precede the carried window', () => {
      expect(computeStreak(['2026-09-15', '2026-11-07'], T, carry).days).toBe(54)
    })
    it('counts a carry that ends today', () => {
      expect(computeStreak([], T, { days: 52, until: T })).toMatchObject({ days: 52, today_logged: false })
    })
  })

  it('flags milestones only when today is logged', () => {
    const run = ['2026-11-07', '2026-11-06', '2026-11-05', '2026-11-04', '2026-11-03', '2026-11-02', '2026-11-01', '2026-10-31', '2026-10-30', '2026-10-29']
    expect(computeStreak(run, T)).toMatchObject({ days: 10, milestone: true, next_milestone: 20 })
    expect(computeStreak(run.slice(1), T)).toMatchObject({ days: 9, milestone: false })
  })
})

describe('milestones', () => {
  it('10, 20, 30, 50, 100 … 300 by 50, 365, then every 100', () => {
    const list = Array.from({ length: 1000 }, (_, i) => i + 1).filter(isMilestone)
    expect(list.slice(0, 12)).toEqual([10, 20, 30, 50, 100, 150, 200, 250, 300, 365, 400, 500])
    expect(nextMilestone(52)).toBe(100)
    expect(nextMilestone(0)).toBe(10)
  })
})
