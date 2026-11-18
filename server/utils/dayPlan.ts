/**
 * Day plan from foods the user actually ate recently: pick portions of those foods so the rest of the day
 * lands near the kcal goal, reaches protein, stays under the fat limit and roughly fits carbs.
 *
 * Candidates come in tiers (what he surely has → what he might buy): eaten in the last days, eaten in the
 * last weeks, his own products, and a few common lean staples. Each food in the plan costs a little by
 * tier, so older or new foods only get in when they close a real protein/carb gap.
 *
 * Pure (no DB): server/utils/suggest.ts feeds it the candidates. Local search over portion steps: from an
 * empty plan, repeatedly add, remove or swap one step of a food, whichever lowers the loss most.
 * Deterministic, explainable, and fast enough for a few dozen candidates.
 */

export type PlanMeal = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export const PLAN_MEALS: PlanMeal[] = ['breakfast', 'lunch', 'dinner', 'snack']

export interface Macros { kcal: number, p: number, f: number, c: number }

export interface PlanCandidate {
  key: string
  name: string
  product_id: string | null
  per100: Macros
  source: 'label' | 'off' | 'generic' | 'estimate' | 'lifesum'
  /** grams he usually eats of it (last or median portion) */
  typical_g: number
  /** meal he usually eats it at */
  usual_meal: PlanMeal
  last_date: string
  /** 0 = eaten in the last days, 1 = eaten in the last weeks, 2 = one of his products, 3 = common staple */
  tier?: PlanTier
  /** may be added on its own as a top-up (false: only as part of a past meal, e.g. ketchup, oil, spinach) */
  single?: boolean
  /** most grams to add on its own today (e.g. less when he already ate some today) */
  max_g?: number
}

export type PlanTier = 0 | 1 | 2 | 3
export const TIER_FROM = ['recent', 'history', 'products', 'staple'] as const
/** extra loss per distinct food, by tier: prefer fewer things, and things he surely has */
const TIER_COST = [0.004, 0.02, 0.04, 0.06]

/** What is left for today. A macro goal of null is ignored. */
export interface PlanTarget { kcal: number, p: number | null, f: number | null, c: number | null }

export interface PlanItem {
  key: string
  name: string
  product_id: string | null
  per100: Macros
  source: PlanCandidate['source']
  grams: number
  meal: PlanMeal
  kcal: number
  p: number
  f: number
  c: number
  /** where it comes from: recent / history (eaten in the last weeks) / products (his library) / staple */
  from: typeof TIER_FROM[number]
  /** part of a meal he ate before: the date of that meal (shown as "как 13.11") */
  as_on?: string
}

const r1 = (n: number) => Math.round(n * 10) / 10
const at = (per100: Macros, g: number): Macros => ({ kcal: per100.kcal * g / 100, p: per100.p * g / 100, f: per100.f * g / 100, c: per100.c * g / 100 })

/** Portion step: half his usual portion, rounded to 5 g (min 5 g, so a 10 g spoonful still moves in 5 g). */
export function stepOf(typical: number) {
  return Math.max(5, Math.round(typical / 2 / 5) * 5)
}

/**
 * How far a plan is from the target. Squared relative errors:
 * - kcal both ways (over a bit worse);
 * - protein only when short (a little extra is fine), and that weighs a lot: it's what he struggles with;
 * - fat only when over the limit, and that weighs most: it's a cap, not a target;
 * - carbs both ways: short carbs is a real miss too (training fuel), over a bit worse.
 */
export function planLoss(sum: Macros, t: PlanTarget, itemCost = 0) {
  const rel = (d: number, scale: number) => d / Math.max(scale, 1)
  const kd = sum.kcal - t.kcal
  let loss = (kd > 0 ? 1.5 : 1) * rel(kd, Math.max(t.kcal, 300)) ** 2 * 3
  if (t.p != null) {
    const short = Math.max(0, t.p - sum.p)
    loss += 4 * rel(short, Math.max(t.p, 20)) ** 2
    loss += 0.1 * rel(Math.max(0, sum.p - t.p), Math.max(t.p, 20)) ** 2
  }
  if (t.f != null) {
    const over = Math.max(0, sum.f - Math.max(t.f, 0))
    loss += 8 * rel(over, Math.max(t.f, 10)) ** 2
  }
  if (t.c != null) {
    const cd = sum.c - Math.max(t.c, 0)
    loss += (cd > 0 ? 1.2 : 1) * rel(cd, Math.max(t.c, 30)) ** 2
  }
  // small cost per distinct food (by tier, see TIER_COST)
  return loss + itemCost
}

