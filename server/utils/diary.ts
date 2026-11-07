import { and, asc, between, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import type { Entry, Product } from '../db/schema'

const r1 = (n: number) => Math.round(n * 10) / 10
const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const

function publicEntry(e: Entry) {
  return {
    id: e.id, date: e.date, meal: e.meal, name: e.name, grams: e.grams,
    per100: { kcal: e.kcal100, p: e.p100, f: e.f100, c: e.c100 },
    kcal: e.kcal, p: e.p, f: e.f, c: e.c,
    source: e.source, note: e.note, product_id: e.productId, logged_at: e.loggedAt,
  }
}

function publicProduct(p: Product) {
  return {
    id: p.id, name: p.name, brand: p.brand, barcode: p.barcode,
    per100: { kcal: p.kcal100, p: p.p100, f: p.f100, c: p.c100 },
    source: p.source, note: p.note,
  }
}

function totals(rows: { kcal: number | null, p: number | null, f: number | null, c: number | null }[]) {
  const t = { kcal: 0, p: 0, f: 0, c: 0 }
  for (const r of rows) { t.kcal += r.kcal ?? 0; t.p += r.p ?? 0; t.f += r.f ?? 0; t.c += r.c ?? 0 }
  return { kcal: r1(t.kcal), p: r1(t.p), f: r1(t.f), c: r1(t.c) }
}

/** Translate Postgres CHECK violations into a readable 400. */
function dbError(e: any): never {
  const code = e?.code ?? e?.cause?.code
  const constraint = e?.constraint_name ?? e?.cause?.constraint_name
  if (code === '23514') throw createError({ statusCode: 400, statusMessage: `Value rejected by sanity check (${constraint}). Per-100 g values look wrong: kcal must be 0–950, protein+fat+carbs ≤ 100 g.` })
  if (code === '23505') throw createError({ statusCode: 409, statusMessage: `Already exists (${constraint})` })
  throw e
}

export async function getDay(date?: string) {
  const s = await getSettings()
  const day = date ?? localDate(s.timezone)
  const rows = await useDb().select().from(schema.entries).where(eq(schema.entries.date, day)).orderBy(asc(schema.entries.loggedAt))
  const t = totals(rows)
  return {
    date: day,
    goal: { kcal: s.kcalGoal, p: s.pGoal, f: s.fGoal, c: s.cGoal },
    totals: t,
    remaining_kcal: r1(s.kcalGoal - t.kcal),
    meals: Object.fromEntries(MEALS.map((m) => {
      const list = rows.filter(r => r.meal === m)
      return [m, { totals: totals(list), entries: list.map(publicEntry) }]
    })) as Record<typeof MEALS[number], { totals: ReturnType<typeof totals>, entries: ReturnType<typeof publicEntry>[] }>,
  }
}

export async function getRange(from: string, to: string) {
  if (from > to) throw createError({ statusCode: 400, statusMessage: '`from` must be on or before `to`' })
  const days = (Date.parse(to) - Date.parse(from)) / 86400_000
  if (days > 366) throw createError({ statusCode: 400, statusMessage: 'Range is limited to 366 days' })
  const s = await getSettings()
  const e = schema.entries
  const rows = await useDb().select({
    date: e.date,
    kcal: sql<number>`round(sum(${e.kcal}), 1)::float8`,
    p: sql<number>`round(sum(${e.p}), 1)::float8`,
    f: sql<number>`round(sum(${e.f}), 1)::float8`,
    c: sql<number>`round(sum(${e.c}), 1)::float8`,
    entries: sql<number>`count(*)::int`,
  }).from(e).where(between(e.date, from, to)).groupBy(e.date).orderBy(asc(e.date))
  const avg = rows.length ? r1(rows.reduce((a, r) => a + r.kcal, 0) / rows.length) : null
  return { from, to, goal_kcal: s.kcalGoal, logged_days: rows.length, avg_kcal_logged_days: avg, days: rows }
}

export async function logFood(input: LogFoodInput) {
  const s = await getSettings()
  const date = input.date ?? localDate(s.timezone)
  const meal = input.meal ?? mealFromTime(s.timezone)
  const db = useDb()

  const ids = input.items.map(i => i.product_id).filter(Boolean) as string[]
  const products = ids.length ? await db.select().from(schema.products).where(inArray(schema.products.id, ids)) : []
  const byId = new Map(products.map(p => [p.id, p]))

  const values = input.items.map((item, i) => {
    const prod = item.product_id ? byId.get(item.product_id) : undefined
    if (item.product_id && !prod) throw createError({ statusCode: 400, statusMessage: `items[${i}]: product ${item.product_id} not found` })
    const per100 = prod ? { kcal: prod.kcal100, p: prod.p100, f: prod.f100, c: prod.c100 } : item.per100
    if (!per100) throw createError({ statusCode: 400, statusMessage: `items[${i}] (${item.name}): give product_id or per100` })
    const source = item.source ?? prod?.source
    if (!source) throw createError({ statusCode: 400, statusMessage: `items[${i}] (${item.name}): source is required without product_id` })
    return {
      date, meal, productId: prod?.id ?? null, name: item.name, grams: item.grams,
      kcal100: per100.kcal, p100: per100.p, f100: per100.f, c100: per100.c,
      source, note: item.note ?? null,
    }
  })

  const created = await db.insert(schema.entries).values(values).returning().catch(dbError)
  return { created: created.map(publicEntry), day: await getDay(date) }
}

export async function updateEntry(id: string, patch: UpdateEntryInput) {
  const set: Partial<typeof schema.entries.$inferInsert> = {}
  if (patch.grams !== undefined) set.grams = patch.grams
  if (patch.meal !== undefined) set.meal = patch.meal
  if (patch.date !== undefined) set.date = patch.date
  if (patch.note !== undefined) set.note = patch.note
  if (patch.name !== undefined) set.name = patch.name
  if (!Object.keys(set).length) throw createError({ statusCode: 400, statusMessage: 'Nothing to update' })
  const [row] = await useDb().update(schema.entries).set(set).where(eq(schema.entries.id, id)).returning().catch(dbError)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Entry not found' })
  return publicEntry(row)
}

export async function deleteEntry(id: string) {
  const [row] = await useDb().delete(schema.entries).where(eq(schema.entries.id, id)).returning()
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Entry not found' })
  return { deleted: publicEntry(row), day: await getDay(row.date) }
}

export async function setGoals(g: GoalsInput) {
  const set: Partial<typeof schema.settings.$inferInsert> = {}
  if (g.kcal_goal !== undefined) set.kcalGoal = g.kcal_goal
  if (g.p_goal !== undefined) set.pGoal = g.p_goal
  if (g.f_goal !== undefined) set.fGoal = g.f_goal
  if (g.c_goal !== undefined) set.cGoal = g.c_goal
  if (!Object.keys(set).length) throw createError({ statusCode: 400, statusMessage: 'Nothing to update' })
  const [row] = await useDb().update(schema.settings).set(set).where(eq(schema.settings.id, 1)).returning().catch(dbError)
  return { kcal_goal: row!.kcalGoal, p_goal: row!.pGoal, f_goal: row!.fGoal, c_goal: row!.cGoal }
}

// ---------- products ----------

export async function searchMyProducts(query: string, limit = 10) {
  const q = `%${query.trim().replace(/[%_]/g, m => `\\${m}`)}%`
  const p = schema.products
  const rows = await useDb().select().from(p)
    .where(or(ilike(p.name, q), ilike(p.brand, q), eq(p.barcode, query.trim())))
    .orderBy(asc(p.name)).limit(limit)
  return rows.map(publicProduct)
}

export async function searchProducts(query: string) {
  if (query.trim().length < 2) throw createError({ statusCode: 400, statusMessage: 'Query must be at least 2 characters' })
  const mine = await searchMyProducts(query)
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

export async function upsertProduct(input: UpsertProductInput) {
  const barcode = input.barcode ? normalizeBarcode(input.barcode) : null
  if (input.barcode && !barcode) throw createError({ statusCode: 400, statusMessage: 'Barcode must be 8, 12, 13 or 14 digits' })
  const values = {
    name: input.name, brand: input.brand ?? null, barcode,
    kcal100: input.per100.kcal, p100: input.per100.p, f100: input.per100.f, c100: input.per100.c,
    source: input.source, note: input.note ?? null,
  }
  const db = useDb()
  const q = barcode
    ? db.insert(schema.products).values(values).onConflictDoUpdate({ target: schema.products.barcode, set: { ...values, updatedAt: new Date() } })
    : db.insert(schema.products).values(values)
  const [row] = await q.returning().catch(dbError)
  return publicProduct(row!)
}

/** My products first; otherwise OFF, then save it as source=off so the next scan is local. */
export async function lookupBarcode(raw: string) {
  const barcode = normalizeBarcode(raw)
  if (!barcode) throw createError({ statusCode: 400, statusMessage: 'Barcode must be 8, 12, 13 or 14 digits' })
  const [mine] = await useDb().select().from(schema.products).where(eq(schema.products.barcode, barcode))
  if (mine) return { found: true, origin: 'my_products' as const, product: publicProduct(mine) }
  const off = await offProductByBarcode(barcode)
  if (!off) return { found: false, barcode, hint: 'Not in Open Food Facts. Read the label and save it with upsert_product (source "label").' }
  if (!off.per100) return { found: false, barcode, name: off.name, brand: off.brand, hint: 'Found in Open Food Facts but without complete per-100 g nutrition. Read the label and save it with upsert_product.' }
  const saved = await upsertProduct({ name: off.name, brand: off.brand ?? undefined, barcode, per100: off.per100, source: 'off' })
  return { found: true, origin: 'open_food_facts' as const, product: saved, attribution: 'Product data from Open Food Facts (ODbL)' }
}

export async function getProduct(id: string) {
  const [row] = await useDb().select().from(schema.products).where(eq(schema.products.id, id))
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Product not found' })
  return publicProduct(row)
}

/** All of My products, for the Products screen (search needs ≥ 2 chars). */
export async function listMyProducts(limit = 500) {
  const rows = await useDb().select().from(schema.products).orderBy(asc(sql`lower(${schema.products.name})`)).limit(limit)
  return rows.map(publicProduct)
}

export async function updateProduct(id: string, input: UpsertProductInput) {
  const barcode = input.barcode ? normalizeBarcode(input.barcode) : null
  if (input.barcode && !barcode) throw createError({ statusCode: 400, statusMessage: 'Barcode must be 8, 12, 13 or 14 digits' })
  const [row] = await useDb().update(schema.products).set({
    name: input.name, brand: input.brand ?? null, barcode,
    kcal100: input.per100.kcal, p100: input.per100.p, f100: input.per100.f, c100: input.per100.c,
    source: input.source, note: input.note ?? null, updatedAt: new Date(),
  }).where(eq(schema.products.id, id)).returning().catch(dbError)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Product not found' })
  return publicProduct(row)
}

/** Past entries keep their per-100 g snapshot (product_id is set to null). */
export async function deleteProduct(id: string) {
  const [row] = await useDb().delete(schema.products).where(eq(schema.products.id, id)).returning()
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Product not found' })
  return { deleted: publicProduct(row) }
}
