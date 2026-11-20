import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

// Compact output: no indentation, rounded numbers, empty fields dropped. Every char here lands in Claude's context.
const r1 = (n: number | null | undefined) => n == null ? n : Math.round(n * 10) / 10
type AnyEntry = { id: string, meal?: string, name: string, grams: number, kcal: number | null, p: number | null, f: number | null, c: number | null, source: string, note?: string | null }
const slimEntry = (e: AnyEntry) => ({
  id: e.id, name: e.name, g: e.grams, kcal: r1(e.kcal), p: r1(e.p), f: r1(e.f), c: r1(e.c), src: e.source, ...(e.note ? { note: e.note } : {}),
})
type Day = Awaited<ReturnType<typeof getDay>>
const slimStreak = (k: Day['streak']) => ({ days: k.days, today_logged: k.today_logged, ...(k.milestone ? { milestone: true } : {}) })
const dayTotals = (d: Day) => ({
  date: d.date, totals: d.totals, goal_kcal: d.goal.kcal, left_kcal: d.remaining_kcal,
  ...(d.estimate_kcal ? { estimate_kcal: d.estimate_kcal } : {}),
  water_ml: d.water.ml, water_goal_ml: d.water.goal_ml,
  // [eaten g (unknown values estimated by food type), daily reference g, share of kcal with real values]
  ...(d.totals.kcal > 0
    ? { fiber_sugar_salt: Object.fromEntries((['fiber', 'sugar', 'salt'] as const).map(k => [k, [d.extras[k].g, d.extras_goal[k], d.extras[k].coverage]])) }
    : {}),
  streak: slimStreak(d.streak),
})
const slimDay = (d: Day) => ({
  ...dayTotals(d),
  ...(d.goal.p || d.goal.f || d.goal.c ? { macro_goals: { p: d.goal.p, f: d.goal.f, c: d.goal.c } } : {}),
  meals: Object.fromEntries(Object.entries(d.meals).filter(([, m]) => m.entries.length)
    .map(([k, m]) => [k, { kcal: m.totals.kcal, entries: m.entries.map(slimEntry) }])),
  ...(d.water.logs.length ? { water_logs: d.water.logs.map(w => [w.id, w.ml]) } : {}),
})

/** Run a tool body, log its size for the usage page, and turn errors into a tool error Claude can read and fix. */
const makeTool = (uid: string) => function tool<A>(name: string, fn: (args: A) => Promise<unknown>) {
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
    logMcpCall(uid, name, args, text, ok, Date.now() - t0)
    return ok ? { content: [{ type: 'text' as const, text }] } : { isError: true, content: [{ type: 'text' as const, text }] }
  }
}

const per100 = z.object({
  kcal: z.number().describe('kcal per 100 g (not kJ)'),
  p: z.number().describe('protein, g per 100 g'),
  f: z.number().describe('fat, g per 100 g'),
  c: z.number().describe('carbohydrates, g per 100 g'),
  fiber: z.number().optional().describe('fiber, g per 100 g. Pass when the label or Open Food Facts gives it; omit if unknown (never guess 0; the server estimates unknown values by food type)'),
  sugar: z.number().optional().describe('sugars (total, "of which sugars"), g per 100 g; omit if unknown'),
  salt: z.number().optional().describe('salt, g per 100 g (if only sodium is given: sodium × 2.5); omit if unknown'),
})
const meal = z.enum(['breakfast', 'lunch', 'dinner', 'snack'])
const date = z.string().describe('Local date YYYY-MM-DD (Europe/Warsaw). Omit for today.')
const forUser = z.string().optional().describe('Someone else\'s diary: a connected person\'s login or name from get_context.connections (e.g. "nadia"). Omit for his own diary.')
/** Drop for_user before validating the rest with the shared zod schemas. */
const without = <T extends { for_user?: string }>({ for_user: _, ...rest }: T) => rest