/** Meals still ahead today: after the last meal already logged (snack is always open). */
export function mealsAhead(logged: PlanMeal[]): PlanMeal[] {
  const last = Math.max(-1, ...logged.filter(m => m !== 'snack').map(m => PLAN_MEALS.indexOf(m)))
  return PLAN_MEALS.filter((m, i) => m === 'snack' || i > last)
}

function placeMeal(usual: PlanMeal, ahead: PlanMeal[]): PlanMeal {
  if (ahead.includes(usual)) return usual
  // a breakfast/lunch food after that meal is over goes to the next main meal still open
  return ahead.find(m => m !== 'snack') ?? 'snack'
}

export interface PlanResult {
  items: PlanItem[]
  plan: Macros
  /** what is still left after the plan (negative = over) */
  left_after: { kcal: number, p: number | null, f: number | null, c: number | null }
  /** human hints about what the plan couldn't fix */
  gaps: string[]
}

export function planDay(candidates: PlanCandidate[], target: PlanTarget, opts: { ahead?: PlanMeal[], maxItems?: number, maxMain?: number } = {}): PlanResult {
  const ahead = opts.ahead?.length ? opts.ahead : PLAN_MEALS
  const maxItems = opts.maxItems ?? 7
  const costOf = (c: PlanCandidate) => TIER_COST[c.tier ?? 0]!
  const grams = new Map<string, number>()
  const byKey = new Map(candidates.map(c => [c.key, c]))
  const sum: Macros = { kcal: 0, p: 0, f: 0, c: 0 }
  const add = (c: PlanCandidate, g: number) => { const m = at(c.per100, g); sum.kcal += m.kcal; sum.p += m.p; sum.f += m.f; sum.c += m.c }

  if (target.kcal > 50) {
    const steps = new Map(candidates.map(c => [c.key, stepOf(c.typical_g)]))
    // at most twice his usual portion: a plan of 3 bottles of skyr is not a plan
    const maxG = (c: PlanCandidate) => c.max_g ?? Math.min(Math.max(c.typical_g * 2, steps.get(c.key)! * 2), 1000)
    const tryMove = (moves: [PlanCandidate, number][]) => {
      const next = { ...sum }
      let n = grams.size
      let cost = itemCost
      // foods eaten as a main meal (chicken, turkey) count separately: one is a top-up, two are a second dinner
      let mains = opts.maxMain == null ? 0 : [...grams.keys()].filter(k => byKey.get(k)!.usual_meal !== 'snack').length
      for (const [c, dg] of moves) {
        const cur = grams.get(c.key) ?? 0
        const g = cur + dg
        if (g < 0 || g > maxG(c)) return null
        if (cur === 0 && g > 0) { n++; cost += costOf(c); if (c.usual_meal !== 'snack') mains++ }
        if (cur > 0 && g === 0) { n--; cost -= costOf(c); if (c.usual_meal !== 'snack') mains-- }
        const m = at(c.per100, dg)
        next.kcal += m.kcal; next.p += m.p; next.f += m.f; next.c += m.c
      }
      if (n > maxItems) return null
      if (opts.maxMain != null && mains > opts.maxMain) return null
      return planLoss(next, target, cost)
    }
    let itemCost = 0
    let loss = planLoss(sum, target, 0)
    for (let iter = 0; iter < 300; iter++) {
      let best: { moves: [PlanCandidate, number][], loss: number } | null = null
      const consider = (moves: [PlanCandidate, number][]) => {
        const l = tryMove(moves)
        if (l != null && l < loss - 1e-6 && (!best || l < best.loss)) best = { moves, loss: l }
      }
      for (const a of candidates) {
        const sa = steps.get(a.key)!
        consider([[a, sa]])
        if (grams.has(a.key)) {
          consider([[a, -Math.min(sa, grams.get(a.key)!)]])
          // swap: one step less of a, one step more of b (escapes the greedy's dead ends)
          for (const b of candidates) if (b !== a) consider([[a, -Math.min(sa, grams.get(a.key)!)], [b, steps.get(b.key)!]])
        }
      }
      if (!best) break
      for (const [c, dg] of (best as { moves: [PlanCandidate, number][] }).moves) {
        const cur = grams.get(c.key) ?? 0
        const g = cur + dg
        if (cur === 0 && g > 0) itemCost += costOf(c)
        if (cur > 0 && g === 0) itemCost -= costOf(c)
        if (g > 0) grams.set(c.key, g)
        else grams.delete(c.key)
        add(c, dg)
      }
      loss = (best as { loss: number }).loss
    }
  }

  const items: PlanItem[] = [...grams].map(([key, g]) => {
    const c = byKey.get(key)!
    const m = at(c.per100, g)
    return { key, name: c.name, product_id: c.product_id, per100: c.per100, source: c.source, grams: g, meal: placeMeal(c.usual_meal, ahead), kcal: r1(m.kcal), p: r1(m.p), f: r1(m.f), c: r1(m.c), from: TIER_FROM[c.tier ?? 0] }
  }).sort((a, b) => PLAN_MEALS.indexOf(a.meal) - PLAN_MEALS.indexOf(b.meal) || b.kcal - a.kcal)

  const plan = { kcal: r1(sum.kcal), p: r1(sum.p), f: r1(sum.f), c: r1(sum.c) }
  const left = {
    kcal: r1(target.kcal - sum.kcal),
    p: target.p == null ? null : r1(target.p - sum.p),
    f: target.f == null ? null : r1(target.f - sum.f),
    c: target.c == null ? null : r1(target.c - sum.c),
  }
  const gaps: string[] = []
  if (target.kcal <= 50) gaps.push('kcal goal already reached: nothing to plan')
  if (target.f != null && target.f <= 0) gaps.push(`fat limit already reached (${r1(-target.f)} g over): only near fat-free foods fit`)
  if (left.p != null && left.p > 10) gaps.push(`protein still ${Math.round(left.p)} g short: even with his products and lean staples it doesn't fit within kcal and fat; suggest a protein shake or cutting fat elsewhere`)
  if (target.f != null && target.f > 0 && left.f != null && left.f < -3) gaps.push(`fat ${Math.round(-left.f)} g over the limit even in the best mix`)
  if (left.kcal > 250) gaps.push(`${Math.round(left.kcal)} kcal still free: not enough suitable foods`)
  return { items, plan, left_after: left, gaps }
}

