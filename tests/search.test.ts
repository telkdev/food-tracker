import { describe, expect, it } from 'vitest'
import { fold, matchesWords } from '../app/utils/format'

describe('client search matching', () => {
  it('ignores diacritics', () => {
    expect(fold('Twaróg PÓŁTŁUSTY')).toBe('twarog poltlusty')
    expect(matchesWords('Twaróg półtłusty', 'twarog')).toBe(true)
  })
  it('matches parts of words in any order', () => {
    expect(matchesWords('Twaróg półtłusty Mlekovita', 'polt twar')).toBe(true)
    expect(matchesWords('Twaróg półtłusty', 'twar chudy')).toBe(false)
  })
  it('handles Cyrillic', () => {
    expect(matchesWords('Банан, сырой', 'бан')).toBe(true)
  })
})
