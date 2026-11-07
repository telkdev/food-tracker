import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

// Compact output: no indentation, rounded numbers, empty fields dropped. Every char here lands in Claude's context.
const r1 = (n: number | null | undefined) => n == null ? n : Math.round(n * 10) / 10
type AnyEntry = { id: string, meal?: string, name: string, grams: number, kcal: number | null, p: number | null, f: number | null, c: number | null, source: string, note?: string | null }
const slimEntry = (e: AnyEntry) => ({
  id: e.id, name: e.name, g: e.grams, kcal: r1(e.kcal), p: r1(e.p), f: r1(e.f), c: r1(e.c), src: e.source, ...(e.note ? { note: e.note } : {}),
})
type Day = Awaited<ReturnType<typeof getDay>>
const dayTotals = (d: Day) => ({ date: d.date, totals: d.totals, goal_kcal: d.goal.kcal, left_kcal: d.remaining_kcal })
const slimDay = (d: Day) => ({
  ...dayTotals(d),
  ...(d.goal.p || d.goal.f || d.goal.c ? { macro_goals: { p: d.goal.p, f: d.goal.f, c: d.goal.c } } : {}),
  meals: Object.fromEntries(Object.entries(d.meals).filter(([, m]) => m.entries.length)
    .map(([k, m]) => [k, { kcal: m.totals.kcal, entries: m.entries.map(slimEntry) }])),
})

/** Run a tool body, log its size for the usage page, and turn errors into a tool error Claude can read and fix. */
function tool<A>(name: string, fn: (args: A) => Promise<unknown>) {
  return async (args: A) => {
    const t0 = Date.now()
    let text: string
    let ok = true
    try {
      text = JSON.stringify(await fn(args))
    } catch (e: any) {
      ok = false
      const detail = e?.data ? ` ${JSON.stringify(e.data)}` : ''
      text = `${e?.statusMessage || e?.message || 'Error'}${detail}`
    }
    logMcpCall(name, args, text, ok, Date.now() - t0)
    return ok ? { content: [{ type: 'text' as const, text }] } : { isError: true, content: [{ type: 'text' as const, text }] }
  }
}

const per100 = z.object({
  kcal: z.number().describe('kcal per 100 g (not kJ)'),
  p: z.number().describe('protein, g per 100 g'),
  f: z.number().describe('fat, g per 100 g'),
  c: z.number().describe('carbohydrates, g per 100 g'),
})
const meal = z.enum(['breakfast', 'lunch', 'dinner', 'snack'])
const date = z.string().describe('Local date YYYY-MM-DD (Europe/Warsaw). Omit for today.')

