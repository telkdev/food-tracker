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

/** Lowercase, no diacritics (ó→o, ł→l, ё→е): so "twarog" finds "Twaróg". */
export function fold(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l').replace(/ё/g, 'е')
}

/** Every word of the query appears somewhere in the text, in any order, as part of a word. */
export function matchesWords(text: string, query: string) {
  const hay = fold(text)
  return fold(query).split(/[\s,]+/).filter(Boolean).every(w => hay.includes(w))
}

/** Share of energy from protein/fat/carbs (4/9/4 kcal per g), as whole percents summing to 100. Null when there is no macro energy. */
export function macroEnergySplit(p: number | null | undefined, f: number | null | undefined, c: number | null | undefined) {
  const e = [Math.max(0, p ?? 0) * 4, Math.max(0, f ?? 0) * 9, Math.max(0, c ?? 0) * 4]
  const total = e[0]! + e[1]! + e[2]!
  if (!(total > 0)) return null
  const raw = e.map(x => x / total * 100)
  const out = raw.map(Math.floor)
  let left = 100 - out.reduce((a, b) => a + b, 0)
  const order = raw.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0])
  for (const [, i] of order) { if (left <= 0) break; out[i]!++; left-- }
  return { p: out[0]!, f: out[1]!, c: out[2]! }
}
