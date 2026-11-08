import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm'
import { z } from 'zod'
import { mealsAhead, planDay, type PlanCandidate, type PlanMeal } from './dayPlan'

export const suggestPlanSchema = z.object({
  // 1 = yesterday and today, 2 = also the day before (default), up to 3
  days: z.coerce.number().int().min(1).max(3).default(2),
  // foods he no longer has: part of the name, or a product id
  exclude: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
})
export type SuggestPlanInput = z.input<typeof suggestPlanSchema>

const addDays = (d: string, k: number) => new Date(Date.parse(`${d}T00:00:00Z`) + k * 86400_000).toISOString().slice(0, 10)
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}
const mode = <T>(xs: T[]) => {
  const n = new Map<T, number>()
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1)
  return [...n].sort((a, b) => b[1] - a[1])[0]![0]
}
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim()

/**
 * Suggest portions for the rest of today, only from foods he ate today or in the last `days` days.
 * Read-only: nothing is logged. The caller (Claude after a yes, or a tap in the app) logs what he accepts.
 */
export async function suggestDayPlan(uid: string, input: SuggestPlanInput = {}) {
  const { days, exclude } = suggestPlanSchema.parse(input)
  const s = await getSettings(uid)
  const today = localDate(s.timezone)
  const e = schema.entries
  const rows = await useDb().select().from(e)
    .where(and(eq(e.userId, uid), gte(e.date, addDays(today, -days)), lte(e.date, today)))
    .orderBy(asc(e.loggedAt))

  // current product values win over old entry snapshots (that's what log_food with product_id will use)
  const ids = [...new Set(rows.map(r => r.productId).filter(Boolean))] as string[]
  const prods = ids.length ? await useDb().select().from(schema.products).where(and(eq(schema.products.userId, uid), inArray(schema.products.id, ids))) : []
  const prodById = new Map(prods.map(p => [p.id, p]))

  const ex = exclude.map(norm)
  const groups = new Map<string, typeof rows>()
  for (const r of rows) {
    const key = r.productId && prodById.has(r.productId) ? r.productId : `n:${norm(r.name)}`
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  const candidates: PlanCandidate[] = []
  const skipped: string[] = []
  for (const [key, list] of groups) {
    const last = list[list.length - 1]!
    const prod = last.productId ? prodById.get(last.productId) : undefined
    const per100 = prod ? { kcal: prod.kcal100, p: prod.p100, f: prod.f100, c: prod.c100 } : { kcal: last.kcal100, p: last.p100, f: last.f100, c: last.c100 }
    const name = last.name
    if (ex.some(x => norm(name).includes(x) || x === key)) continue
    // oil, butter, lard: something you add to a dish, not a food to plan
    if (per100.f >= 70) { skipped.push(name); continue }
    const typical = Math.round(median(list.map(r => r.grams)))
    if (typical * per100.kcal / 100 < 10) continue // water, coffee, spices
    candidates.push({
      key, name, product_id: prod?.id ?? null, per100,
      source: (prod?.source ?? last.source) === 'lifesum' ? 'generic' : (prod?.source ?? last.source), typical_g: typical,
      usual_meal: mode(list.map(r => r.meal as PlanMeal)), last_date: last.date,
    })
  }

  const todayRows = rows.filter(r => r.date === today)
  const eaten = todayRows.reduce((a, r) => ({ kcal: a.kcal + (r.kcal ?? 0), p: a.p + (r.p ?? 0), f: a.f + (r.f ?? 0), c: a.c + (r.c ?? 0) }), { kcal: 0, p: 0, f: 0, c: 0 })
  const target = {
    kcal: s.kcalGoal - eaten.kcal,
    p: s.pGoal == null ? null : s.pGoal - eaten.p,
    f: s.fGoal == null ? null : s.fGoal - eaten.f,
    c: s.cGoal == null ? null : s.cGoal - eaten.c,
  }
  const ahead = mealsAhead([...new Set(todayRows.map(r => r.meal as PlanMeal))])
  const plan = planDay(candidates, target, { ahead })
  const r1 = (n: number | null) => n == null ? null : Math.round(n * 10) / 10
  return {
    date: today,
    from: addDays(today, -days),
    goal: { kcal: s.kcalGoal, p: s.pGoal, f: s.fGoal, c: s.cGoal },
    eaten: { kcal: r1(eaten.kcal)!, p: r1(eaten.p)!, f: r1(eaten.f)!, c: r1(eaten.c)! },
    left_now: { kcal: r1(target.kcal)!, p: r1(target.p), f: r1(target.f), c: r1(target.c) },
    meals_ahead: ahead,
    ...plan,
    candidates: candidates.length,
    ...(skipped.length ? { skipped_fats: skipped } : {}),
  }
}
