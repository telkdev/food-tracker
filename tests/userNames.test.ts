import { describe, expect, it } from 'vitest'
import { displayName, parseUserNames } from '../server/utils/userNames'

describe('display names', () => {
  it('parses NUXT_USER_NAMES', () => {
    expect(parseUserNames(' owner:Василь , Nadia:Надя,bad,dima: ')).toEqual({ owner: 'Василь', nadia: 'Надя' })
  })
  it('falls back to capitalised login, owner to Вася', () => {
    expect(displayName('nadia', '')).toBe('Nadia')
    expect(displayName('owner', undefined)).toBe('Вася')
    expect(displayName('nadia', 'nadia:Надя')).toBe('Надя')
    expect(displayName('owner', 'owner:Vasyl')).toBe('Vasyl')
  })
})
