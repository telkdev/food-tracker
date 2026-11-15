import { and, asc, eq, gte } from 'drizzle-orm'
import { z } from 'zod'
import type { Settings } from '../db/schema'
import { recommendTargets, type Profile } from '../../shared/targets'

export const profileSchema = z.object({
  goal_type: z.enum(['recomp', 'cut', 'bulk']).optional(),
  sex: z.enum(['m', 'f']).nullable().optional(),
  birth_year: z.number().int().min(1920).max(2015).nullable().optional(),
  height_cm: z.number().int().min(120).max(230).nullable().optional(),
  activity: z.enum(['sitting', 'light', 'active', 'physical']).nullable().optional(),
  training_days: z.number().int().min(0).max(7).nullable().optional(),
  experience: z.enum(['new', 'returning', 'trained']).nullable().optional(),
  /** today's weight; replaces today's weigh-in */
  weight_kg: z.number().min(30).max(300).optional(),
  /** the questionnaire was finished */
  done: z.boolean().optional(),
})
export type ProfileInput = z.infer<typeof profileSchema>

export const weightSchema = z.object({ kg: z.number().min(30).max(300), date: isoDate.optional() })

const addDaysIso = (d: string, k: number) => new Date(Date.parse(`${d}T12:00:00Z`) + k * 86400_000).toISOString().slice(0, 10)

export function profileOf(s: Settings): Profile {
  return {
    goalType: s.goalType, sex: s.sex, birthYear: s.birthYear, heightCm: s.heightCm,
    activity: s.activity, trainingDays: s.trainingDays, experience: s.experience,
  }
}

/** Weigh-ins of the last `days` days, oldest first. */
export async function getWeights(uid: string, today: string, days = 90) {
  const w = schema.weights
  return useDb().select({ date: w.date, kg: w.kg }).from(w)
    .where(and(eq(w.userId, uid), gte(w.date, addDaysIso(today, -days)))).orderBy(asc(w.date))
}

export async function setWeight(uid: string, kg: number, date?: string) {
  const s = await getSettings(uid)
  const d = date ?? localDate(s.timezone)
  const kg1 = Math.round(kg * 10) / 10
  await useDb().insert(schema.weights).values({ userId: uid, date: d, kg: kg1 })
    .onConflictDoUpdate({ target: [schema.weights.userId, schema.weights.date], set: { kg: kg1, updatedAt: new Date() } })
  return { date: d, kg: kg1 }
}

export async function getProfile(uid: string) {
  const s = await getSettings(uid)
  const today = localDate(s.timezone)
  const weights = await getWeights(uid, today)
  const last = weights.at(-1) ?? null
  const p = profileOf(s)
  return {
    today,
    profile: {
      goal_type: p.goalType, sex: p.sex, birth_year: p.birthYear, height_cm: p.heightCm,
      activity: p.activity, training_days: p.trainingDays, experience: p.experience,
      done_at: s.profileDoneAt,
    },
    weight: last,
    weights,
    goal: { kcal: s.kcalGoal, p: s.pGoal, f: s.fGoal, c: s.cGoal },
    recommended: recommendTargets(p, last?.kg ?? null, today),
  }
}

export async function updateProfile(uid: string, input: ProfileInput) {
  await getSettings(uid)
  const set: Partial<typeof schema.settings.$inferInsert> = {}
  if (input.goal_type !== undefined) set.goalType = input.goal_type
  if (input.sex !== undefined) set.sex = input.sex
  if (input.birth_year !== undefined) set.birthYear = input.birth_year
  if (input.height_cm !== undefined) set.heightCm = input.height_cm
  if (input.activity !== undefined) set.activity = input.activity
  if (input.training_days !== undefined) set.trainingDays = input.training_days
  if (input.experience !== undefined) set.experience = input.experience
  if (input.done) set.profileDoneAt = new Date()
  if (Object.keys(set).length) await useDb().update(schema.settings).set(set).where(eq(schema.settings.userId, uid))
  if (input.weight_kg !== undefined) await setWeight(uid, input.weight_kg)
  return getProfile(uid)
}
