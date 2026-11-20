import { and, asc, between, desc, eq, ilike, inArray, lte, or, sql } from 'drizzle-orm'
import type { Entry, Product, Settings } from '../db/schema'
import { computeStreak, type Streak } from './streak'
import { EXTRA_KEYS, fillExtras100, type ExtraKey } from '../../shared/nutrientDefaults'

const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100
const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const

export type Nutrition100 = { kcal: number, p: number, f: number, c: number, fiber?: number, sugar?: number, salt?: number }
type Extras100 = { fiber100: number | null, sugar100: number | null, salt100: number | null }

/** Per-100 g values of a product or entry row; unknown extras are left out (not 0). */
export function per100Of(r: { kcal100: number, p100: number, f100: number, c100: number } & Extras100): Nutrition100 {
  return {
    kcal: r.kcal100, p: r.p100, f: r.f100, c: r.c100,
    ...(r.fiber100 != null ? { fiber: r.fiber100 } : {}),
    ...(r.sugar100 != null ? { sugar: r.sugar100 } : {}),
    ...(r.salt100 != null ? { salt: r.salt100 } : {}),
  }
}

/** Nutrition100 → DB columns (extras null when unknown). */
export function per100Cols(v: Nutrition100) {
  return {
    kcal100: v.kcal, p100: v.p, f100: v.f, c100: v.c,
    fiber100: v.fiber ?? null, sugar100: v.sugar ?? null, salt100: v.salt ?? null,
  }
}

/**
 * Daily reference values for the extras, from the kcal goal:
 * - fiber: at least 14 g per 1000 kcal (US DRI), never below 25 g (EFSA adequate intake);
 * - sugar: 90 g, the EU reference intake for TOTAL sugars (fruit and milk included).
 *   WHO's "<10 % of kcal" is about free/added sugars, which labels don't separate, so it would flag fruit and dairy;
 * - salt: 5 g (WHO).
 */
export function extrasGoal(kcalGoal: number) {
  return { fiber: Math.max(25, Math.round(kcalGoal * 14 / 1000)), sugar: 90, salt: 5 }
}

type ExtrasRow = Pick<Entry, 'name' | 'grams' | 'kcal100' | 'c100' | 'fiber100' | 'sugar100' | 'salt100' | 'fiber' | 'sugar' | 'salt'>

/**
 * Fiber / sugar / salt in grams for one entry. Stored values win; unknown ones are estimated from the
 * food type (shared/nutrientDefaults.ts) at read time and listed in `est`, so the day total is complete
 * instead of jumping with whichever foods had data. Nothing is written: a real value replaces the estimate.
 */
export function entryExtras(e: ExtrasRow): Record<ExtraKey, number> & { est: ExtraKey[] } {
  const { values, estimated } = fillExtras100({ name: e.name, kcal: e.kcal100, c: e.c100, fiber: e.fiber100, sugar: e.sugar100, salt: e.salt100 })
  const g = (k: ExtraKey, digits: number) => {
    const stored = e[k]
    if (stored != null) return stored
    const f = 10 ** digits
    return Math.round(e.grams * values[k] / 100 * f) / f
  }
  return { fiber: g('fiber', 2), sugar: g('sugar', 2), salt: g('salt', 3), est: estimated }
}

function publicEntry(e: Entry) {
  const x = entryExtras(e)
  return {
    id: e.id, date: e.date, meal: e.meal, name: e.name, grams: e.grams,
    // as stored: unknown extras are left out, so an edit never saves an estimate as a real value
    per100: per100Of(e),
    kcal: e.kcal, p: e.p, f: e.f, c: e.c,
    fiber: x.fiber, sugar: x.sugar, salt: x.salt,
    // which of fiber / sugar / salt are estimated by food type (not from a label or database)
    ...(x.est.length ? { extras_est: x.est } : {}),
    source: e.source, note: e.note, product_id: e.productId, logged_at: e.loggedAt,
    ...(e.loggedBy ? { logged_by: e.loggedBy } : {}),
  }
}

