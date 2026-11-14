import { describe, expect, it } from 'vitest'
import { messages, pickLocale, translate } from '../app/utils/i18n'

describe('pickLocale', () => {
  it('maps browser languages', () => {
    expect(pickLocale('uk-UA')).toBe('uk')
    expect(pickLocale('uk,ru;q=0.9')).toBe('uk')
    expect(pickLocale('ru-RU')).toBe('ru')
    expect(pickLocale('be')).toBe('ru')
    expect(pickLocale('pl-PL')).toBe('en')
    expect(pickLocale(undefined)).toBe('en')
  })
})

describe('messages', () => {
  it('every locale has every key, non-empty, with the same placeholders', () => {
    const keys = Object.keys(messages.en) as (keyof typeof messages.en)[]
    for (const l of ['ru', 'uk'] as const) {
      for (const k of keys) {
        expect(messages[l][k], `${l}.${k}`).toBeTruthy()
        const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join()
        expect(ph(messages[l][k]), `${l}.${k}`).toBe(ph(messages.en[k]))
      }
    }
  })
  it('translates Ukrainian', () => {
    expect(translate('uk', 'addTo', { meal: 'Обід' })).toBe('Додати: Обід')
  })
})