// ---------------------------------------------------------------------------------------------------------
// v2: plan by whole meals he already ate, then top up with single foods.
//
// v1 above picks any mix of foods that fits the numbers, which gives plans like "pizza 450 g + cottage cheese
// 375 g for dinner": right macros, not a meal anyone eats. Here each main meal still ahead gets one meal he
// actually ate before (a "combo": the foods he logged together that day, e.g. tortilla + ham + cheese +
// spinach), scaled as a whole, and only then at most two single foods close what is left (protein, kcal).
// Several distinct plans come out ranked, so "another option" can show the next one.
// ---------------------------------------------------------------------------------------------------------

export interface PlanCombo {
  /** signature: the sorted food keys */
  key: string
  /** last time he ate it */
  date: string
  meal: PlanMeal
  parts: { key: string, grams: number }[]
  /** how many times he ate this same set of foods */
  count: number
  tier: PlanTier
}

export interface PlanV2Result extends PlanResult {
  /** which of the ranked plans this is (0 = best) and how many distinct ones there are */
  variant: number
  variants: number
}

const SCALES = [0.5, 0.75, 1, 1.25, 1.5]
const round5 = (g: number) => Math.max(5, Math.round(g / 5) * 5)
const COMBO_TIER_COST = [0, 0.02, 0.04, 0.06]
/** extra cost per single top-up food: a plan is meals first, additions only when they really help */
const SINGLE_COST = 0.03

/** combos that fit a meal slot: same meal; lunch and dinner swap freely (a small cost) */
function fits(combo: PlanCombo, slot: PlanMeal) {
  if (combo.meal === slot) return 0
  if ((combo.meal === 'lunch' && slot === 'dinner') || (combo.meal === 'dinner' && slot === 'lunch')) return 0.01
  return null
}