function publicProduct(p: Product) {
  return {
    id: p.id, name: p.name, brand: p.brand, barcode: p.barcode,
    per100: per100Of(p),
    source: p.source, note: p.note,
  }
}

function totals(rows: { kcal: number | null, p: number | null, f: number | null, c: number | null }[]) {
  const t = { kcal: 0, p: 0, f: 0, c: 0 }
  for (const r of rows) { t.kcal += r.kcal ?? 0; t.p += r.p ?? 0; t.f += r.f ?? 0; t.c += r.c ?? 0 }
  return { kcal: r1(t.kcal), p: r1(t.p), f: r1(t.f), c: r1(t.c) }
}

/**
 * Fiber, sugar and salt eaten (unknown values estimated by food type, see entryExtras), plus the share of
 * the day's kcal whose values are real (label, Open Food Facts, filled in) rather than estimated (0–1).
 */
function extrasTotals(rows: (ExtrasRow & { kcal: number | null })[]) {
  const kcal = rows.reduce((a, r) => a + (r.kcal ?? 0), 0)
  const xs = rows.map(r => ({ kcal: r.kcal ?? 0, ...entryExtras(r) }))
  const one = (k: ExtraKey, round: (n: number) => number) => {
    const known = xs.filter(r => !r.est.includes(k))
    const knownKcal = known.reduce((a, r) => a + r.kcal, 0)
    return {
      g: round(xs.reduce((a, r) => a + r[k], 0)),
      // entries with 0 kcal (water, coffee) don't move coverage
      coverage: kcal > 0 ? r2(knownKcal / kcal) : (known.length ? 1 : 0),
    }
  }
  return Object.fromEntries(EXTRA_KEYS.map(k => [k, one(k, k === 'salt' ? r2 : r1)])) as Record<ExtraKey, { g: number, coverage: number }>
}

/** Translate Postgres CHECK violations into a readable 400. */
function dbError(e: any): never {
  const code = e?.code ?? e?.cause?.code
  const constraint = e?.constraint_name ?? e?.cause?.constraint_name
  if (code === '23514') throw createError({ statusCode: 400, statusMessage: `Value rejected by sanity check (${constraint}). Per-100 g values look wrong: kcal must be 0–950, protein+fat+carbs ≤ 100 g, sugar ≤ carbs, fiber/sugar/salt 0–100 g.` })
  if (code === '23505') throw createError({ statusCode: 409, statusMessage: `Already exists (${constraint})` })
  throw e
}

/** Current day streak as of today (see server/utils/streak.ts for the rules). */
export async function getStreak(uid: string, s?: Settings): Promise<Streak> {
  s ??= await getSettings(uid)
  const today = localDate(s.timezone)
  const e = schema.entries
  const rows = await useDb().selectDistinct({ date: e.date }).from(e)
    .where(and(eq(e.userId, uid), lte(e.date, today))).orderBy(desc(e.date))
  return computeStreak(rows.map(r => r.date), today, { days: s.streakCarryDays, until: s.streakCarryUntil })
}

export async function setStreakCarry(uid: string, c: StreakCarryInput) {
  await getSettings(uid)
  const [row] = await useDb().update(schema.settings)
    .set({ streakCarryDays: c.until ? c.days : 0, streakCarryUntil: c.days ? c.until : null })
    .where(eq(schema.settings.userId, uid)).returning().catch(dbError)
  return { carry: { days: row!.streakCarryDays, until: row!.streakCarryUntil }, streak: await getStreak(uid, row!) }
}

