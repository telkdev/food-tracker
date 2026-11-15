import { and, asc, eq, gte, lt } from 'drizzle-orm'
import { buildInsights, HISTORY_DAYS, type GoalType, type InsightEntry, type InsightMeal } from './insights'

const addDaysIso = (d: string, k: number) => new Date(Date.parse(`${d}T12:00:00Z`) + k * 86400_000).toISOString().slice(0, 10)


/** Advice for the Tips tab: last HISTORY_DAYS days before today, read-only. */
export async function getInsights(uid: string, goalType: GoalType = 'recomp') {
  const s = await getSettings(uid)
  const today = localDate(s.timezone)
  const e = schema.entries
  const [rows, streak] = await Promise.all([
    useDb().select().from(e)
      .where(and(eq(e.userId, uid), gte(e.date, addDaysIso(today, -HISTORY_DAYS)), lt(e.date, today)))
      .orderBy(asc(e.loggedAt)),
    getStreak(uid, s),
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
  return {
    today,
    goal: { kcal: s.kcalGoal, p: s.pGoal, f: s.fGoal, c: s.cGoal },
    ...buildInsights({ today, goal: { kcal: s.kcalGoal, p: s.pGoal, f: s.fGoal, c: s.cGoal }, goalType, entries, streakDays: streak.days }),
  }
}
