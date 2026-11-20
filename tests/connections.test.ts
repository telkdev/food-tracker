import { describe, expect, it } from 'vitest'
import { inDiaryScope, pair } from '../server/utils/connections'

describe('connections', () => {
  it('stores a pair once, in order', () => {
    expect(pair('owner', 'nadia')).toEqual({ userA: 'nadia', userB: 'owner' })
    expect(pair('nadia', 'owner')).toEqual({ userA: 'nadia', userB: 'owner' })
  })
  it('switches diary only on diary routes', () => {
    expect(inDiaryScope('GET', '/api/day')).toBe(true)
    expect(inDiaryScope('POST', '/api/entries')).toBe(true)
    expect(inDiaryScope('DELETE', '/api/entries/123')).toBe(true)
    expect(inDiaryScope('POST', '/api/water')).toBe(true)
    expect(inDiaryScope('POST', '/api/meals/abc/log')).toBe(true)
    // never: changing someone's settings, account, admin, products list edits, reports, preferences
    expect(inDiaryScope('PATCH', '/api/settings')).toBe(false)
    expect(inDiaryScope('GET', '/api/account')).toBe(false)
    expect(inDiaryScope('POST', '/api/admin/users')).toBe(false)
    expect(inDiaryScope('DELETE', '/api/products/123')).toBe(false)
    expect(inDiaryScope('PATCH', '/api/products/123')).toBe(false)
    expect(inDiaryScope('GET', '/api/report.pdf')).toBe(false)
    expect(inDiaryScope('PUT', '/api/preferences/x')).toBe(false)
    expect(inDiaryScope('POST', '/api/meals')).toBe(false)
    expect(inDiaryScope('GET', '/api/connections')).toBe(false)
    expect(inDiaryScope('GET', '/api/day/extra')).toBe(false)
  })
})