export async function getDay(uid: string, date?: string) {
  const s = await getSettings(uid)
  const day = date ?? localDate(s.timezone)
  const [rows, streak, water] = await Promise.all([
    useDb().select().from(schema.entries).where(and(eq(schema.entries.userId, uid), eq(schema.entries.date, day))).orderBy(asc(schema.entries.loggedAt)),
    getStreak(uid, s),
    getWaterDay(uid, s, day),
  ])
  const t = totals(rows)
  return {
    date: day,
    // always as of today, whatever day is shown
    streak,
    goal: { kcal: s.kcalGoal, p: s.pGoal, f: s.fGoal, c: s.cGoal },
    totals: t,
    // fiber / sugar / salt: grams and the share of kcal they are known for; goal = daily reference values
    extras: extrasTotals(rows),
    extras_goal: extrasGoal(s.kcalGoal),
    // kcal from guessed entries (source "estimate"): how approximate the day total is
    estimate_kcal: totals(rows.filter(r => r.source === 'estimate')).kcal,
    remaining_kcal: r1(s.kcalGoal - t.kcal),
    water,
    meals: Object.fromEntries(MEALS.map((m) => {
      const list = rows.filter(r => r.meal === m)
      return [m, { totals: totals(list), entries: list.map(publicEntry) }]
    })) as Record<typeof MEALS[number], { totals: ReturnType<typeof totals>, entries: ReturnType<typeof publicEntry>[] }>,
  }
}

export async function getRange(uid: string, from: string, to: string) {
  if (from > to) throw createError({ statusCode: 400, statusMessage: '`from` must be on or before `to`' })
  const days = (Date.parse(to) - Date.parse(from)) / 86400_000
  if (days > 366) throw createError({ statusCode: 400, statusMessage: 'Range is limited to 366 days' })
  const s = await getSettings(uid)
  const e = schema.entries
  const rows = await useDb().select({
    date: e.date,
    kcal: sql<number>`round(sum(${e.kcal}), 1)::float8`,
    p: sql<number>`round(sum(${e.p}), 1)::float8`,
    f: sql<number>`round(sum(${e.f}), 1)::float8`,
    c: sql<number>`round(sum(${e.c}), 1)::float8`,
    entries: sql<number>`count(*)::int`,
  }).from(e).where(and(eq(e.userId, uid), between(e.date, from, to))).groupBy(e.date).orderBy(asc(e.date))
  const avg = rows.length ? r1(rows.reduce((a, r) => a + r.kcal, 0) / rows.length) : null
  return { from, to, goal_kcal: s.kcalGoal, logged_days: rows.length, avg_kcal_logged_days: avg, days: rows }
}

/**
 * `by`: a connected user logging into uid's diary (null/undefined = uid themselves). Their own product ids are
 * accepted too: the entry then copies the product's values without linking it (products are per user).
 */
export async function logFood(uid: string, input: LogFoodInput, by?: string | null) {
  const s = await getSettings(uid)
  const date = input.date ?? localDate(s.timezone)
  const meal = input.meal ?? mealFromTime(s.timezone)
  const db = useDb()

  const ids = input.items.map(i => i.product_id).filter(Boolean) as string[]
  // only this user's products (and the logging user's own): an id from anyone else's list is "not found"
  const owners = by && by !== uid ? [uid, by] : [uid]
  const products = ids.length ? await db.select().from(schema.products).where(and(inArray(schema.products.userId, owners), inArray(schema.products.id, ids))) : []
  const byId = new Map(products.map(p => [p.id, p]))

  const values = input.items.map((item, i) => {
    const prod = item.product_id ? byId.get(item.product_id) : undefined
    if (item.product_id && !prod) throw createError({ statusCode: 400, statusMessage: `items[${i}]: product ${item.product_id} not found` })
    const per100 = prod ? per100Of(prod) : item.per100
    if (!per100) throw createError({ statusCode: 400, statusMessage: `items[${i}] (${item.name}): give product_id or per100` })
    const source = item.source ?? prod?.source
    if (!source) throw createError({ statusCode: 400, statusMessage: `items[${i}] (${item.name}): source is required without product_id` })
    return {
      userId: uid, date, meal, productId: prod?.userId === uid ? prod.id : null, name: item.name, grams: item.grams,
      ...per100Cols(per100),
      source, note: item.note ?? null,
      loggedBy: by && by !== uid ? by : null,
    }
  })

  const created = await db.insert(schema.entries).values(values).returning().catch(dbError)
  return { created: created.map(publicEntry), day: await getDay(uid, date) }
}

