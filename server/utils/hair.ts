import { and, asc, eq, gte, isNull, lte } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { z } from 'zod'
import type { HairRoutine } from '../db/schema'
import { addDaysIso, hairReport, hairStreak, hasHair, todayProgress, weekProgress, type HairRoutineLike } from '../../shared/hair'

/** Hair care is per user and only for shared/hair.ts HAIR_USERS. Always the logged-in user, never x-diary-for. */
export function requireHair(event: H3Event): string {
  const uid = event.context.actorUid || uidOf(event)
  if (!hasHair(uid)) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return uid
}

const duration = z.number().int().min(1).max(240).nullable().optional()
export const hairRoutineSchema = z.object({
  name: z.string().trim().min(1).max(80),
  per_week: z.number().int().min(1).max(7),
  duration_min: duration,
  duration_max: duration,
  note: z.string().trim().max(300).nullable().optional(),
})
export const hairRoutinePatchSchema = hairRoutineSchema.partial().extend({ sort: z.number().int().min(0).max(1000).optional() })
export const hairCheckSchema = z.object({
  routine_id: z.uuid(),
  date: isoDate.optional(),
  done: z.boolean().default(true),
  note: z.string().trim().max(300).nullable().optional(),
})
export type HairRoutineInput = z.infer<typeof hairRoutineSchema>
export type HairCheckInput = z.infer<typeof hairCheckSchema>

const R = () => schema.hairRoutines
const L = () => schema.hairLogs

/** min ≤ max; a single value is stored as min. */
function durations(i: { duration_min?: number | null, duration_max?: number | null }) {
  let a = i.duration_min ?? null
  let b = i.duration_max ?? null
  if (a == null && b != null) [a, b] = [b, null]
  if (a != null && b != null && b < a) [a, b] = [b, a]
  if (a != null && b === a) b = null
  return { durationMin: a, durationMax: b }
}

async function activeRoutines(uid: string) {
  return useDb().select().from(R()).where(and(eq(R().userId, uid), isNull(R().archivedAt))).orderBy(asc(R().sort), asc(R().createdAt))
}

async function ownRoutine(uid: string, id: string) {
  const [r] = await useDb().select().from(R()).where(and(eq(R().userId, uid), eq(R().id, id), isNull(R().archivedAt)))
  if (!r) throw createError({ statusCode: 404, statusMessage: 'Routine not found' })
  return r
}

const like = (r: HairRoutine): HairRoutineLike => ({ id: r.id, name: r.name, per_week: r.perWeek, created_on: r.createdOn })
const pub = (r: HairRoutine) => ({
  id: r.id, name: r.name, per_week: r.perWeek, duration_min: r.durationMin, duration_max: r.durationMax, note: r.note, created_on: r.createdOn,
})

/**
 * Everything the tab needs: routines with today's check and this week's count, week progress, streak,
 * and a report for the last `days` days (7..365, ending today).
 */
export async function getHair(uid: string, days = 28) {
  const s = await getSettings(uid)
  const today = localDate(s.timezone)
  const span = Math.max(7, Math.min(365, Math.round(days)))
  const from = addDaysIso(today, -(span - 1))
  // streak may reach further back than the report; a year is plenty
  const since = addDaysIso(today, -366)
  const [routines, logs] = await Promise.all([
    activeRoutines(uid),
    useDb().select({ routine_id: L().routineId, date: L().date, note: L().note }).from(L())
      .where(and(eq(L().userId, uid), gte(L().date, since), lte(L().date, today))),
  ])
  const ids = new Set(routines.map(r => r.id))
  // archived routines still count for the streak (care was done), not for progress or the plan
  const active = logs.filter(l => ids.has(l.routine_id))
  const week = weekProgress(routines.map(like), active, today)
  const byId = new Map(week.routines.map(w => [w.id, w]))
  return {
    today,
    routines: routines.map(r => ({ ...pub(r), done_today: byId.get(r.id)!.done_today, week_done: byId.get(r.id)!.done })),
    week: { from: week.from, to: week.to, done: week.done, target: week.target, pct: week.pct },
    // today's plan (daily + weekly routines still open this week) and all days with any care (last year)
    today_plan: todayProgress(week),
    care_days_total: new Set(logs.map(l => l.date)).size,
    streak: hairStreak(logs.map(l => l.date), today),
    report: hairReport(routines.map(like), active, from, today),
  }
}

