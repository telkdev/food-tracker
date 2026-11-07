import { describe, expect, it } from 'vitest'
import { inKeepAwakeWindow } from '../server/utils/keepAwake'

describe('keep-awake window (08:30–22:00 Warsaw)', () => {
  it('winter, CET = UTC+1', () => {
    expect(inKeepAwakeWindow(new Date('2026-01-15T07:29:00Z'))).toBe(false) // 08:29
    expect(inKeepAwakeWindow(new Date('2026-01-15T07:30:00Z'))).toBe(true) // 08:30
    expect(inKeepAwakeWindow(new Date('2026-01-15T20:59:00Z'))).toBe(true) // 21:59
    expect(inKeepAwakeWindow(new Date('2026-01-15T21:00:00Z'))).toBe(false) // 22:00
  })
  it('summer, CEST = UTC+2', () => {
    expect(inKeepAwakeWindow(new Date('2026-07-15T06:29:00Z'))).toBe(false)
    expect(inKeepAwakeWindow(new Date('2026-07-15T06:30:00Z'))).toBe(true)
    expect(inKeepAwakeWindow(new Date('2026-07-15T19:59:00Z'))).toBe(true)
    expect(inKeepAwakeWindow(new Date('2026-07-15T20:00:00Z'))).toBe(false)
  })
})
