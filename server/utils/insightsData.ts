import { and, asc, eq, gte, lt } from 'drizzle-orm'
import { recommendTargets } from '../../shared/targets'
import { buildInsights, HISTORY_DAYS, type GoalType, type InsightEntry, type InsightMeal } from './insights'

const addDaysIso = (d: string, k: number) => new Date(Date.parse(`${d}T12:00:00Z`) + k * 86400_000).toISOString().slice(0, 10)

/** Advice for the Tips tab: last HISTORY_DAYS days before today, read-only. Goal type from the profile unless given. */
export async function getInsights(uid: string, goalOverride?: GoalType) {
  const s = await getSettings(uid)
  const today = localDate(s.timezone)
  const e = schema.entries
  const [rows, streak, weights] = await Promise.all([
    useDb().select().from(e)
      .where(and(eq(e.userId, uid), gte(e.date, addDaysIso(today, -HISTORY_DAYS)), lt(e.date, today)))
      .orderBy(asc(e.loggedAt)),
    getStreak(uid, s),
    getWeights(uid, today, 60),
  ])
  const entries: InsightEntry[] = rows.map((r) => {
    const at = new Date(r.loggedAt)
    return {
      date: r.date, meal: r.meal as InsightMeal, name: r.name, key: r.productId, grams: r.grams,
      per100: { kcal: r.kcal100, p: r.p100, f: r.f100, c: r.c100 },
      kcal: r.kcal ?? 0, p: r.p ?? 0, f: r.f ?? 0, c: r.c ?? 0, source: r.source,
      // logged later (yesterday's dinner the next morning, imports): the time says nothing about when it was eaten
      hour: localDate(s.timezone, at) === r.date ? localHour(s.timezone, at) : null,
    }
  })
  const profile = { ...profileOf(s), goalType: goalOverride ?? s.goalType }
  const weightKg = weights.at(-1)?.kg ?? null
  const targets = recommendTargets(profile, weightKg, today)
  const goal = { kcal: s.kcalGoal, p: s.pGoal, f: s.fGoal, c: s.cGoal }
  return {
    today,
    goal,
    profile_done: !!s.profileDoneAt,
    weight: weights.at(-1) ?? null,
    weights,
    targets,
    ...buildInsights({ today, goal, goalType: profile.goalType, entries, streakDays: streak.days, weightKg, weights, targets }),
  }
}