export function planDayV2(
  candidates: PlanCandidate[],
  combos: PlanCombo[],
  target: PlanTarget,
  opts: { ahead?: PlanMeal[], variant?: number, eatenToday?: Map<string, number> } = {},
): PlanV2Result {
  const ahead = opts.ahead?.length ? opts.ahead : PLAN_MEALS
  const byKey = new Map(candidates.map(c => [c.key, c]))
  const eatenToday = opts.eatenToday ?? new Map<string, number>()
  const singles = candidates.filter(c => c.single !== false)
  const fallback = () => ({ ...planDay(singles, target, { ahead, maxItems: 5 }), variant: 0, variants: 1 })
  if (target.kcal <= 50) return fallback()

  const mains = ahead.filter(m => m !== 'snack')
  // a big morning plan only maps out the next two main meals; the rest comes later in the day
  // the snack is a slot too: a past snack he had (bread + cheese + ham, a skyr) may fill a big evening gap
  const slots: PlanMeal[] = [...mains.slice(0, 2), 'snack']
  const usable = combos.filter(c => c.parts.every(p => byKey.has(p.key)))

  type Opt = { combo: PlanCombo, scale: number, slot: PlanMeal, m: Macros, cost: number }
  const macrosOf = (combo: PlanCombo, scale: number) => combo.parts.reduce<Macros>((a, p) => {
    const m = at(byKey.get(p.key)!.per100, round5(p.grams * scale))
    return { kcal: a.kcal + m.kcal, p: a.p + m.p, f: a.f + m.f, c: a.c + m.c }
  }, { kcal: 0, p: 0, f: 0, c: 0 })
  const optsFor = (slot: PlanMeal): Opt[] => usable.flatMap((combo) => {
    const fit = fits(combo, slot)
    if (fit == null) return []
    const base = macrosOf(combo, 1)
    // the same foods he already had today (in grams that matter) make a poor second meal
    const repeatKcal = combo.parts.reduce((a, p) => a + (eatenToday.has(p.key) ? at(byKey.get(p.key)!.per100, p.grams).kcal : 0), 0)
    const repeat = base.kcal > 0 ? repeatKcal / base.kcal : 0
    const often = -0.01 * Math.min(combo.count - 1, 3)
    return SCALES.map(scale => ({
      combo, scale, slot, m: scale === 1 ? base : macrosOf(combo, scale),
      cost: COMBO_TIER_COST[combo.tier]! + fit + often + 0.25 * repeat * repeat + 0.04 * Math.abs(scale - 1) ** 2 * 4,
    }))
  })

  // beam over the slots: keep the best partial plans by loss against the whole target
  type State = { picks: Opt[], m: Macros, cost: number }
  const add = (a: Macros, b: Macros): Macros => ({ kcal: a.kcal + b.kcal, p: a.p + b.p, f: a.f + b.f, c: a.c + b.c })
  let beam: State[] = [{ picks: [], m: { kcal: 0, p: 0, f: 0, c: 0 }, cost: 0 }]
  for (const slot of slots) {
    const options = optsFor(slot)
    const next: State[] = []
    for (const st of beam) {
      next.push(st) // the slot may stay empty (e.g. little left)
      for (const o of options) {
        if (st.picks.some(p => p.combo.key === o.combo.key || p.combo.parts.some(x => o.combo.parts.some(y => y.key === x.key)))) continue
        next.push({ picks: [...st.picks, o], m: add(st.m, o.m), cost: st.cost + o.cost })
      }
    }
    next.sort((a, b) => planLoss(a.m, target, a.cost) - planLoss(b.m, target, b.cost))
    beam = next.slice(0, 40)
  }

  // top up each of the best combo plans with at most two single foods, then rank the finished plans
  type Done = { picks: Opt[], top: PlanResult, loss: number, sig: string }
  const done: Done[] = []
  for (const st of beam.slice(0, 16)) {
    const used = new Set(st.picks.flatMap(p => p.combo.parts.map(x => x.key)))
    const left: PlanTarget = {
      kcal: target.kcal - st.m.kcal,
      p: target.p == null ? null : target.p - st.m.p,
      f: target.f == null ? null : target.f - st.m.f,
      c: target.c == null ? null : target.c - st.m.c,
    }
    // and not the same kind of food under another brand (two cottage cheeses in one plan): first word of the name
    const kind = (k: string) => byKey.get(k)!.name.toLowerCase().split(/[\s,(]+/)[0]
    const usedKinds = new Set([...used].map(kind))
    const pool = singles.filter(c => !used.has(c.key) && !usedKinds.has(kind(c.key)))
    // a little or nothing left: no top-ups, and no "kcal reached" gap from the inner planner
    const top = left.kcal > 60 ? planDay(pool, left, { ahead: slots, maxItems: 2, maxMain: 1 }) : { items: [], plan: { kcal: 0, p: 0, f: 0, c: 0 }, left_after: left, gaps: [] }
    const total = add(st.m, top.plan)
    const cost = st.cost + top.items.reduce((a, i) => a + SINGLE_COST + TIER_COST[TIER_FROM.indexOf(i.from)]!, 0)
    const sig = st.picks.map(p => p.combo.key).sort().join('|') || top.items.map(i => i.key).sort().join('|')
    done.push({ picks: st.picks, top, loss: planLoss(total, target, cost), sig })
  }
  done.sort((a, b) => a.loss - b.loss)
  // distinct plans: a different set of meals, not the same meals in another size
  const distinct: Done[] = []
  for (const d of done) if (!distinct.some(x => x.sig === d.sig)) distinct.push(d)
  // only offer alternatives that are not much worse than the best one
  const best = distinct[0]
  if (!best || (!best.picks.length && !best.top.items.length)) return fallback()
  const good = distinct.filter(d => d.loss <= best.loss + 0.35).slice(0, 5)
  const variant = ((opts.variant ?? 0) % good.length + good.length) % good.length
  const pick = good[variant]!

  const items: PlanItem[] = []
  for (const o of pick.picks) {
    for (const part of o.combo.parts) {
      const c = byKey.get(part.key)!
      const g = round5(part.grams * o.scale)
      const m = at(c.per100, g)
      items.push({ key: c.key, name: c.name, product_id: c.product_id, per100: c.per100, source: c.source, grams: g, meal: o.slot, kcal: r1(m.kcal), p: r1(m.p), f: r1(m.f), c: r1(m.c), from: TIER_FROM[o.combo.tier], as_on: o.combo.date })
    }
  }
  // top-ups go to the slot of the plan's last meal, or to the snack
  for (const i of pick.top.items) items.push({ ...i, meal: slots.includes(i.meal) ? i.meal : 'snack' })
  items.sort((a, b) => PLAN_MEALS.indexOf(a.meal) - PLAN_MEALS.indexOf(b.meal) || Number(!a.as_on) - Number(!b.as_on) || b.kcal - a.kcal)

  const sum = items.reduce<Macros>((a, i) => ({ kcal: a.kcal + i.kcal, p: a.p + i.p, f: a.f + i.f, c: a.c + i.c }), { kcal: 0, p: 0, f: 0, c: 0 })
  const plan = { kcal: r1(sum.kcal), p: r1(sum.p), f: r1(sum.f), c: r1(sum.c) }
  const left = {
    kcal: r1(target.kcal - sum.kcal),
    p: target.p == null ? null : r1(target.p - sum.p),
    f: target.f == null ? null : r1(target.f - sum.f),
    c: target.c == null ? null : r1(target.c - sum.c),
  }
  const gaps: string[] = []
  if (target.f != null && target.f <= 0) gaps.push(`fat limit already reached (${r1(-target.f)} g over): only near fat-free foods fit`)
  if (left.p != null && left.p > 15) gaps.push(`protein still ${Math.round(left.p)} g short: his usual meals can't close it within kcal and fat; suggest a protein shake or cutting fat elsewhere`)
  if (target.f != null && target.f > 0 && left.f != null && left.f < -5) gaps.push(`fat ${Math.round(-left.f)} g over the limit even in the best mix`)
  if (left.kcal > 300) gaps.push(`${Math.round(left.kcal)} kcal still free: not enough suitable foods`)
  return { items, plan, left_after: left, gaps, variant, variants: good.length }
}