export async function createRoutine(uid: string, input: HairRoutineInput) {
  const s = await getSettings(uid)
  const existing = await activeRoutines(uid)
  if (existing.length >= 30) throw createError({ statusCode: 400, statusMessage: 'Too many routines (30 max)' })
  const [row] = await useDb().insert(R()).values({
    userId: uid, name: input.name, perWeek: input.per_week, ...durations(input), note: input.note || null,
    sort: existing.reduce((m, r) => Math.max(m, r.sort + 1), 0), createdOn: localDate(s.timezone),
  }).returning()
  return pub(row!)
}

export async function updateRoutine(uid: string, id: string, input: z.infer<typeof hairRoutinePatchSchema>) {
  const r = await ownRoutine(uid, id)
  const set: Partial<HairRoutine> = {}
  if (input.name !== undefined) set.name = input.name
  if (input.per_week !== undefined) set.perWeek = input.per_week
  if (input.note !== undefined) set.note = input.note || null
  if (input.sort !== undefined) set.sort = input.sort
  if (input.duration_min !== undefined || input.duration_max !== undefined) {
    Object.assign(set, durations({
      duration_min: input.duration_min !== undefined ? input.duration_min : r.durationMin,
      duration_max: input.duration_max !== undefined ? input.duration_max : r.durationMax,
    }))
  }
  const [row] = await useDb().update(R()).set(set).where(eq(R().id, r.id)).returning()
  return pub(row!)
}

/** Archive: the routine leaves the list and the plan; its past checks stay for reports and the streak. */
export async function archiveRoutine(uid: string, id: string) {
  const r = await ownRoutine(uid, id)
  await useDb().update(R()).set({ archivedAt: new Date() }).where(eq(R().id, r.id))
  return { archived: { id: r.id, name: r.name } }
}

/** Check or uncheck a routine for a day (default today). Idempotent. */
export async function checkRoutine(uid: string, input: HairCheckInput) {
  const s = await getSettings(uid)
  const today = localDate(s.timezone)
  const date = input.date ?? today
  if (date > today) throw createError({ statusCode: 400, statusMessage: 'date is in the future' })
  const r = await ownRoutine(uid, input.routine_id)
  if (input.done) {
    await useDb().insert(L()).values({ userId: uid, routineId: r.id, date, note: input.note || null })
      .onConflictDoUpdate({ target: [L().routineId, L().date], set: input.note !== undefined ? { note: input.note || null } : { loggedAt: new Date() } })
  }
  else {
    await useDb().delete(L()).where(and(eq(L().userId, uid), eq(L().routineId, r.id), eq(L().date, date)))
  }
  return { routine: { id: r.id, name: r.name }, date, done: input.done }
}

/** Routine by id, or by name (case-insensitive, exact first, then a unique partial match). For MCP. */
export async function findRoutine(uid: string, q: string) {
  const list = await activeRoutines(uid)
  const byId = list.find(r => r.id === q)
  if (byId) return byId
  const norm = (s: string) => s.normalize('NFC').trim().toLowerCase()
  const n = norm(q)
  const exact = list.filter(r => norm(r.name) === n)
  if (exact.length === 1) return exact[0]!
  const part = list.filter(r => norm(r.name).includes(n) || n.includes(norm(r.name)))
  if (part.length === 1) return part[0]!
  throw createError({
    statusCode: 404,
    statusMessage: `${part.length > 1 ? 'Several' : 'No'} routines match "${q}". Routines: ${list.map(r => `${r.name} (${r.id})`).join(', ') || 'none yet'}`,
  })
}
