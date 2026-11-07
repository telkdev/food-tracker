import type { Locale } from './i18n'

const nf = new Map<string, Intl.NumberFormat>()
function numberFormat(locale: Locale, digits: number) {
  const k = `${locale}:${digits}`
  if (!nf.has(k)) nf.set(k, new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-GB', { maximumFractionDigits: digits }))
  return nf.get(k)!
}

export function fmtNum(locale: Locale, n: number | null | undefined, digits = 0) {
  return numberFormat(locale, digits).format(Number.isFinite(n as number) ? (n as number) : 0)
}

/** Local kcal preview only; the server computes what is stored. */
export function preview(per100: { kcal: number, p: number, f: number, c: number }, grams: number) {
  const g = Number.isFinite(grams) && grams > 0 ? grams : 0
  return { kcal: per100.kcal * g / 100, p: per100.p * g / 100, f: per100.f * g / 100, c: per100.c * g / 100 }
}

/** "12,5" and "12.5" both parse (Polish/Russian keyboards type commas). */
export function parseDecimal(s: string | number | null | undefined): number {
  if (typeof s === 'number') return s
  const v = Number(String(s ?? '').trim().replace(',', '.'))
  return String(s ?? '').trim() === '' ? Number.NaN : v
}

// ---- dates: ISO calendar dates, arithmetic at noon UTC so DST never shifts the day ----
export function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function diffDays(a: string, b: string) {
  return Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400_000)
}

export function fmtDate(locale: Locale, iso: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-GB', { ...opts, timeZone: 'UTC' })
}

/** Same rule as server/utils/dates.ts mealFromTime, in Europe/Warsaw. */
export function mealNow(timeZone = 'Europe/Warsaw'): 'breakfast' | 'lunch' | 'dinner' | 'snack' {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
  if (h >= 5 && h < 11) return 'breakfast'
  if (h >= 11 && h < 16) return 'lunch'
  if (h >= 16 && h < 22) return 'dinner'
  return 'snack'
}

export function errMsg(e: any, fallback = 'Error') {
  return e?.data?.statusMessage || e?.statusMessage || e?.data?.message || e?.message || fallback
}
