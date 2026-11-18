import { and, asc, between, eq, inArray, sql } from 'drizzle-orm'
import type { Settings } from '../db/schema'
import { addIsoDays } from './streak'
import { dayScore, kcalOnTarget, proteinGoalOf, rank, topFoods, weekScore } from './rating'

/**
 * DB side of the Rating tab. Everyone sees the users who have "show me in the rating" on (default) plus
 * themselves. Only day totals, food names, grams and kcal/protein leave a user's diary: no notes, no water,
 * no profile. Disabled users and users who never opened the app (no settings row) are left out.
 */

export type RatingPeriod = 'today' | 'yesterday' | 'week'
const r1 = (n: number) => Math.round(n * 10) / 10

interface Member { id: string, name: string, s: Settings, me: boolean }

/** Users the viewer may see, the viewer first. */
async function members(viewer: string): Promise<Member[]> {
  const users = [...(await allUsers()).values()].filter(u => !u.disabledAt)
  if (!users.length) return []
  const rows = await useDb().select().from(schema.settings).where(inArray(schema.settings.userId, users.map(u => u.id)))
  const byId = new Map(rows.map(r => [r.userId, r]))
  const out: Member[] = []
  for (const u of users) {
    const s = byId.get(u.id)
    if (!s || (!s.showInRating && u.id !== viewer)) continue
    out.push({ id: u.id, name: (await userDisplayName(u.id)) ?? u.login, s, me: u.id === viewer })
  }
  return out
}

/** Per user, per date, per food name: kcal, protein and how many entries. */
async function foodRows(uids: string[], from: string, to: string) {
  if (!uids.length) return []
  const e = schema.entries
  return useDb().select({
    uid: e.userId,
    date: e.date,
    name: e.name,
    kcal: sql<number>`coalesce(sum(${e.kcal}), 0)::float8`,
    p: sql<number>`coalesce(sum(${e.p}), 0)::float8`,
    n: sql<number>`count(*)::int`,
  }).from(e).where(and(inArray(e.userId, uids), between(e.date, from, to))).groupBy(e.userId, e.date, e.name)
}

type Rows = Awaited<ReturnType<typeof foodRows>>

function dayTotals(rows: Rows) {
  const t = { kcal: 0, p: 0, entries: 0 }
  for (const r of rows) { t.kcal += r.kcal; t.p += r.p; t.entries += r.n }
  return t
}

export async function getRating(viewer: string, period: RatingPeriod) {
  const vs = await getSettings(viewer)
  const today = localDate(vs.timezone)
  const yesterday = addIsoDays(today, -1)
  const weekFrom = addIsoDays(today, -7)
  const list = await members(viewer)
  const rows = await foodRows(list.map(m => m.id), weekFrom, today)
  const streaks = await Promise.all(list.map(m => getStreak(m.id, m.s)))

  const users = list.map((m, i) => {
    const mine = rows.filter(r => r.uid === m.id)
    const kcalGoal = m.s.kcalGoal
    const pg = proteinGoalOf(m.s.pGoal, kcalGoal)
    const base = { id: m.id, name: m.name, me: m.me, streak: streaks[i]!.days, today_logged: streaks[i]!.today_logged, kcal_goal: kcalGoal, p_goal: pg.g, p_goal_auto: pg.auto }
    if (period !== 'week') {
      const date = period === 'today' ? today : yesterday
      const day = mine.filter(r => r.date === date)
      const t = dayTotals(day)
      return { ...base, score: dayScore(t, kcalGoal, pg.g), kcal: r1(t.kcal), p: r1(t.p), entries: t.entries, top: topFoods(day) }
    }
    const dates = Array.from({ length: 7 }, (_, k) => addIsoDays(weekFrom, k))
    const days = dates.map((d) => {
      const t = dayTotals(mine.filter(r => r.date === d))
      return { date: d, kcal: r1(t.kcal), p: r1(t.p), score: dayScore(t, kcalGoal, pg.g) }
    })
    const logged = days.filter(d => d.score != null)
    const avg = (k: 'kcal' | 'p') => logged.length ? r1(logged.reduce((a, d) => a + d[k], 0) / logged.length) : 0
    return {
      ...base,
      score: logged.length ? weekScore(days.map(d => d.score)) : null,
      kcal: avg('kcal'),
      p: avg('p'),
      logged_days: logged.length,
      on_target_days: logged.filter(d => kcalOnTarget(d.kcal, kcalGoal)).length,
      days: days.map(d => ({ date: d.date, score: d.score })),
      top: topFoods(mine.filter(r => r.date >= weekFrom && r.date <= yesterday)),
    }
  })

  const me = list.find(m => m.me)
  return {
    period,
    today,
    from: period === 'week' ? weekFrom : period === 'today' ? today : yesterday,
    to: period === 'week' ? yesterday : period === 'today' ? today : yesterday,
    hidden_me: me ? !me.s.showInRating : false,
    users: rank(users),
  }
}

/** One person's foods on one day (today and the 7 days before), plus that week's day scores. */
export async function getRatingPerson(viewer: string, uid: string, date?: string) {
  const vs = await getSettings(viewer)
  const today = localDate(vs.timezone)
  const from = addIsoDays(today, -7)
  const day = date ?? today
  if (day < from || day > today) throw createError({ statusCode: 400, statusMessage: 'Only the last 7 days and today' })
  const m = (await members(viewer)).find(x => x.id === uid)
  if (!m) throw createError({ statusCode: 404, statusMessage: 'Not in the rating' })

  const e = schema.entries
  const [entries, rows, streak] = await Promise.all([
    useDb().select({ meal: e.meal, name: e.name, grams: e.grams, kcal: e.kcal, p: e.p, f: e.f, c: e.c, source: e.source })
      .from(e).where(and(eq(e.userId, uid), eq(e.date, day))).orderBy(asc(e.loggedAt)),
    foodRows([uid], from, today),
    getStreak(uid, m.s),
  ])
  const pg = proteinGoalOf(m.s.pGoal, m.s.kcalGoal)
  const totals = { kcal: 0, p: 0, f: 0, c: 0 }
  for (const x of entries) { totals.kcal += x.kcal ?? 0; totals.p += x.p ?? 0; totals.f += x.f ?? 0; totals.c += x.c ?? 0 }
  const meals = (['breakfast', 'lunch', 'dinner', 'snack'] as const).map(meal => ({
    meal,
    kcal: r1(entries.filter(x => x.meal === meal).reduce((a, x) => a + (x.kcal ?? 0), 0)),
    entries: entries.filter(x => x.meal === meal).map(x => ({ name: x.name, grams: x.grams, kcal: r1(x.kcal ?? 0), p: r1(x.p ?? 0), estimate: x.source === 'estimate' })),
  })).filter(x => x.entries.length)

  return {
    id: m.id,
    name: m.name,
    me: m.me,
    today,
    date: day,
    streak: streak.days,
    goal: { kcal: m.s.kcalGoal, p: pg.g, p_auto: pg.auto },
    totals: { kcal: r1(totals.kcal), p: r1(totals.p), f: r1(totals.f), c: r1(totals.c) },
    score: dayScore({ kcal: totals.kcal, p: totals.p, entries: entries.length }, m.s.kcalGoal, pg.g),
    meals,
    days: Array.from({ length: 8 }, (_, k) => {
      const d = addIsoDays(from, k)
      const t = dayTotals(rows.filter(r => r.date === d))
      return { date: d, kcal: r1(t.kcal), score: dayScore(t, m.s.kcalGoal, pg.g) }
    }),
  }
}
