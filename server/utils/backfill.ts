import { and, eq, inArray, isNull, or } from 'drizzle-orm'

/**
 * Fill fiber / sugar / salt for food logged before they were tracked.
 * Never overwrites: only NULL columns are set, on products and on diary entries.
 *
 * Foods are grouped by key:
 * - a product id: the product and its entries whose per-100 g kcal still matches the product
 *   (entries logged before an edit of the product keep their own snapshot and are left alone);
 * - "n:<name>|<kcal100>" for entries without a product.
 * Values come from Open Food Facts (products with a barcode) or from the caller (Claude), whose values
 * inherit the entry's own source: a generic food gets generic values, an estimate stays an estimate.
 */

type Extra = 'fiber' | 'sugar' | 'salt'
const EXTRAS: Extra[] = ['fiber', 'sugar', 'salt']
const col = { fiber: 'fiber100', sugar: 'sugar100', salt: 'salt100' } as const
const anyMissing = (t: typeof schema.entries | typeof schema.products) => or(isNull(t.fiber100), isNull(t.sugar100), isNull(t.salt100))

const nameKey = (name: string, kcal100: number) => `n:${name.trim().toLowerCase()}|${kcal100}`

export async function listMissingNutrients(uid: string) {
  return (await missingGroups(uid)).map(({ ids: _ids, ...g }) => g)
}

async function missingGroups(uid: string) {
  const e = schema.entries
  const rows = await useDb().select().from(e).where(and(eq(e.userId, uid), anyMissing(e)))
  const ids = [...new Set(rows.map(r => r.productId).filter(Boolean))] as string[]
  const prods = ids.length ? await useDb().select().from(schema.products).where(and(eq(schema.products.userId, uid), inArray(schema.products.id, ids))) : []
  const byId = new Map(prods.map(p => [p.id, p]))
  const groups = new Map<string, { key: string, name: string, source: string, per100: Nutrition100, barcode: string | null, entries: number, missing: Extra[], ids: string[] }>()
  for (const r of rows) {
    const p = r.productId ? byId.get(r.productId) : undefined
    const key = p && p.kcal100 === r.kcal100 ? p.id : nameKey(r.name, r.kcal100)
    const g = groups.get(key)
    if (g) { g.entries++; g.ids.push(r.id); continue }
    const src = p && key === p.id ? p : r
    groups.set(key, {
      key, name: p && key === p.id ? p.name : r.name, source: src.source, per100: per100Of(src), barcode: p && key === p.id ? p.barcode : null, entries: 1,
      missing: EXTRAS.filter(x => src[col[x]] == null), ids: [r.id],
    })
  }
  return [...groups.values()].sort((a, b) => b.entries - a.entries)
}

export interface FillItem { key: string, fiber?: number, sugar?: number, salt?: number }

/** Values that pass the same rules as the DB (0–100 g, sugar ≤ carbs + 1); others are dropped. */
function clean(v: Partial<Record<Extra, number>>, c100: number) {
  const out: Partial<Record<Extra, number>> = {}
  for (const x of EXTRAS) {
    const n = v[x]
    if (n === undefined || !Number.isFinite(n) || n < 0 || n > 100) continue
    if (x === 'sugar' && n > c100 + 1) continue
    out[x] = Math.round(n * 100) / 100
  }
  return out
}

export async function fillNutrients(uid: string, input: { items?: FillItem[], off?: boolean, dry_run?: boolean }) {
  const db = useDb()
  const groups = new Map((await missingGroups(uid)).map(g => [g.key, g]))
  const plan: { key: string, name: string, from: 'off' | 'given', source: string, values: Partial<Record<Extra, number>>, entries: number }[] = []
  const skipped: { key: string, reason: string }[] = []

  // 1. Open Food Facts for products with a barcode
  if (input.off) {
    for (const g of groups.values()) {
      if (!g.barcode) continue
      let off: Awaited<ReturnType<typeof offProductByBarcode>> = null
      try { off = await offProductByBarcode(g.barcode) }
      catch (e: any) { skipped.push({ key: g.key, reason: e?.statusMessage || 'Open Food Facts error' }); continue }
      const all = off?.per100 ? clean(off.per100, g.per100.c) : {}
      const values = Object.fromEntries(g.missing.filter(x => all[x] !== undefined).map(x => [x, all[x]]))
      if (Object.keys(values).length) plan.push({ key: g.key, name: g.name, from: 'off', source: g.source, values, entries: g.entries })
      else skipped.push({ key: g.key, reason: off ? 'not in Open Food Facts data' : 'barcode not in Open Food Facts' })
    }
  }

  // 2. values given by the caller, only for what is still missing
  for (const it of input.items ?? []) {
    const g = groups.get(it.key)
    if (!g) { skipped.push({ key: it.key, reason: 'unknown key or nothing missing' }); continue }
    const done = plan.find(p => p.key === it.key)
    const given = clean(it, g.per100.c)
    const values = Object.fromEntries(g.missing.filter(x => given[x] !== undefined && done?.values[x] === undefined).map(x => [x, given[x]]))
    if (!Object.keys(values).length) { skipped.push({ key: it.key, reason: 'no valid missing values' }); continue }
    if (done) Object.assign(done.values, values)
    else plan.push({ key: g.key, name: g.name, from: 'given', source: g.source, values, entries: g.entries })
  }

  const summary = {
    groups: plan.length,
    entries: plan.reduce((a, p) => a + p.entries, 0),
    by_source: plan.reduce<Record<string, number>>((a, p) => { const k = p.from === 'off' ? 'off' : p.source; a[k] = (a[k] ?? 0) + p.entries; return a }, {}),
    per_value: Object.fromEntries(EXTRAS.map(x => [x, plan.filter(p => p.values[x] !== undefined).reduce((a, p) => a + p.entries, 0)])),
  }
  if (input.dry_run) return { dry_run: true, summary, plan, skipped }

  let entriesUpdated = 0
  let productsUpdated = 0
  const e = schema.entries
  const pr = schema.products
  for (const p of plan) {
    for (const x of EXTRAS) {
      const v = p.values[x]
      if (v === undefined) continue
      const ids = groups.get(p.key)!.ids
      if (!p.key.startsWith('n:')) {
        const r = await db.update(pr).set({ [col[x]]: v }).where(and(eq(pr.userId, uid), eq(pr.id, p.key), isNull(pr[col[x]]))).returning({ id: pr.id })
        productsUpdated += r.length
      }
      const r = await db.update(e).set({ [col[x]]: v })
        .where(and(eq(e.userId, uid), inArray(e.id, ids), isNull(e[col[x]])))
        .returning({ id: e.id })
      entriesUpdated += r.length
    }
  }
  return { dry_run: false, summary, updated: { entry_values: entriesUpdated, product_values: productsUpdated }, skipped }
}
