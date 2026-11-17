import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm'
import { z } from 'zod'
import { mealsAhead, planDayV2, type PlanCandidate, type PlanCombo, type PlanMeal, type PlanTier } from './dayPlan'

export const suggestPlanSchema = z.object({
  // 1 = yesterday and today, 2 = also the day before (default), up to 3
  days: z.coerce.number().int().min(1).max(3).default(2),
  // foods he no longer has: part of the name, or a product id
  exclude: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  // 0 = best plan; 1, 2… = the next distinct ones ("another option"), wraps around
  variant: z.coerce.number().int().min(0).max(50).default(0),
})
export type SuggestPlanInput = z.input<typeof suggestPlanSchema>

/** foods eaten in the last weeks (tier 1) come from this many days back */
const HISTORY_DAYS = 21
const MAX_HISTORY = 30
const MAX_PRODUCTS = 20
/** most kcal one single top-up food may add: it closes a gap, it isn't a meal */
const TOPUP_KCAL = 300

/**
 * Sweets and fast food: fine to finish if he has them (eaten in the last days), but never worth pulling
 * back from older history or the product library to "fill" a plan (Vasyl, 2026-11-17).
 */
export const TREAT = new RegExp([
  // sweets / pastry / desserts
  'торт', 'пирожн', 'тирамис', 'чизкейк', 'эклер', 'круасс', 'кексы?', 'маффин', 'пончик', 'донат', 'вафл', 'печенье', 'печенья', 'печив', 'пряник',
  'шоколад', 'конфет', 'цукерк', 'мороженое', 'морозиво', 'слойк', 'штрудел', 'шарлотк', 'пирог', 'пиріг', 'пирож', 'булоч', 'сдоб',
  'зефир', 'зефір', 'мармелад', 'халв', 'варень', 'джем', 'нутелл', 'nutella', 'knoppers', 'snickers', 'twix', 'сгущ', 'zagęszczon', 'сырок', 'сирок', 'десерт',
  'ciast', 'tort(?!il)', 'czekolad', 'cukier', 'lody', 'pączek', 'drożdżów', 'wafel', 'cake', 'cookie', 'chocolate', 'candy', 'dessert', 'donut', 'brownie', 'croissant', 'tiramisu', 'cheesecake',
  // fast food / snacks
  'пицц', 'піц', 'pizza', 'бургер', 'burger', 'шаурм', 'шаверм', 'kebab', 'кебаб', 'хот-?дог', 'hot ?dog', 'наггетс', 'nugget', 'картофель фри', 'картопля фрі', 'frytk', 'fries',
  'чипс', 'chips', 'crisps', 'попкорн', 'popcorn', 'сухарик', 'кола', 'cola', 'pepsi', 'энергетик', 'енергетик',
].join('|'), 'i')
const isTreat = (name: string, sugar100?: number | null) => TREAT.test(name.toLowerCase()) || (sugar100 != null && sugar100 >= 25)

/** hour of day where he is, for "no breakfast at 3 pm" */
function localHour(timeZone: string, now = new Date()) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(now))
}
/** main meals that still make sense at this hour, whatever is logged */
export function mealsByClock(ahead: PlanMeal[], hour: number): PlanMeal[] {
  return ahead.filter(m => m === 'snack'
    || (m === 'breakfast' && hour < 11)
    || (m === 'lunch' && hour < 16)
    || (m === 'dinner' && hour < 22))
}

/**
 * Common lean protein foods (and a banana), last resort top-ups when his own meals can't reach protein (tier 3). Per 100 g,
 * as eaten (cooked where it matters). Kept short on purpose: things most kitchens or the shop next door have.
 */