/** One server per request, bound to the user the OAuth token belongs to: every tool reads and writes only their data. */
export function buildMcpServer(uid: string) {
  const tool = makeTool(uid)
  // tag replies for another person's diary so the confirmation names them
  const forOf = async (target: string) => (target === uid ? {} : { for_user: target, for_name: await userDisplayName(target) })
  const server = new McpServer(
    { name: 'food-tracker', title: 'Food Tracker', version: '0.7.0' },
    { instructions: [
      'Personal food diary of the signed-in user. This server IS the diary: an entry exists only if log_food or log_meal returned it. All values are per 100 g; the server computes totals. Dates are local Europe/Warsaw.',
      'Water and other drinks without calories (still or sparkling water, unsweetened tea, black coffee, herbal tea) go to log_water in ml, never to log_food. Drinks with calories (milk, juice, cola, latte, kefir, protein shake) go to log_food only and do not count as water.',
      'When the user says they ate or drank something, or asks to log, record, add or save food (e.g. "запиши", "записать", "внеси", "запиши в приложение", "я съел", "I had", "log this"), log it here in this same turn with log_food or log_meal. Never put it into a draft, note, artifact, document, memory, canvas or a table in the chat instead, and never only say you will log it later. If grams are missing for some items, log the items you can and ask about the rest in the same reply, then log them as soon as he answers. After logging, confirm briefly with what was saved and the day totals returned by the call.',
      'At the start of every conversation about food, call get_context once: it returns his standing rules (follow them), his usual meals and his most frequent products with the grams he usually eats.',
      'Prefer, in order: a usual meal (log_meal), a frequent or saved product (product_id), search_products, and only then your own estimate.',
      'Ask for grams instead of guessing; a guess must be logged with source "estimate".',
      'When he states a lasting habit or corrects you ("I always weigh rice cooked", "my mug is 300 ml"), save it with set_preference.',
      'The server sleeps when idle and takes up to ~60 s to wake. If a call times out or fails with a connection or 5xx error, tell the user the diary is waking up, wait ~30 s and retry the same call, up to 3 times, before reporting a failure. Retrying a log is safe only if the failed call returned nothing: check get_day first so nothing is logged twice.',
      'Connected people: get_context lists `connections`, people whose diary he may also fill (family, partner). When he asks to log for one of them ("запиши Наде …", "Надя съела …", "log for Nadia"), pass for_user with that person on every call for them (get_context, search_products, log_food, log_meal, log_water, get_day, update_entry, delete_entry, delete_water): call get_context with for_user once first to get their usual meals, frequent products and rules, and log with their product ids and their grams habits. Never log their food into his own diary or his into theirs; if the person is not in connections, say so instead of logging. Confirm with the person\'s name, e.g. "Записал Наде: …". Day plans and suggestions are only for the person asking, unless he asks for theirs.',
      'Day plan: on his first food log of the day, and again after a meal when what is left is unbalanced (e.g. little fat left but lots of protein, or kcal nearly used up with protein far short), call suggest_day_plan and offer the result in a few lines: what to eat for the rest of today, mostly from foods he already has, with grams, and how the day would end. Ask "Записать?" / "Log it?" and wait for a yes; never log a suggestion on your own. He may say some food is gone: call it again with exclude. After a yes, log each meal of the plan with log_food (product_id when given, otherwise the per100 and source from the plan), with any changes he asked for. Do not offer it again in the same conversation unless he asks or the balance changed after a new meal; if he declines, drop it.',
    ].join(' ') },
  )

  server.registerTool('log_food', {
    title: 'Log food',
    description: [
      'Save food to the user\'s diary in the app. Call this whenever he says he ate or drank something or asks to log/record it (\"запиши\", \"я съел\", \"I had\"); this is the only way to record food, never a note, draft or artifact.',
      'Creates diary entries for one meal. The server computes kcal/protein/fat/carbs from grams × per-100 g values; never send totals.',
      'Prefer an existing product: call search_products first and pass its product_id (its per-100 g values are used).',
      'Without product_id, per100 and source are required. Values must be per 100 g, never per serving or per package.',
      'Always state whether the weight is raw or cooked in the name, e.g. "buckwheat, cooked"; follow the weighing rule from get_context.',
      'Oil, butter and sauces are separate items in the same call, never folded into the dish; ask about them for cooked or dressed food.',
      'source: "label" (read from a package photo), "off" (Open Food Facts), "generic" (standard values for a generic food), "estimate" (you guessed grams or values, e.g. plate photo).',
      'Pass meal explicitly when the user said it; otherwise it is inferred from the time. Pass date when the user means another day (e.g. logging last night\'s dinner after midnight).',
      'per100 may also carry fiber, sugar and salt: include them whenever the label or Open Food Facts has them, and omit them when unknown: the server then estimates them by food type for the day totals (marked as estimated), so do not invent them.',
      'Returns the created entries (g = grams) and the updated day totals (fiber_sugar_salt: [eaten g, daily reference g, share of kcal with real values; the rest is estimated by food type]).',
      'If it times out (server waking), check get_day before retrying so nothing is logged twice.',
    ].join(' '),
    inputSchema: {
      for_user: forUser,
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
  }, tool('log_food', async (args: { for_user?: string }) => {
    const target = await resolveTarget(uid, args.for_user)
    const r = await logFood(target, parseOr400(logFoodSchema, without(args)), uid)
    return { ...(await forOf(target)), created: r.created.map(slimEntry), day: dayTotals(r.day) }
  }))

  server.registerTool('get_context', {
    title: 'Get memory',
    description: 'Call once at the start of a food conversation. Returns: user_name (what to call the user), connections (people whose diary he may also log into; see for_user), prefs (his standing rules; follow them), meals (his usual meals: id, name, kcal, items [name, grams]), frequent (products he logged most in 60 days: id, name, last grams, kcal per 100 g, times), and today\'s totals with streak (consecutive days with at least one entry, as of today; today_logged false means today is still open and the streak is kept until midnight). Mention the streak only in passing, e.g. when milestone is true (10, 20, 30, 50, 100 days…); never nag about it. If this first call times out or errors, the server is waking from sleep (up to ~60 s): wait ~30 s and retry up to 3 times before giving up.',
    inputSchema: { for_user: forUser },
    annotations: { readOnlyHint: true },
  }, tool('get_context', async ({ for_user }: { for_user?: string }) => {
    const target = await resolveTarget(uid, for_user)
    const c = await getContext(target)
    const conns = target === uid ? await listConnections(uid) : []
    return {
      ...(target === uid ? {} : { for_user: target, note: 'This is the context of a connected person, not his own. Pass for_user on every call for them.' }),
      user_name: await userDisplayName(target),
      ...(conns.length ? { connections: conns.map(u => [u.login, u.name]), connections_format: '[login for for_user, name]' } : {}),
      prefs: Object.fromEntries(c.prefs.map(p => [p.key, p.text])),
      meals: c.meals.map(m => ({ id: m.id, name: m.name, ...(m.default_meal ? { meal: m.default_meal } : {}), kcal: Math.round(m.kcal), items: m.items.map(i => [i.name, i.grams]) })),
      meals_items_format: '[name, grams]',
      frequent: c.frequent.map(f => [f.id, f.name, f.last_g, Math.round(f.kcal100), f.times]),
      frequent_format: '[product_id, name, last grams, kcal per 100 g, times logged]',
      today: dayTotals(c.day),
      logging: 'When he says he ate something or asks to record it, call log_food / log_meal now. Do not write food into notes, drafts or artifacts: only entries returned by those calls are in his diary.',
    }
  }))

  server.registerTool('set_preference', {
    title: 'Remember a rule',
    description: 'Save or replace one standing rule about how he eats or logs (e.g. key "weighing", "coffee", "mug"), written as an instruction to yourself in English. text null deletes the rule. Rules are shown in get_context.',
    inputSchema: {
      key: z.string().describe('short slug: a-z, 0-9, _'),
      text: z.string().nullable().describe('the rule, max 500 chars; null to delete'),
    },
  }, tool('set_preference', async args => {
    const p = parseOr400(setPreferenceSchema, args)
    return setPreference(uid, p.key, p.text)
  }))

  server.registerTool('log_meal', {
    title: 'Log a usual meal',
    description: 'Save a usual meal to the user\'s diary in the app, all items in one call (id from get_context; for another person, their meal ids from get_context with for_user, or his own). Use it when he says he ate one of his usual meals or asks to log it; never write it into a note or draft instead. scale multiplies every item\'s grams (e.g. 1.5). To change one item, log the meal and then fix that entry with update_entry, or log extra items with log_food.',
    inputSchema: { for_user: forUser, meal_id: z.string(), date: date.optional(), meal: meal.optional(), scale: z.number().optional() },
  }, tool('log_meal', async (args: { for_user?: string }) => {
    const target = await resolveTarget(uid, args.for_user)
    const r = await logSavedMeal(target, parseOr400(logMealSchema, without(args)), uid)
    return { ...(await forOf(target)), created: r.created.map(slimEntry), day: dayTotals(r.day) }
  }))

  server.registerTool('save_meal', {
    title: 'Save a usual meal',
    description: 'Save a meal he eats often so it can be logged with log_meal. Either copy what was logged: from {date, meal}; or give items (product_id preferred, otherwise per100 + source, like log_food). Pass id to replace an existing usual meal. Ask him for a short name, e.g. "usual breakfast".',
    inputSchema: {
      id: z.string().optional(),
      name: z.string(),
      default_meal: meal.optional(),
      from: z.object({ date: z.string(), meal }).optional(),
      items: z.array(z.object({
        name: z.string(), grams: z.number(), product_id: z.string().optional(),
        per100: per100.optional(), source: z.enum(['label', 'off', 'generic', 'estimate']).optional(),
      })).optional(),
    },
  }, tool('save_meal', async (args) => {
    const m = await saveMeal(uid, parseOr400(saveMealSchema, args))
    return { id: m.id, name: m.name, kcal: Math.round(m.kcal), items: m.items.map(i => [i.name, i.grams]) }
  }))

  server.registerTool('delete_meal', {
    title: 'Delete a usual meal',
    description: 'Delete a usual meal by id (from get_context). Diary entries are not affected.',
    inputSchema: { id: z.string() },
    annotations: { destructiveHint: true },
  }, tool('delete_meal', async ({ id }: { id: string }) => deleteSavedMeal(uid, parseOr400(z.uuid(), id))))

  server.registerTool('get_day', {
    title: 'Get a diary day',
    description: 'Entries grouped by meal (empty meals omitted; g = grams, src = source), totals, goal and kcal left for one day (default today), and the current streak (as of today, whatever date is asked).',
    inputSchema: { date: date.optional(), for_user: forUser },
    annotations: { readOnlyHint: true },
  }, tool('get_day', async ({ date, for_user }: { date?: string, for_user?: string }) => {
    const target = await resolveTarget(uid, for_user)
    return { ...(await forOf(target)), ...slimDay(await getDay(target, date ? parseOr400(isoDate, date) : undefined)) }
  }))

  server.registerTool('get_range', {
    title: 'Get totals for a date range',
    description: 'Per-day totals between two dates (inclusive) plus the average over logged days. Use for week/month trends.',
    inputSchema: { from: z.string().describe('YYYY-MM-DD'), to: z.string().describe('YYYY-MM-DD') },
    annotations: { readOnlyHint: true },
  }, tool('get_range', async ({ from, to }: { from: string, to: string }) => {
    const r = await getRange(uid, parseOr400(isoDate, from), parseOr400(isoDate, to))
    return { goal_kcal: r.goal_kcal, logged_days: r.logged_days, avg_kcal: r.avg_kcal_logged_days, days: r.days.map(d => [d.date, d.kcal, d.p, d.f, d.c]), days_format: '[date, kcal, p, f, c]' }
  }))

  server.registerTool('search_products', {
    title: 'Search products',
    description: 'Search the user\'s saved products ("my_products", preferred) and then Open Food Facts. Each result has origin and per-100 g values. Products from my_products have an id you can pass to log_food; for an Open Food Facts result, either pass its per100 with source "off" or save it first with upsert_product. Matching is forgiving (parts of words, any order, diacritics optional, small typos); Open Food Facts results are only products sold in Poland. Queries in Polish, English or Russian are fine; brand names help.',
    inputSchema: { query: z.string().describe('Product name, brand or barcode'), for_user: forUser.describe('Search a connected person\'s products instead of his (login or name from get_context.connections)') },
    annotations: { readOnlyHint: true },
  }, tool('search_products', async ({ query, for_user }: { query: string, for_user?: string }) => {
    const r = await searchProducts(await resolveTarget(uid, for_user), query)
    return {
      results: r.results.map(x => ({ from: x.origin === 'my_products' ? 'mine' : 'off', ...(x.id ? { id: x.id } : {}), name: x.name, ...(x.brand ? { brand: x.brand } : {}), ...(x.barcode ? { barcode: x.barcode } : {}), per100: x.per100 })),
      ...(r.off_error ? { off_error: r.off_error } : {}),
    }
  }))

  server.registerTool('lookup_barcode', {
    title: 'Look up a barcode',
    description: 'Find a product by EAN/UPC barcode: My products first, then Open Food Facts. A product found on Open Food Facts is saved to My products and returned with an id for log_food. If not found, read the package label and use upsert_product.',
    inputSchema: { barcode: z.string().describe('8–14 digits') },
  }, tool('lookup_barcode', async ({ barcode }: { barcode: string }) => lookupBarcode(uid, barcode)))

  server.registerTool('upsert_product', {
    title: 'Save a product',
    description: 'Save a product to My products, e.g. after reading a nutrition label from a photo (source "label"). With a barcode, an existing product with that barcode is updated. Values are per 100 g, as printed in the label\'s "100 g" column, never per serving. Also read fiber ("błonnik"), sugars ("w tym cukry") and salt ("sól") from the label into per100 when printed.',
    inputSchema: {
      name: z.string(), brand: z.string().optional(), barcode: z.string().optional(),
      per100, source: z.enum(['label', 'off', 'generic', 'estimate']), note: z.string().optional(),
    },
  }, tool('upsert_product', async args => upsertProduct(uid, parseOr400(upsertProductSchema, args))))

  server.registerTool('update_entry', {
    title: 'Edit an entry',
    description: 'Change grams, meal, date, name or note of an existing entry (ids come from get_day). Totals are recomputed.',
    inputSchema: {
      id: z.string(), grams: z.number().optional(), meal: meal.optional(), date: date.optional(),
      name: z.string().optional(), note: z.string().nullable().optional(), for_user: forUser,
    },
  }, tool('update_entry', async ({ id, for_user, ...patch }: { id: string, for_user?: string } & Record<string, unknown>) => {
    const target = await resolveTarget(uid, for_user)
    return slimEntry(await updateEntry(target, parseOr400(z.uuid(), id), parseOr400(updateEntrySchema, patch)))
  }))

  server.registerTool('delete_entry', {
    title: 'Delete an entry',
    description: 'Delete one diary entry by id (from get_day). Returns the deleted entry and the updated day.',
    inputSchema: { id: z.string(), for_user: forUser },
    annotations: { destructiveHint: true },
  }, tool('delete_entry', async ({ id, for_user }: { id: string, for_user?: string }) => {
    const r = await deleteEntry(await resolveTarget(uid, for_user), parseOr400(z.uuid(), id))
    return { deleted: { id: r.deleted.id, name: r.deleted.name }, day: dayTotals(r.day) }
  }))

  server.registerTool('suggest_day_plan', {
    title: 'Suggest the rest of today',
    description: [
      'Read-only. Plans the rest of today from meals he actually ate before: for each main meal still ahead (by what is logged and the clock) it picks one past meal (the foods he logged together that day), sized to what is left, then adds at most two single foods (usually protein) to close the gap. Sweets and fast food are never planned; foods he already had today in a full portion are not repeated.',
      'Items with `as_on` (a date) belong to that past meal: present them together, e.g. "ужин как 16.11: гуляш 330 г, хлеб 105 г". Each item has `from` (recent | history | products | staple): a staple or product is something he may need to buy, say so.',
      'Returns left_now (before the plan), items (meal, name, g, kcal, p, f, c, as_on, product_id or per100+source for log_food), plan totals, left_after (what is still open after it; negative = over), gaps (what the plan could not fix, tell him briefly) and variant/variants: call again with variant+1 when he wants another option.',
      'Nothing is logged: present it, ask him, and log with log_food only what he accepts. exclude: foods he says are gone (part of the name or a product id).',
    ].join(' '),
    inputSchema: {
      days: z.number().int().min(1).max(3).optional().describe('how many past days to take foods from, besides today; default 2'),
      exclude: z.array(z.string()).optional().describe('foods he no longer has: part of the name or product_id'),
      variant: z.number().int().min(0).max(50).optional().describe('0 = best plan (default); 1, 2… = the next distinct plans, for "something else"'),
    },
    annotations: { readOnlyHint: true },
  }, tool('suggest_day_plan', async (args: { days?: number, exclude?: string[], variant?: number }) => {
    const r = await suggestDayPlan(uid, parseOr400(suggestPlanSchema, args))
    return {
      date: r.date, goal: r.goal, eaten: r.eaten, left_now: r.left_now, meals_ahead: r.meals_ahead,
      items: r.items.map(i => ({ meal: i.meal, name: i.name, from: i.from, ...(i.as_on ? { as_on: i.as_on } : {}), g: i.grams, kcal: Math.round(i.kcal), p: i.p, f: i.f, c: i.c, ...(i.product_id ? { product_id: i.product_id } : { per100: i.per100, source: i.source }) })),
      plan: r.plan, left_after: r.left_after, variant: r.variant, variants: r.variants,
      ...(r.gaps.length ? { gaps: r.gaps } : {}),
      ...(r.candidates ? {} : { note: `no foods logged since ${r.from}` }),
    }
  }))

  server.registerTool('list_missing_nutrients', {
    title: 'Foods missing fiber, sugar or salt',
    description: 'Read-only. Foods in his diary whose fiber, sugar or salt per 100 g is unknown, grouped: key (pass to fill_nutrients), name, source, per100 (known values), barcode (if a saved product has one), entries (how many diary entries), missing (which values). Use it before fill_nutrients when he asks to fill these values for past days.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, tool('list_missing_nutrients', async () => {
    const list = await listMissingNutrients(uid)
    return { foods: list.map(g => [g.key, g.name, g.source, g.per100.kcal, g.per100.c, g.barcode, g.entries, g.missing.join('+')]), format: '[key, name, source, kcal100, carbs100, barcode, entries, missing]' }
  }))

  server.registerTool('fill_nutrients', {
    title: 'Fill fiber, sugar, salt for past food',
    description: [
      'Fills ONLY unknown fiber / sugar / salt (per 100 g) on saved products and past diary entries; known values are never overwritten, nothing else changes.', 'Day totals already estimate unknown values by food type, so use this only to replace those estimates with real data, not with guesses.',
      'off: true looks up products with a barcode in Open Food Facts (slow, ~14 per minute). items: values per 100 g for keys from list_missing_nutrients.',
      'Give values only where you are confident: Open Food Facts, or generic reference values for generic foods (USDA/Polish tables). Leave out estimates and foods logged from a label that did not print a value: the server\'s food-type estimate covers them.',
      'Always run with dry_run true first and show him the summary; apply only after he agrees.',
    ].join(' '),
    inputSchema: {
      dry_run: z.boolean().optional(),
      off: z.boolean().optional(),
      items: z.array(z.object({ key: z.string(), fiber: z.number().optional(), sugar: z.number().optional(), salt: z.number().optional() })).max(300).optional(),
    },
  }, tool('fill_nutrients', async (args: { dry_run?: boolean, off?: boolean, items?: FillItem[] }) => {
    const r = await fillNutrients(uid, args)
    return r.dry_run && 'plan' in r && r.plan ? { ...r, plan: r.plan.map(p => [p.key, p.name, p.from === 'off' ? 'off' : p.source, p.entries, p.values]) } : r
  }))

  server.registerTool('log_water', {
    title: 'Log water',
    description: [
      'Add drunk water to the diary in ml. Use for water and drinks without calories (sparkling water, unsweetened tea, black coffee); drinks with calories go to log_food instead.',
      'One call per drink, e.g. a glass = 250 ml, a bottle = 500 ml; use his own cup/bottle size from get_context prefs when he has one, otherwise ask if unclear.',
      'Returns the day\'s water total and goal (goal from his weight and activity, or set in Settings). Confirm briefly, e.g. "+500 мл, 1,5 из 2,4 л".',
    ].join(' '),
    inputSchema: {
      ml: z.number().int().min(1).max(3000).describe('Volume in ml'),
      date: date.optional(),
      for_user: forUser,
    },
  }, tool('log_water', async (args: { for_user?: string }) => {
    const target = await resolveTarget(uid, args.for_user)
    const r = await logWater(target, parseOr400(logWaterSchema, without(args)), uid)
    return { ...(await forOf(target)), id: r.created.id, added_ml: r.created.ml, date: r.water.date, water_ml: r.water.ml, water_goal_ml: r.water.goal_ml }
  }))

  server.registerTool('delete_water', {
    title: 'Delete water',
    description: 'Remove one water log by id (from log_water, or water_logs [id, ml] in get_day), e.g. when he says it was logged by mistake. Returns the new day total.',
    inputSchema: { id: z.string(), for_user: forUser },
    annotations: { destructiveHint: true },
  }, tool('delete_water', async (args: { id: string, for_user?: string }) => {
    const r = await deleteWater(await resolveTarget(uid, args.for_user), parseOr400(z.uuid(), args.id))
    return { deleted_ml: r.deleted.ml, date: r.water.date, water_ml: r.water.ml, water_goal_ml: r.water.goal_ml }
  }))

  server.registerTool('set_goals', {
    title: 'Set goals',
    description: 'Set the daily kcal goal and optional protein/fat/carbs goals in grams, and the daily water goal in ml. Pass null to clear a macro goal; water_goal_ml null goes back to the goal suggested from his weight and activity.',
    inputSchema: {
      kcal_goal: z.number().int().optional(), p_goal: z.number().int().nullable().optional(),
      f_goal: z.number().int().nullable().optional(), c_goal: z.number().int().nullable().optional(),
      water_goal_ml: z.number().int().nullable().optional(),
    },
  }, tool('set_goals', async args => setGoals(uid, parseOr400(goalsSchema, args))))

  server.registerTool('get_report', {
    title: 'Coach report for a period',
    description: [
      'Summary for a period (a week, a month, any range up to a year) as a coach would read it: averages over complete days',
      '(days under 40% of the kcal goal are partial and left out), goals, days within ±10% kcal, days with protein ≥ 90% of goal,',
      'macro energy split, meal split, fiber/sugar/salt (unknown values estimated by food type; coverage = share of kcal with real values), water, top foods by kcal and by protein,',
      'weight change, and per-day totals. pdf_url downloads the same report as a PDF in a browser where he is logged in to the app;',
      'in the app it is Week → "PDF-отчёт", which can share it straight to Telegram. Use this when he asks for a report or a summary for his coach.',
    ].join(' '),
    inputSchema: {
      from: z.string().describe('YYYY-MM-DD, first day'),
      to: z.string().describe('YYYY-MM-DD, last day (clamped to today)'),
    },
    annotations: { readOnlyHint: true },
  }, tool('get_report', async ({ from, to }: { from: string, to: string }) => {
    const f = parseOr400(isoDate, from)
    const t = parseOr400(isoDate, to)
    const { report: r, meta } = await getReport(uid, f, t)
    const origin = (useRuntimeConfig().siteUrl || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '')
    return {
      name: meta.name, goal_type: meta.goal_type, from: r.from, to: r.to,
      period_days: r.period_days, logged_days: r.logged_days, full_days: r.full_days, partial_days: r.partial_days,
      goal: { kcal: r.goal.kcal, p: r.goal.p, f: r.goal.f, c: r.goal.c, water_ml: r.goal.water_ml, ...(r.goal.p_suggested ? { p_from_profile: true } : {}) },
      avg: r.avg, energy_pct: r.energy_pct, adherence: r.adherence, extras: r.extras, water: r.water,
      meal_share_pct: r.meal_share, estimate_pct: r.estimate_pct,
      top_kcal: r.top_kcal.map(x => [x.name, x.times, x.grams, x.kcal, x.kcal_share, x.p]),
      top_protein: r.top_protein.map(x => [x.name, x.times, x.grams, x.p, x.p_share]),
      top_format: { top_kcal: '[name, times, grams, kcal, % of kcal, protein g]', top_protein: '[name, times, grams, protein g, % of protein]' },
      ...(r.weight ? { weight: { start: r.weight.start, end: r.weight.end, change_kg: r.weight.change, per_week_kg: r.weight.per_week, weigh_ins: r.weight.weigh_ins } } : {}),
      days: r.days.filter(d => d.logged).map(d => [d.date, d.kcal, d.p, d.f, d.c, d.water_ml, d.partial ? 1 : 0]),
      days_format: '[date, kcal, p, f, c, water ml, partial]',
      pdf_url: `${origin}/api/report.pdf?from=${r.from}&to=${r.to}&lang=ru&details=1`,
    }
  }))

  return server
}
