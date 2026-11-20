import { describe, expect, it } from 'vitest'
import { allows, scopeOf } from '../server/utils/connections'

describe('diary access', () => {
  it('rights: any access reads; log needs can_log; edit needs can_log (own entries) or can_edit', () => {
    expect(allows(null, 'read')).toBe(false)
    expect(allows({ canLog: false, canEdit: false }, 'read')).toBe(true)
    expect(allows({ canLog: true, canEdit: false }, 'log')).toBe(true)
    expect(allows({ canLog: false, canEdit: true }, 'log')).toBe(false)
    expect(allows({ canLog: true, canEdit: false }, 'edit')).toBe(true)
    expect(allows({ canLog: false, canEdit: true }, 'edit')).toBe(true)
    expect(allows({ canLog: false, canEdit: false }, 'edit')).toBe(false)
  })
  it('switches diary only on diary routes, with the right each needs', () => {
    expect(scopeOf('GET', '/api/day')).toBe('read')
    expect(scopeOf('POST', '/api/entries')).toBe('log')
    expect(scopeOf('POST', '/api/water')).toBe('log')
    expect(scopeOf('POST', '/api/meals/abc/log')).toBe('log')
    expect(scopeOf('DELETE', '/api/entries/123')).toBe('edit')
    expect(scopeOf('PATCH', '/api/entries/123')).toBe('edit')
    expect(scopeOf('DELETE', '/api/water/123')).toBe('edit')
    // never: changing someone's settings, account, admin, products list edits, reports, preferences, access
    for (const [m, p] of [['PATCH', '/api/settings'], ['GET', '/api/account'], ['POST', '/api/admin/users'], ['DELETE', '/api/products/1'],
      ['PATCH', '/api/products/1'], ['GET', '/api/report.pdf'], ['PUT', '/api/preferences/x'], ['POST', '/api/meals'], ['GET', '/api/access'],
      ['PUT', '/api/access/granted/x'], ['GET', '/api/day/extra']] as const) expect(scopeOf(m, p)).toBe(null)
  })
})
