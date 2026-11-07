import { describe, expect, it } from 'vitest'
import { isIsoDate, localDate, mealFromTime } from '../server/utils/dates'

const TZ = 'Europe/Warsaw'

describe('localDate', () => {
  it('uses the Warsaw date, not UTC, just after local midnight', () => {
    // 2026-11-07 23:30 UTC = 2026-11-08 00:30 in Warsaw (CET, UTC+1)
    expect(localDate(TZ, new Date('2026-11-07T23:30:00Z'))).toBe('2026-11-08')
  })
  it('handles summer time (CEST, UTC+2)', () => {
    expect(localDate(TZ, new Date('2026-07-01T22:30:00Z'))).toBe('2026-07-02')
  })
})

describe('mealFromTime', () => {
  it('maps local hours to meals', () => {
    expect(mealFromTime(TZ, new Date('2026-11-07T07:00:00Z'))).toBe('breakfast') // 08:00
    expect(mealFromTime(TZ, new Date('2026-11-07T12:00:00Z'))).toBe('lunch') // 13:00
    expect(mealFromTime(TZ, new Date('2026-11-07T18:00:00Z'))).toBe('dinner') // 19:00
    expect(mealFromTime(TZ, new Date('2026-11-07T22:30:00Z'))).toBe('snack') // 23:30
  })
})

describe('isIsoDate', () => {
  it('rejects impossible dates', () => {
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('2026-11-07')).toBe(true)
  })
})
