import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

const json = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 1) }] })

/** Run a tool body; turn h3/validation errors into an MCP tool error Claude can read and fix. */
async function run(fn: () => Promise<unknown>) {
  try { return json(await fn()) } catch (e: any) {
    const detail = e?.data ? ` ${JSON.stringify(e.data)}` : ''
    return { isError: true, content: [{ type: 'text' as const, text: `${e?.statusMessage || e?.message || 'Error'}${detail}` }] }
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
      'Returns the created entries and the updated day totals.',
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
  }, async args => run(() => logFood(parseOr400(logFoodSchema, args))))

  server.registerTool('get_day', {
    title: 'Get a diary day',
    description: 'Entries grouped by meal, totals, goals and kcal remaining for one day (default today).',
    inputSchema: { date: date.optional() },
    annotations: { readOnlyHint: true },
  }, async ({ date }) => run(() => getDay(date ? parseOr400(isoDate, date) : undefined)))

  server.registerTool('get_range', {
    title: 'Get totals for a date range',
    description: 'Per-day totals between two dates (inclusive) plus the average over logged days. Use for week/month trends.',
    inputSchema: { from: z.string().describe('YYYY-MM-DD'), to: z.string().describe('YYYY-MM-DD') },
    annotations: { readOnlyHint: true },
  }, async ({ from, to }) => run(() => getRange(parseOr400(isoDate, from), parseOr400(isoDate, to))))

  server.registerTool('search_products', {
    title: 'Search products',
    description: 'Search the user\'s saved products ("my_products", preferred) and then Open Food Facts. Each result has origin and per-100 g values. Products from my_products have an id you can pass to log_food; for an Open Food Facts result, either pass its per100 with source "off" or save it first with upsert_product. Queries in Polish, English or Russian are fine; brand names help.',
    inputSchema: { query: z.string().describe('Product name, brand or barcode') },
    annotations: { readOnlyHint: true },
  }, async ({ query }) => run(() => searchProducts(query)))

  server.registerTool('lookup_barcode', {
    title: 'Look up a barcode',
    description: 'Find a product by EAN/UPC barcode: My products first, then Open Food Facts. A product found on Open Food Facts is saved to My products and returned with an id for log_food. If not found, read the package label and use upsert_product.',
    inputSchema: { barcode: z.string().describe('8–14 digits') },
  }, async ({ barcode }) => run(() => lookupBarcode(barcode)))

  server.registerTool('upsert_product', {
    title: 'Save a product',
    description: 'Save a product to My products, e.g. after reading a nutrition label from a photo (source "label"). With a barcode, an existing product with that barcode is updated. Values are per 100 g, as printed in the label\'s "100 g" column, never per serving.',
    inputSchema: {
      name: z.string(), brand: z.string().optional(), barcode: z.string().optional(),
      per100, source: z.enum(['label', 'off', 'generic', 'estimate']), note: z.string().optional(),
    },
  }, async args => run(() => upsertProduct(parseOr400(upsertProductSchema, args))))

  server.registerTool('update_entry', {
    title: 'Edit an entry',
    description: 'Change grams, meal, date, name or note of an existing entry (ids come from get_day). Totals are recomputed.',
    inputSchema: {
      id: z.string(), grams: z.number().optional(), meal: meal.optional(), date: date.optional(),
      name: z.string().optional(), note: z.string().nullable().optional(),
    },
  }, async ({ id, ...patch }) => run(() => updateEntry(parseOr400(z.uuid(), id), parseOr400(updateEntrySchema, patch))))

  server.registerTool('delete_entry', {
    title: 'Delete an entry',
    description: 'Delete one diary entry by id (from get_day). Returns the deleted entry and the updated day.',
    inputSchema: { id: z.string() },
    annotations: { destructiveHint: true },
  }, async ({ id }) => run(() => deleteEntry(parseOr400(z.uuid(), id))))

  server.registerTool('set_goals', {
    title: 'Set goals',
    description: 'Set the daily kcal goal and optional protein/fat/carbs goals in grams. Pass null to clear a macro goal.',
    inputSchema: {
      kcal_goal: z.number().int().optional(), p_goal: z.number().int().nullable().optional(),
      f_goal: z.number().int().nullable().optional(), c_goal: z.number().int().nullable().optional(),
    },
  }, async args => run(() => setGoals(parseOr400(goalsSchema, args))))

  return server
}
