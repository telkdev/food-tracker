import { and, asc, desc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm'
import type { SavedMeal, SavedMealItem } from '../db/schema'

const r1 = (n: number) => Math.round(n * 10) / 10

// ---------- preferences ----------

export async function listPreferences(uid: string) {
  const rows = await useDb().select().from(schema.preferences).where(eq(schema.preferences.userId, uid)).orderBy(asc(schema.preferences.key))
  return rows.map(r => ({ key: r.key, text: r.text, updated_at: r.updatedAt }))
}

/** Upsert a rule; text null deletes it. */
export async function setPreference(uid: string, key: string, text: string | null) {
  const db = useDb()
  if (text === null) {
    const [row] = await db.delete(schema.preferences).where(and(eq(schema.preferences.userId, uid), eq(schema.preferences.key, key))).returning()
    if (!row) throw createError({ statusCode: 404, statusMessage: `Preference ${key} not found` })
    return { deleted: key }
  }
  const [row] = await db.insert(schema.preferences).values({ userId: uid, key, text })
    .onConflictDoUpdate({ target: [schema.preferences.userId, schema.preferences.key], set: { text, updatedAt: new Date() } }).returning()
  return { key: row!.key, text: row!.text }
}

// ---------- saved meals ----------

function mealKcal(items: SavedMealItem[]) {
  return r1(items.reduce((a, i) => a + i.grams * i.per100.kcal / 100, 0))
}

function publicMeal(m: SavedMeal) {
  return { id: m.id, name: m.name, default_meal: m.defaultMeal, items: m.items, kcal: mealKcal(m.items) }
}

export async function listSavedMeals(uid: string) {
  const rows = await useDb().select().from(schema.savedMeals).where(eq(schema.savedMeals.userId, uid)).orderBy(asc(sql`lower(${schema.savedMeals.name})`))
  return rows.map(publicMeal)
}

async function getSavedMeal(uid: string, id: string) {
  const [row] = await useDb().select().from(schema.savedMeals).where(and(eq(schema.savedMeals.userId, uid), eq(schema.savedMeals.id, id)))
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Saved meal not found' })
  return row
}

/** Resolve items: product_id → that product's current values; otherwise per100 + source are required. */
async function resolveItems(uid: string, items: NonNullable<SaveMealInput['items']>): Promise<SavedMealItem[]> {
  const ids = items.map(i => i.product_id).filter(Boolean) as string[]
  const products = ids.length ? await useDb().select().from(schema.products).where(and(eq(schema.products.userId, uid), inArray(schema.products.id, ids))) : []
  const byId = new Map(products.map(p => [p.id, p]))
  return items.map((i, n) => {
    const p = i.product_id ? byId.get(i.product_id) : undefined
    if (i.product_id && !p) throw createError({ statusCode: 400, statusMessage: `items[${n}]: product ${i.product_id} not found` })
    const per100 = p ? { kcal: p.kcal100, p: p.p100, f: p.f100, c: p.c100 } : i.per100
    const source = i.source ?? p?.source
    if (!per100 || !source) throw createError({ statusCode: 400, statusMessage: `items[${n}] (${i.name}): give product_id, or per100 and source` })
    return { name: i.name, grams: i.grams, product_id: p?.id ?? null, per100, source }
  })
}

/** Items from what was logged in one meal of one day ("save today's breakfast as my usual"). */
async function itemsFromDiary(uid: string, date: string, meal: string): Promise<SavedMealItem[]> {
  const e = schema.entries
  const rows = await useDb().select().from(e)
    .where(and(eq(e.userId, uid), eq(e.date, date), eq(e.meal, meal as any))).orderBy(asc(e.loggedAt))
  if (!rows.length) throw createError({ statusCode: 400, statusMessage: `Nothing logged for ${meal} on ${date}` })
  return rows.map(r => ({
    name: r.name, grams: r.grams, product_id: r.productId,
    per100: { kcal: r.kcal100, p: r.p100, f: r.f100, c: r.c100 }, source: r.source,
  }))
}

export async function saveMeal(uid: string, input: SaveMealInput) {
  const items = input.from ? await itemsFromDiary(uid, input.from.date, input.from.meal) : await resolveItems(uid, input.items!)
  const values = { userId: uid, name: input.name, defaultMeal: input.default_meal ?? input.from?.meal ?? null, items }
  const db = useDb()
  if (input.id) {
    const [row] = await db.update(schema.savedMeals).set({ ...values, updatedAt: new Date() }).where(and(eq(schema.savedMeals.userId, uid), eq(schema.savedMeals.id, input.id))).returning()
    if (!row) throw createError({ statusCode: 404, statusMessage: 'Saved meal not found' })
    return publicMeal(row)
  }
  const [row] = await db.insert(schema.savedMeals).values(values).returning()
  return publicMeal(row!)
}

export async function deleteSavedMeal(uid: string, id: string) {
  const [row] = await useDb().delete(schema.savedMeals).where(and(eq(schema.savedMeals.userId, uid), eq(schema.savedMeals.id, id))).returning()
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Saved meal not found' })
  return { deleted: { id: row.id, name: row.name } }
}

/** Log every item of a saved meal; scale multiplies all grams (e.g. 1.5 for a bigger portion). */
export async function logSavedMeal(uid: string, input: LogMealInput) {
  const m = await getSavedMeal(uid, input.meal_id)
  const scale = input.scale ?? 1
  // products that still exist are logged by id (their current values); deleted ones fall back to the snapshot
  const ids = m.items.map(i => i.product_id).filter(Boolean) as string[]
  const alive = new Set(ids.length
    ? (await useDb().select({ id: schema.products.id }).from(schema.products).where(and(eq(schema.products.userId, uid), inArray(schema.products.id, ids)))).map(r => r.id)
    : [])
  const items = m.items.map(i => {
    const grams = r1(i.grams * scale)
    return i.product_id && alive.has(i.product_id)
      ? { name: i.name, grams, product_id: i.product_id }
      : { name: i.name, grams, per100: i.per100, source: i.source }
  })
  return logFood(uid, { date: input.date, meal: input.meal ?? m.defaultMeal ?? undefined, items })
}

// ---------- context for Claude ----------

/** Frequently logged products over the last 60 days, with the grams used most recently. */
export async function frequentProducts(uid: string, today: string, limit = 20) {
  const e = schema.entries
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 60 * 86400_000).toISOString().slice(0, 10)
  const rows = await useDb().select({
    id: e.productId,
    name: sql<string>`(array_agg(${e.name} order by ${e.loggedAt} desc))[1]`,
    last_g: sql<number>`(array_agg(${e.grams} order by ${e.loggedAt} desc))[1]::float8`,
    kcal100: sql<number>`(array_agg(${e.kcal100} order by ${e.loggedAt} desc))[1]::float8`,
    times: sql<number>`count(*)::int`,
  }).from(e).where(and(eq(e.userId, uid), isNotNull(e.productId), gte(e.date, since)))
    .groupBy(e.productId).orderBy(desc(sql`count(*)`)).limit(limit)
  return rows
}

export async function getContext(uid: string) {
  const [prefs, meals, day] = await Promise.all([listPreferences(uid), listSavedMeals(uid), getDay(uid)])
  const frequent = await frequentProducts(uid, day.date)
  return { prefs, meals, frequent, day }
}
