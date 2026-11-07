import { describe, expect, it } from 'vitest'
import { isAwakeHour, parseHours } from '../server/utils/keepAwake'

const TZ = 'Europe/Warsaw'

describe('parseHours', () => {
  it('parses a local hour window', () => {
    expect(parseHours('7-24')).toEqual({ from: 7, to: 24 })
    expect(parseHours(' 6 - 23 ')).toEqual({ from: 6, to: 23 })
  })
  it('treats off, empty and invalid windows as disabled', () => {
    expect(parseHours('off')).toBeNull()
    expect(parseHours('')).toBeNull()
    expect(parseHours(undefined)).toBeNull()
    expect(parseHours('10-7')).toBeNull()
    expect(parseHours('7-25')).toBeNull()
  })
})

describe('isAwakeHour', () => {
  const day = { from: 7, to: 24 }
  it('uses Warsaw time, not UTC', () => {
    expect(isAwakeHour(day, TZ, new Date('2026-11-07T06:30:00Z'))).toBe(true) // 07:30 CET
    expect(isAwakeHour(day, TZ, new Date('2026-11-07T05:30:00Z'))).toBe(false) // 06:30 CET
    expect(isAwakeHour(day, TZ, new Date('2026-07-01T05:30:00Z'))).toBe(true) // 07:30 CEST
  })
  it('stops at local midnight', () => {
    expect(isAwakeHour(day, TZ, new Date('2026-11-07T22:59:00Z'))).toBe(true) // 23:59
    expect(isAwakeHour(day, TZ, new Date('2026-11-07T23:01:00Z'))).toBe(false) // 00:01
  })
})
