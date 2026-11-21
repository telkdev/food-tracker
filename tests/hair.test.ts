import { describe, expect, it } from 'vitest'
import { hairReport, hairStreak, hasHair, plannedIn, todayProgress, weekProgress, weekStart } from '../shared/hair'

const r = (id: string, per_week: number, created_on = '2026-01-01') => ({ id, name: id, per_week, created_on })

describe('hair care', () => {
  it('is only for Nadia for now', () => {
    expect(hasHair('nadia')).toBe(true)
    expect(hasHair('owner')).toBe(false)
    expect(hasHair(undefined)).toBe(false)
  })
  it('weeks start on Monday', () => {
    expect(weekStart('2026-11-21')).toBe('2026-11-16') // Saturday
    expect(weekStart('2026-11-16')).toBe('2026-11-16')
    expect(weekStart('2026-11-22')).toBe('2026-11-16') // Sunday
  })
  it('week progress caps extra checks at the target', () => {
    const routines = [r('oil', 7), r('mask', 1)]
    const logs = [
      { routine_id: 'oil', date: '2026-11-16' }, { routine_id: 'oil', date: '2026-11-17' },
      { routine_id: 'mask', date: '2026-11-17' }, { routine_id: 'mask', date: '2026-11-19' },
      { routine_id: 'oil', date: '2026-11-15' }, // last week
    ]
    const w = weekProgress(routines, logs, '2026-11-21')
    expect(w.target).toBe(8)
    expect(w.done).toBe(3)
    expect(w.pct).toBe(38)
    expect(w.routines.find(x => x.id === 'mask')!.done).toBe(2)
  })
  it('streak keeps yesterday alive until today is done', () => {
    expect(hairStreak(['2026-11-19', '2026-11-20'], '2026-11-21')).toEqual({ days: 2, today_done: false })
    expect(hairStreak(['2026-11-19', '2026-11-20', '2026-11-21'], '2026-11-21')).toEqual({ days: 3, today_done: true })
    expect(hairStreak(['2026-11-18'], '2026-11-21').days).toBe(0)
  })
  it('plan counts from the day a routine was added', () => {
    expect(plannedIn(r('a', 7, '2026-11-15'), '2026-11-01', '2026-11-21')).toBe(7)
    expect(plannedIn(r('a', 3), '2026-11-01', '2026-11-28')).toBe(12)
    expect(plannedIn(r('a', 3, '2026-12-01'), '2026-11-01', '2026-11-28')).toBe(0)
  })
  it('report: adherence and per-day checks', () => {
    const rep = hairReport([r('oil', 7)], [{ routine_id: 'oil', date: '2026-11-20' }, { routine_id: 'oil', date: '2026-11-21' }], '2026-11-15', '2026-11-21')
    expect(rep.period_days).toBe(7)
    expect(rep.care_days).toBe(2)
    expect(rep.pct).toBe(29)
    expect(rep.days.at(-1)).toEqual({ date: '2026-11-21', checks: 1 })
  })
  it('report: a back-dated check moves the plan start', () => {
    const rep = hairReport([r('oil', 7, '2026-11-21')], [{ routine_id: 'oil', date: '2026-11-20' }, { routine_id: 'oil', date: '2026-11-21' }], '2026-11-15', '2026-11-21')
    expect(rep.routines[0]).toMatchObject({ done: 2, planned: 2, pct: 100 })
    expect(rep.pct).toBe(100)
  })
})

describe('today progress', () => {
  it('counts daily routines and weekly ones still open this week', () => {
    expect(todayProgress({ routines: [
      { id: 'am', done: 3, target: 7, done_today: true },
      { id: 'pm', done: 2, target: 7, done_today: false },
      { id: 'mask', done: 1, target: 1, done_today: false }, // met this week: not due
      { id: 'massage', done: 1, target: 3, done_today: false },
    ] })).toEqual({ done: 1, due: 3, pct: 33 })
  })
})