export function buildMcpServer() {
  const server = new McpServer(
    { name: 'food-tracker', title: 'Food Tracker', version: '0.2.0' },
    { instructions: 'Personal food diary of one user (Vasyl). All values are per 100 g; the server computes totals. Search before logging, and say raw vs cooked in names. Dates are local Europe/Warsaw.' },
  )

  server.registerTool('log_food', {
    title: 'Log food',
    description: [
      'Create diary entries for one meal. The server computes kcal/protein/fat/carbs from grams × per-100 g values; never send totals.',
      'Prefer an existing product: call search_products first and pass its product_id (its per-100 g values are used).',
      'Without product_id, per100 and source are required. Values must be per 100 g, never per serving or per package.',
      'Always state whether the weight is raw or cooked in the name, e.g. "buckwheat, cooked".',
      'source: "label" (read from a package photo), "off" (Open Food Facts), "generic" (standard values for a generic food), "estimate" (you guessed grams or values, e.g. plate photo).',
      'Pass meal explicitly when the user said it; otherwise it is inferred from the time. Pass date when the user means another day (e.g. logging last night\'s dinner after midnight).',
      'Returns the created entries (g = grams) and the updated day totals.',
    ].join(' '),
    inputSchema: {
      date: date.optional(),
      meal: meal.optional(),
      items: z.array(z.object({
        name: z.string().describe('What was eaten, with raw/cooked where relevant'),
        grams: z.number().describe('Edible weight in grams'),
        product_id: z.string().optional().describe('id from search_products / lookup_barcode / upsert_product'),
        per100: per100.optional(),
        source: z.enum(['label', 'off', 'generic', 'estimate']).optional(),
        note: z.string().optional(),
      })).min(1),
    },
  }, tool('log_food', async (args) => {
    const r = await logFood(parseOr400(logFoodSchema, args))
    return { created: r.created.map(slimEntry), day: dayTotals(r.day) }
  }))

  server.registerTool('get_day', {
    title: 'Get a diary day',
    description: 'Entries grouped by meal (empty meals omitted; g = grams, src = source), totals, goal and kcal left for one day (default today).',
    inputSchema: { date: date.optional() },
    annotations: { readOnlyHint: true },
  }, tool('get_day', async ({ date }: { date?: string }) => slimDay(await getDay(date ? parseOr400(isoDate, date) : undefined))))

  server.registerTool('get_range', {
    title: 'Get totals for a date range',
    description: 'Per-day totals between two dates (inclusive) plus the average over logged days. Use for week/month trends.',
    inputSchema: { from: z.string().describe('YYYY-MM-DD'), to: z.string().describe('YYYY-MM-DD') },
    annotations: { readOnlyHint: true },
  }, tool('get_range', async ({ from, to }: { from: string, to: string }) => {
    const r = await getRange(parseOr400(isoDate, from), parseOr400(isoDate, to))
    return { goal_kcal: r.goal_kcal, logged_days: r.logged_days, avg_kcal: r.avg_kcal_logged_days, days: r.days.map(d => [d.date, d.kcal, d.p, d.f, d.c]), days_format: '[date, kcal, p, f, c]' }
  }))

  server.registerTool('search_products', {
    title: 'Search products',
    description: 'Search the user\'s saved products ("my_products", preferred) and then Open Food Facts. Each result has origin and per-100 g values. Products from my_products have an id you can pass to log_food; for an Open Food Facts result, either pass its per100 with source "off" or save it first with upsert_product. Queries in Polish, English or Russian are fine; brand names help.',
    inputSchema: { query: z.string().describe('Product name, brand or barcode') },
    annotations: { readOnlyHint: true },
  }, tool('search_products', async ({ query }: { query: string }) => {
    const r = await searchProducts(query)
    return {
      results: r.results.map(x => ({ from: x.origin === 'my_products' ? 'mine' : 'off', ...(x.id ? { id: x.id } : {}), name: x.name, ...(x.brand ? { brand: x.brand } : {}), ...(x.barcode ? { barcode: x.barcode } : {}), per100: x.per100 })),
      ...(r.off_error ? { off_error: r.off_error } : {}),
    }
  }))

  server.registerTool('lookup_barcode', {
    title: 'Look up a barcode',
    description: 'Find a product by EAN/UPC barcode: My products first, then Open Food Facts. A product found on Open Food Facts is saved to My products and returned with an id for log_food. If not found, read the package label and use upsert_product.',
    inputSchema: { barcode: z.string().describe('8–14 digits') },
  }, tool('lookup_barcode', async ({ barcode }: { barcode: string }) => lookupBarcode(barcode)))

  server.registerTool('upsert_product', {
    title: 'Save a product',
    description: 'Save a product to My products, e.g. after reading a nutrition label from a photo (source "label"). With a barcode, an existing product with that barcode is updated. Values are per 100 g, as printed in the label\'s "100 g" column, never per serving.',
    inputSchema: {
      name: z.string(), brand: z.string().optional(), barcode: z.string().optional(),
      per100, source: z.enum(['label', 'off', 'generic', 'estimate']), note: z.string().optional(),
    },
  }, tool('upsert_product', async args => upsertProduct(parseOr400(upsertProductSchema, args))))

  server.registerTool('update_entry', {
    title: 'Edit an entry',
    description: 'Change grams, meal, date, name or note of an existing entry (ids come from get_day). Totals are recomputed.',
    inputSchema: {
      id: z.string(), grams: z.number().optional(), meal: meal.optional(), date: date.optional(),
      name: z.string().optional(), note: z.string().nullable().optional(),
    },
  }, tool('update_entry', async ({ id, ...patch }: { id: string } & Record<string, unknown>) => slimEntry(await updateEntry(parseOr400(z.uuid(), id), parseOr400(updateEntrySchema, patch)))))

  server.registerTool('delete_entry', {
    title: 'Delete an entry',
    description: 'Delete one diary entry by id (from get_day). Returns the deleted entry and the updated day.',
    inputSchema: { id: z.string() },
    annotations: { destructiveHint: true },
  }, tool('delete_entry', async ({ id }: { id: string }) => {
    const r = await deleteEntry(parseOr400(z.uuid(), id))
    return { deleted: { id: r.deleted.id, name: r.deleted.name }, day: dayTotals(r.day) }
  }))

  server.registerTool('set_goals', {
    title: 'Set goals',
    description: 'Set the daily kcal goal and optional protein/fat/carbs goals in grams. Pass null to clear a macro goal.',
    inputSchema: {
      kcal_goal: z.number().int().optional(), p_goal: z.number().int().nullable().optional(),
      f_goal: z.number().int().nullable().optional(), c_goal: z.number().int().nullable().optional(),
    },
  }, tool('set_goals', async args => setGoals(parseOr400(goalsSchema, args))))

  return server
}