const STAPLES: { name: string, per100: [number, number, number, number], g: number, meal: PlanMeal, kind: RegExp }[] = [
  { name: 'Куриная грудка, отварная', per100: [150, 30, 3, 0], g: 150, meal: 'dinner', kind: /кур|chicken|kurcz/i },
  { name: 'Скир натуральный', per100: [63, 11, 0.2, 4], g: 150, meal: 'snack', kind: /скир|skyr/i },
  { name: 'Творог обезжиренный', per100: [80, 16.5, 0.5, 3.3], g: 200, meal: 'snack', kind: /творог|twar[oó]g|cottage/i },
  { name: 'Яичный белок, приготовленный', per100: [52, 10.9, 0.2, 0.7], g: 150, meal: 'breakfast', kind: /яич|яйц|бел[оu]к|egg/i },
  { name: 'Тунец в собственном соку', per100: [116, 26, 1, 0], g: 120, meal: 'lunch', kind: /тун[еe]ц|tu[nń]czyk|tuna/i },
  { name: 'Протеин сывороточный', per100: [380, 75, 6, 8], g: 30, meal: 'snack', kind: /протеин|whey|protein/i },
  { name: 'Банан', per100: [89, 1.1, 0.3, 23], g: 120, meal: 'snack', kind: /банан|banan/i },
]

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
/** for matching "he has no X": punctuation ignored, so "Ньокки, готовые" matches "ньокки готовые" */
const loose = (s: string) => norm(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/**
 * Suggest portions for the rest of today, only from foods he ate today or in the last `days` days.
 * Read-only: nothing is logged. The caller (Claude after a yes, or a tap in the app) logs what he accepts.
 */
export async function suggestDayPlan(uid: string, input: SuggestPlanInput = {}) {
  const { days, exclude, variant } = suggestPlanSchema.parse(input)
  const s = await getSettings(uid)
  const today = localDate(s.timezone)
  const e = schema.entries
  const rows = await useDb().select().from(e)
    .where(and(eq(e.userId, uid), gte(e.date, addDays(today, -HISTORY_DAYS)), lte(e.date, today)))
    .orderBy(asc(e.loggedAt))

  // current product values win over old entry snapshots (that's what log_food with product_id will use)
  const ids = [...new Set(rows.map(r => r.productId).filter(Boolean))] as string[]
  const prods = ids.length ? await useDb().select().from(schema.products).where(and(eq(schema.products.userId, uid), inArray(schema.products.id, ids))) : []
  const prodById = new Map(prods.map(p => [p.id, p]))
  const recentFrom = addDays(today, -days)

  const ex = exclude.map(x => ({ raw: x.trim(), text: loose(x) }))
  const groups = new Map<string, typeof rows>()
  for (const r of rows) {
    const key = r.productId && prodById.has(r.productId) ? r.productId : `n:${norm(r.name)}`
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  const candidates: PlanCandidate[] = []
  const skipped: string[] = []
  const isGone = (key: string, name: string) => ex.some(x => x.raw === key || (x.text && loose(name).includes(x.text)))
  const todayRowsAll = rows.filter(r => r.date === today)
  const eatenToday = new Map<string, number>()
  const keyOf = (r: typeof rows[number]) => r.productId && prodById.has(r.productId) ? r.productId : `n:${norm(r.name)}`
  for (const r of todayRowsAll) eatenToday.set(keyOf(r), (eatenToday.get(keyOf(r)) ?? 0) + r.grams)
  // recent ones first; older ones by how often he ate them
  const ordered = [...groups].map(([key, list]) => ({ key, list, recent: list[list.length - 1]!.date >= recentFrom }))
    .sort((a, b) => Number(b.recent) - Number(a.recent) || b.list.length - a.list.length)
  /** foods that may appear in a plan at all (as part of a past meal or on their own) */
  const allowed = new Set<string>()
  let older = 0
  for (const { key, list, recent } of ordered) {
    const last = list[list.length - 1]!
    const prod = last.productId ? prodById.get(last.productId) : undefined
    const per100 = prod ? per100Of(prod) : per100Of(last)
    const name = last.name
    // by group key / product id, or by name (catches the same food logged both with and without a product)
    if (isGone(key, name)) continue
    // sweets and fast food are never planned: fine to eat, not something a plan should push
    if (isTreat(name, prod?.sugar100 ?? last.sugar100)) continue
    const typical = Math.round(median(list.map(r => r.grams)))
    allowed.add(key)
    // on its own only: a real food (not oil, a sauce, pickles, coffee), not eaten today already in a full portion
    const eaten = eatenToday.get(key) ?? 0
    const maxAlone = Math.round(typical * 1.5 / 5) * 5 - eaten
    // a top-up is a snack-like or protein-dense food (skyr, cottage cheese, chicken), not a second dinner (sushi, stew)
    const topUp = mode(list.map(r => r.meal)) === 'snack' || per100.p * 4 >= per100.kcal * 0.5
    let single = topUp && per100.f < 70 && per100.kcal >= 40 && typical * per100.kcal / 100 >= 40 && eaten < typical && maxAlone >= Math.max(5, typical / 2)
    if (per100.f >= 70) skipped.push(name)
    if (!recent && ++older > MAX_HISTORY) single = false
    candidates.push({
      key, name, product_id: prod?.id ?? null, per100,
      source: (prod?.source ?? last.source) === 'lifesum' ? 'generic' : (prod?.source ?? last.source), typical_g: typical,
      usual_meal: mode(list.map(r => r.meal as PlanMeal)), last_date: last.date, tier: recent ? 0 : 1,
      single, max_g: Math.max(0, Math.min(maxAlone, Math.floor(TOPUP_KCAL / Math.max(per100.kcal, 1) * 100 / 5) * 5)),
    })
  }

  // his past meals (foods logged together in one meal on one day), the building blocks of a plan
  const byMeal = new Map<string, typeof rows>()
  for (const r of rows) if (r.date !== today) byMeal.set(`${r.date}|${r.meal}`, [...(byMeal.get(`${r.date}|${r.meal}`) ?? []), r])
  const combos = new Map<string, PlanCombo>()
  for (const [dm, list] of byMeal) {
    const [date, meal] = dm.split('|') as [string, PlanMeal]
    const grams = new Map<string, number>()
    let kcal = 0
    let lost = 0
    for (const r of list) {
      const k = keyOf(r)
      if (!allowed.has(k)) { lost += r.kcal ?? 0; continue }
      grams.set(k, (grams.get(k) ?? 0) + r.grams)
      kcal += r.kcal ?? 0
    }
    // a meal mostly made of a treat or a food that's gone is not that meal anymore
    if (kcal < 150 || lost > kcal * 0.4 || !grams.size) continue
    const sig = [...grams.keys()].sort().join('+')
    const prev = combos.get(sig)
    if (prev) { prev.count++; if (date > prev.date) Object.assign(prev, { date, meal, parts: [...grams].map(([key, g]) => ({ key, grams: g })) }); continue }
    combos.set(sig, { key: sig, date, meal, parts: [...grams].map(([key, g]) => ({ key, grams: g })), count: 1, tier: date >= recentFrom ? 0 : 1 })
  }

  // his own products he hasn't eaten lately (tier 2): the most protein-dense first, they're what closes gaps
  const seen = new Set(candidates.map(c => loose(c.name)))
  const lib = await useDb().select().from(schema.products).where(eq(schema.products.userId, uid))
  const extra = lib
    .filter(p => !groups.has(p.id) && p.kcal100 >= 20 && p.f100 < 70 && !seen.has(loose(p.name)) && !isGone(p.id, p.name) && !isTreat(p.name, p.sugar100))
    .sort((a, b) => (b.p100 + b.c100 * 0.3) / Math.max(b.kcal100, 1) - (a.p100 + a.c100 * 0.3) / Math.max(a.kcal100, 1))
    .slice(0, MAX_PRODUCTS)
  for (const p of extra) {
    seen.add(loose(p.name))
    candidates.push({
      key: p.id, name: p.name, product_id: p.id, per100: per100Of(p),
      source: p.source,
      // no history: a plain 100 g portion (half-portion steps of 50 g)
      typical_g: 100, usual_meal: 'snack', last_date: '', tier: 2, max_g: Math.min(200, Math.floor(TOPUP_KCAL / Math.max(p.kcal100, 1) * 100 / 50) * 50) || 50,
    })
  }
  for (const x of STAPLES) {
    const key = `s:${loose(x.name)}`
    // not a second portion of the same kind of food he already had today (another cottage cheese, more chicken)
    if (seen.has(loose(x.name)) || isGone(key, x.name) || todayRowsAll.some(r => x.kind.test(r.name))) continue
    candidates.push({
      key, name: x.name, product_id: null, per100: { kcal: x.per100[0], p: x.per100[1], f: x.per100[2], c: x.per100[3] },
      source: 'generic', typical_g: x.g, usual_meal: x.meal, last_date: '', tier: 3 as PlanTier, max_g: Math.min(x.g * 1.5, Math.floor(TOPUP_KCAL / x.per100[0] * 100 / 5) * 5),
    })
  }

  const todayRows = todayRowsAll
  const eaten = todayRows.reduce((a, r) => ({ kcal: a.kcal + (r.kcal ?? 0), p: a.p + (r.p ?? 0), f: a.f + (r.f ?? 0), c: a.c + (r.c ?? 0) }), { kcal: 0, p: 0, f: 0, c: 0 })
  const target = {
    kcal: s.kcalGoal - eaten.kcal,
    p: s.pGoal == null ? null : s.pGoal - eaten.p,
    f: s.fGoal == null ? null : s.fGoal - eaten.f,
    c: s.cGoal == null ? null : s.cGoal - eaten.c,
  }
  const ahead = mealsByClock(mealsAhead([...new Set(todayRows.map(r => r.meal as PlanMeal))]), localHour(s.timezone))
  const plan = planDayV2(candidates, [...combos.values()], target, { ahead, variant, eatenToday })
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
