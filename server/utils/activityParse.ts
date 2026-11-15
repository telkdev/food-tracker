/**
 * Parse what the phone sends into activity rows. Pure (no DB), tested in tests/activity.test.ts.
 *
 * Two body shapes are accepted on POST /api/ingest/health:
 *  1. HC Webhook (Android, Health Connect): { timestamp, app_version, steps: [{ count, start_time, end_time, metadata? }],
 *     active_calories: [{ calories, ... }], exercise: [{ type, start_time, end_time, duration_seconds, metadata? }],
 *     deleted: [{ type, id }] }. Sync is incremental and may resend records or buckets, so every row has a stable key:
 *     the Health Connect record id when there is one, else the bucket start instant. A resend replaces the row.
 *  2. Simple daily totals (iOS Shortcuts, Tasker, curl): { date, steps?, active_kcal? } or { days: [ ... ] }.
 *     One row per day and kind (key "day:<date>"); sending again replaces it.
 */

export type ActivityKind = 'steps' | 'active_kcal' | 'exercise'

export interface ActivityRow {
  kind: ActivityKind
  key: string
  date: string
  startAt: Date
  endAt: Date | null
  value: number
  label: string | null
  origin: string | null
  daily: boolean
}

export interface ParsedActivity {
  rows: ActivityRow[]
  /** Health Connect record ids removed on the phone (keys "id:<id>") */
  deletedKeys: string[]
  /** records skipped as malformed or out of range */
  skipped: number
  client: string | null
}

export const MAX_RECORDS = 50_000
const MAX_VALUE: Record<ActivityKind, number> = { steps: 200_000, active_kcal: 20_000, exercise: 24 * 60 }
const DAY = 86400_000

const localDateOf = (tz: string, d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown, max = 200) => typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null
const time = (v: unknown) => {
  if (typeof v !== 'string' && typeof v !== 'number') return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}
const isIso = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))

/** Keep data from roughly the last year, nothing from the future (clock skew: 1 day). */
function inRange(d: Date, now: Date) {
  return d.getTime() > now.getTime() - 400 * DAY && d.getTime() < now.getTime() + DAY
}

export function parseActivity(body: unknown, tz: string, now: Date = new Date()): ParsedActivity {
  const out: ParsedActivity = { rows: [], deletedKeys: [], skipped: 0, client: null }
  if (!isObj(body)) return out
  out.client = str(body.app_version, 60) ? `hcwebhook/${str(body.app_version, 60)}` : str(body.client, 60)

  const add = (kind: ActivityKind, rec: any, value: number | null, label: string | null = null) => {
    if (out.rows.length >= MAX_RECORDS) { out.skipped++; return }
    const start = time(rec?.start_time)
    const end = time(rec?.end_time)
    if (!start || value == null || value < 0 || value > MAX_VALUE[kind] || !inRange(start, now)) { out.skipped++; return }
    const id = str(rec?.metadata?.id, 120)
    const span = end ? end.getTime() - start.getTime() : 0
    out.rows.push({
      kind,
      key: id ? `id:${id}` : `t:${start.toISOString()}`,
      date: localDateOf(tz, start),
      startAt: start,
      endAt: end,
      value: Math.round(value * 10) / 10,
      label,
      origin: str(rec?.metadata?.data_origin, 120),
      // one record for a whole day (HC Webhook "daily" resolution, or an app that writes daily totals)
      daily: kind !== 'exercise' && span >= 20 * 3600_000,
    })
  }

  // ---- HC Webhook ----
  for (const r of Array.isArray(body.steps) ? body.steps : []) add('steps', r, num(r?.count))
  for (const r of Array.isArray(body.active_calories) ? body.active_calories : []) add('active_kcal', r, num(r?.calories))
  for (const r of Array.isArray(body.exercise) ? body.exercise : []) {
    const sec = num(r?.duration_seconds) ?? (() => {
      const s = time(r?.start_time), e = time(r?.end_time)
      return s && e ? (e.getTime() - s.getTime()) / 1000 : null
    })()
    if (sec != null && sec < 60) { out.skipped++; continue }
    add('exercise', r, sec == null ? null : sec / 60, str(r?.type, 60)?.toLowerCase() ?? null)
  }
  for (const d of Array.isArray(body.deleted) ? body.deleted : []) {
    const id = str(d?.id, 120)
    if (id && ['steps', 'active_calories', 'exercise'].includes(d?.type)) out.deletedKeys.push(`id:${id}`)
  }

  // ---- simple daily totals ----
  const days = Array.isArray(body.days) ? body.days : isIso(body.date) ? [body] : []
  for (const d of days) {
    if (!isObj(d) || !isIso(d.date)) { out.skipped++; continue }
    const start = new Date(`${d.date}T12:00:00Z`)
    if (!inRange(start, now)) { out.skipped++; continue }
    const both: [ActivityKind, unknown][] = [['steps', d.steps], ['active_kcal', d.active_kcal ?? d.activeKcal]]
    for (const [kind, raw] of both) {
      if (raw == null) continue
      const v = num(raw)
      if (v == null || v < 0 || v > MAX_VALUE[kind]) { out.skipped++; continue }
      out.rows.push({ kind, key: `day:${d.date}`, date: d.date, startAt: start, endAt: null, value: Math.round(v), label: null, origin: 'api', daily: true })
    }
  }

  // the same key twice in one payload (split payloads, resends): the last one wins
  const byKey = new Map<string, ActivityRow>()
  for (const r of out.rows) byKey.set(`${r.kind}|${r.key}`, r)
  out.rows = [...byKey.values()]
  return out
}

export interface DayActivity {
  date: string
  steps: number | null
  active_kcal: number | null
  /** minutes of recorded workouts */
  exercise_min: number
  workouts: { label: string | null, min: number }[]
}

/**
 * Day totals from stored rows. Buckets and records are summed; a whole-day row (simple format or daily
 * resolution) describes the same steps, so the larger of the two wins instead of adding up.
 */
export function sumDays(rows: { kind: string, date: string, value: number, daily: boolean, label: string | null }[]): DayActivity[] {
  const m = new Map<string, { parts: Record<'steps' | 'active_kcal', { sum: number, daily: number, any: boolean }>, workouts: { label: string | null, min: number }[] }>()
  for (const r of rows) {
    let d = m.get(r.date)
    if (!d) {
      d = { parts: { steps: { sum: 0, daily: 0, any: false }, active_kcal: { sum: 0, daily: 0, any: false } }, workouts: [] }
      m.set(r.date, d)
    }
    if (r.kind === 'exercise') { d.workouts.push({ label: r.label, min: Math.round(r.value) }); continue }
    if (r.kind !== 'steps' && r.kind !== 'active_kcal') continue
    const p = d.parts[r.kind]
    p.any = true
    if (r.daily) p.daily = Math.max(p.daily, r.value)
    else p.sum += r.value
  }
  const total = (p: { sum: number, daily: number, any: boolean }) => p.any ? Math.round(Math.max(p.sum, p.daily)) : null
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, d]) => ({
    date,
    steps: total(d.parts.steps),
    active_kcal: total(d.parts.active_kcal),
    exercise_min: d.workouts.reduce((a, w) => a + w.min, 0),
    workouts: d.workouts,
  }))
}

/** A day with fewer steps than this is treated as "phone left at home / no data", not as a lazy day. */
export const MIN_DAY_STEPS = 500

/** Average daily steps over the given days (only days with real data). */
export function stepsAverage(days: DayActivity[]) {
  const v = days.map(d => d.steps).filter((s): s is number => s != null && s >= MIN_DAY_STEPS)
  return v.length ? { avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length), days: v.length } : null
}
