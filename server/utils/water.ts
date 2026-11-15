import { and, asc, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Settings } from '../db/schema'
import { recommendWater } from '../../shared/water'

export const logWaterSchema = z.object({
  ml: z.number().int().min(1).max(3000),
  date: isoDate.optional(),
})
export type LogWaterInput = z.infer<typeof logWaterSchema>

async function latestWeight(uid: string) {
  const w = schema.weights
  const [row] = await useDb().select({ kg: w.kg }).from(w).where(eq(w.userId, uid)).orderBy(desc(w.date)).limit(1)
  return row?.kg ?? null
}

/** The goal in force (manual, else suggested) plus the suggestion itself, so Settings can show both. */
export async function waterGoal(uid: string, s: Settings) {
  const auto = recommendWater({ sex: s.sex, heightCm: s.heightCm, activity: s.activity, trainingDays: s.trainingDays }, await latestWeight(uid))
  return { goal_ml: s.waterGoalMl ?? auto.ml, manual: s.waterGoalMl != null, auto }
}

export async function getWaterDay(uid: string, s: Settings, date: string) {
  const w = schema.water
  const [rows, g] = await Promise.all([
    useDb().select({ id: w.id, ml: w.ml, logged_at: w.loggedAt }).from(w)
      .where(and(eq(w.userId, uid), eq(w.date, date))).orderBy(asc(w.loggedAt)),
    waterGoal(uid, s),
  ])
  return {
    date,
    ml: rows.reduce((a, r) => a + r.ml, 0),
    goal_ml: g.goal_ml,
    goal_manual: g.manual,
    logs: rows,
  }
}

export async function logWater(uid: string, input: LogWaterInput) {
  const s = await getSettings(uid)
  const date = input.date ?? localDate(s.timezone)
  if (date > localDate(s.timezone)) throw createError({ statusCode: 400, statusMessage: 'date is in the future' })
  const [row] = await useDb().insert(schema.water).values({ userId: uid, date, ml: input.ml })
    .returning({ id: schema.water.id, ml: schema.water.ml, logged_at: schema.water.loggedAt })
  return { created: row!, water: await getWaterDay(uid, s, date) }
}

export async function deleteWater(uid: string, id: string) {
  const [row] = await useDb().delete(schema.water).where(and(eq(schema.water.userId, uid), eq(schema.water.id, id))).returning()
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const s = await getSettings(uid)
  return { deleted: { id: row.id, ml: row.ml, date: row.date }, water: await getWaterDay(uid, s, row.date) }
}
