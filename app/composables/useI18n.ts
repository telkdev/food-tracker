import { pickLocale, translate, type Locale, type MsgKey } from '~/utils/i18n'
import { fmtNum } from '~/utils/format'

export type LangPref = 'auto' | Locale

export function useLocale() {
  return useState<Locale>('locale', () => 'en')
}

/** t('key', params), n(number) and the active locale, all reactive. */
export function useT() {
  const locale = useLocale()
  const t = (key: MsgKey, params?: Record<string, string | number>) => translate(locale.value, key, params)
  const n = (v: number | null | undefined, digits = 0) => fmtNum(locale.value, v, digits)
  return { t, n, locale }
}

export function useLangPref() {
  return useCookie<LangPref>('lang', { default: () => 'auto', maxAge: 60 * 60 * 24 * 400, sameSite: 'lax' })
}

export function resolveLocale(pref: LangPref, browserLang: string | null | undefined): Locale {
  return pref === 'auto' ? pickLocale(browserLang) : pref
}