export async function updateEntry(uid: string, id: string, patch: UpdateEntryInput) {
  const set: Partial<typeof schema.entries.$inferInsert> = {}
  if (patch.grams !== undefined) set.grams = patch.grams
  if (patch.meal !== undefined) set.meal = patch.meal
  if (patch.date !== undefined) set.date = patch.date
  if (patch.note !== undefined) set.note = patch.note
  if (patch.name !== undefined) set.name = patch.name
  if (!Object.keys(set).length) throw createError({ statusCode: 400, statusMessage: 'Nothing to update' })
  const [row] = await useDb().update(schema.entries).set(set).where(and(eq(schema.entries.userId, uid), eq(schema.entries.id, id))).returning().catch(dbError)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Entry not found' })
  return publicEntry(row)
}

export async function deleteEntry(uid: string, id: string) {
  const [row] = await useDb().delete(schema.entries).where(and(eq(schema.entries.userId, uid), eq(schema.entries.id, id))).returning()
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Entry not found' })
  return { deleted: publicEntry(row), day: await getDay(uid, row.date) }
}

export async function setGoals(uid: string, g: GoalsInput) {
  const set: Partial<typeof schema.settings.$inferInsert> = {}
  if (g.kcal_goal !== undefined) set.kcalGoal = g.kcal_goal
  if (g.p_goal !== undefined) set.pGoal = g.p_goal
  if (g.f_goal !== undefined) set.fGoal = g.f_goal
  if (g.c_goal !== undefined) set.cGoal = g.c_goal
  if (g.water_goal_ml !== undefined) set.waterGoalMl = g.water_goal_ml
  if (g.show_in_rating !== undefined) set.showInRating = g.show_in_rating
  if (!Object.keys(set).length) throw createError({ statusCode: 400, statusMessage: 'Nothing to update' })
  await getSettings(uid)
  const [row] = await useDb().update(schema.settings).set(set).where(eq(schema.settings.userId, uid)).returning().catch(dbError)
  return { kcal_goal: row!.kcalGoal, p_goal: row!.pGoal, f_goal: row!.fGoal, c_goal: row!.cGoal, water_goal_ml: row!.waterGoalMl, show_in_rating: row!.showInRating }
}

// ---------- products ----------

/**
 * Forgiving search over My products:
 * - every word may be a part of a word, in any order ("polt twar" finds "Twaróg półtłusty");
 * - Polish/other diacritics are ignored ("twarog", "polt");
 * - small typos still match via trigram word similarity ("twarg");
 * - brand counts too ("piatnica skyr"); an exact barcode always matches.
 * Best matches first: name starts with the query, then all words found, then by similarity.
 */
export async function searchMyProducts(uid: string, query: string, limit = 10) {
  const raw = query.trim().toLowerCase()
  const words = raw.split(/[\s,]+/).filter(Boolean).slice(0, 6).map(w => w.replace(/[\\%_]/g, m => `\\${m}`))
  if (!words.length) return []
  const p = schema.products
  const hay = sql`f_unaccent(lower(${p.name} || ' ' || coalesce(${p.brand}, '')))`
  const nq = sql`f_unaccent(${raw})`
  const allWords = sql.join(words.map(w => sql`${hay} like '%' || f_unaccent(${w}) || '%'`), sql` and `)
  const sim = sql`word_similarity(${nq}, ${hay})`
  const rows = await useDb().select().from(p)
    .where(and(eq(p.userId, uid), or(sql`(${allWords})`, sql`${sim} >= 0.45`, eq(p.barcode, query.trim()))))
    .orderBy(
      sql`case when f_unaccent(lower(${p.name})) like ${nq} || '%' then 0 when (${allWords}) then 1 else 2 end`,
      sql`${sim} desc`,
      asc(p.name),
    ).limit(limit)
  return rows.map(publicProduct)
}

