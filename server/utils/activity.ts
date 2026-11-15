import { and, asc, between, eq, inArray, isNull, sql } from 'drizzle-orm'
import { parseActivity, stepsAverage, sumDays, type DayActivity } from './activityParse'

const addDaysIso = (d: string, k: number) => new Date(Date.parse(`${d}T12:00:00Z`) + k * 86400_000).toISOString().slice(0, 10)

// ---------- ingest token (one per user; the phone app sends it as a header) ----------

const TOKEN_PREFIX = 'fti'

/** New token for the phone; replaces the old one (the old one stops working at once). Shown only here. */
export async function rotateIngestToken(uid: string) {
  const token = newToken(TOKEN_PREFIX)
  const t = schema.ingestTokens
  await useDb().insert(t).values({ userId: uid, tokenHash: sha256(token) })
    .onConflictDoUpdate({ target: t.userId, set: { tokenHash: sha256(token), createdAt: new Date(), lastUsedAt: null, lastClient: null } })
  return token
}

export async function revokeIngestToken(uid: string) {
  await useDb().delete(schema.ingestTokens).where(eq(schema.ingestTokens.userId, uid))
}

export async function ingestStatus(uid: string) {
  const t = schema.ingestTokens
  const a = schema.activitySamples
  const [[row], [last]] = await Promise.all([
    useDb().select().from(t).where(eq(t.userId, uid)),
    useDb().select({ at: sql<string | null>`max(${a.updatedAt})` }).from(a).where(eq(a.userId, uid)),
  ])
  return {
    has_token: !!row,
    created_at: row?.createdAt ?? null,
    last_used_at: row?.lastUsedAt ?? null,
    last_client: row?.lastClient ?? null,
    last_data_at: last?.at ?? null,
  }
}

/** Token from `Authorization: Bearer fti_…` or `X-Api-Key: fti_…` → active user id, or null. */
export async function ingestUser(header: { authorization?: string, apiKey?: string }) {
  const raw = (header.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? header.apiKey ?? '').trim()
  if (!raw.startsWith(`${TOKEN_PREFIX}_`) || raw.length > 100) return null
  const t = schema.ingestTokens
  const u = schema.users
  const [row] = await useDb().select({ uid: t.userId }).from(t)
    .innerJoin(u, eq(u.id, t.userId))
    .where(and(eq(t.tokenHash, sha256(raw)), isNull(u.disabledAt)))
  return row?.uid ?? null
}

// ---------- samples ----------

export async function ingestActivity(uid: string, body: unknown) {
  const s = await getSettings(uid)
  const parsed = parseActivity(body, s.timezone)
  const db = useDb()
  const a = schema.activitySamples
  const now = new Date()
  for (let k = 0; k < parsed.rows.length; k += 500) {
    const chunk = parsed.rows.slice(k, k + 500).map(r => ({ userId: uid, ...r, updatedAt: now }))
    await db.insert(a).values(chunk).onConflictDoUpdate({
      target: [a.userId, a.kind, a.key],
      set: {
        date: sql`excluded.date`, startAt: sql`excluded.start_at`, endAt: sql`excluded.end_at`, value: sql`excluded.value`,
        label: sql`excluded.label`, origin: sql`excluded.origin`, daily: sql`excluded.daily`, updatedAt: now,
      },
    })
  }
  let deleted = 0
  for (let k = 0; k < parsed.deletedKeys.length; k += 500) {
    const res = await db.delete(a).where(and(eq(a.userId, uid), inArray(a.key, parsed.deletedKeys.slice(k, k + 500)))).returning({ k: a.key })
    deleted += res.length
  }
  await db.update(schema.ingestTokens).set({ lastUsedAt: now, lastClient: parsed.client }).where(eq(schema.ingestTokens.userId, uid))
  const today = localDate(s.timezone)
  const [day] = await getActivityDays(uid, today, today)
  return { ok: true, saved: parsed.rows.length, deleted, skipped: parsed.skipped, today: day ?? null }
}

/** Per-day activity for a date range (inclusive); only days that have data. */
export async function getActivityDays(uid: string, from: string, to: string): Promise<DayActivity[]> {
  const a = schema.activitySamples
  const rows = await useDb().select({ kind: a.kind, date: a.date, value: a.value, daily: a.daily, label: a.label })
    .from(a).where(and(eq(a.userId, uid), between(a.date, from, to))).orderBy(asc(a.startAt))
  return sumDays(rows)
}

/** Average steps of the 14 days before today (today is still going): feeds the activity factor of the norms. */
export async function getStepsSummary(uid: string, today: string) {
  const days = await getActivityDays(uid, addDaysIso(today, -14), addDaysIso(today, -1))
  return { days, average: stepsAverage(days) }
}