export async function searchProducts(uid: string, query: string) {
  if (query.trim().length < 2) throw createError({ statusCode: 400, statusMessage: 'Query must be at least 2 characters' })
  const mine = await searchMyProducts(uid, query)
  let off: Awaited<ReturnType<typeof offSearch>> = []
  let offError: string | null = null
  try { off = await offSearch(query) } catch (e: any) { offError = e?.statusMessage || e?.message || 'Open Food Facts unavailable' }
  const known = new Set(mine.map(m => m.barcode).filter(Boolean))
  return {
    results: [
      ...mine.map(m => ({ origin: 'my_products' as const, ...m })),
      ...off.filter(o => !known.has(o.barcode)).map(o => ({ origin: 'open_food_facts' as const, id: null, ...o, source: 'off' as const })),
    ],
    off_error: offError,
    attribution: 'Product data from Open Food Facts (ODbL)',
  }
}

export async function upsertProduct(uid: string, input: UpsertProductInput) {
  const barcode = input.barcode ? requireBarcode(input.barcode) : null
  const values = {
    userId: uid, name: input.name, brand: input.brand ?? null, barcode,
    ...per100Cols(input.per100),
    source: input.source, note: input.note ?? null,
  }
  const db = useDb()
  const q = barcode
    ? db.insert(schema.products).values(values).onConflictDoUpdate({ target: [schema.products.userId, schema.products.barcode], set: { ...values, updatedAt: new Date() } })
    : db.insert(schema.products).values(values)
  const [row] = await q.returning().catch(dbError)
  return publicProduct(row!)
}

/** My products first; otherwise OFF, then save it as source=off so the next scan is local. */
export async function lookupBarcode(uid: string, raw: string) {
  const barcode = requireBarcode(raw)
  const [mine] = await useDb().select().from(schema.products).where(and(eq(schema.products.userId, uid), eq(schema.products.barcode, barcode)))
  if (mine) return { found: true, origin: 'my_products' as const, product: publicProduct(mine) }
  const off = await offProductByBarcode(barcode)
  if (!off) return { found: false, barcode, hint: 'Not in Open Food Facts. Read the label and save it with upsert_product (source "label").' }
  if (!off.per100) return { found: false, barcode, name: off.name, brand: off.brand, hint: 'Found in Open Food Facts but without complete per-100 g nutrition. Read the label and save it with upsert_product.' }
  const saved = await upsertProduct(uid, { name: off.name, brand: off.brand ?? undefined, barcode, per100: off.per100, source: 'off' })
  return { found: true, origin: 'open_food_facts' as const, product: saved, attribution: 'Product data from Open Food Facts (ODbL)' }
}

export async function getProduct(uid: string, id: string) {
  const [row] = await useDb().select().from(schema.products).where(and(eq(schema.products.userId, uid), eq(schema.products.id, id)))
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Product not found' })
  return publicProduct(row)
}

/** All of My products, for the Products screen (search needs ≥ 2 chars). */
export async function listMyProducts(uid: string, limit = 500) {
  const rows = await useDb().select().from(schema.products).where(eq(schema.products.userId, uid)).orderBy(asc(sql`lower(${schema.products.name})`)).limit(limit)
  return rows.map(publicProduct)
}

export async function updateProduct(uid: string, id: string, input: UpsertProductInput) {
  const barcode = input.barcode ? requireBarcode(input.barcode) : null
  const [row] = await useDb().update(schema.products).set({
    name: input.name, brand: input.brand ?? null, barcode,
    ...per100Cols(input.per100),
    source: input.source, note: input.note ?? null, updatedAt: new Date(),
  }).where(and(eq(schema.products.userId, uid), eq(schema.products.id, id))).returning().catch(dbError)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Product not found' })
  return publicProduct(row)
}

/** Past entries keep their per-100 g snapshot (product_id is set to null). */
export async function deleteProduct(uid: string, id: string) {
  const [row] = await useDb().delete(schema.products).where(and(eq(schema.products.userId, uid), eq(schema.products.id, id))).returning()
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Product not found' })
  return { deleted: publicProduct(row) }
}
