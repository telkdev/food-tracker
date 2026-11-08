/**
 * Day plan from foods the user actually ate recently: pick portions of those foods so the rest of the day
 * lands near the kcal goal, reaches protein, stays under the fat limit and roughly fits carbs.
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
}

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
 * - protein only when short (a little extra is fine);
 * - fat only when over the limit, and that weighs most: it's a cap, not a target;
 * - carbs both ways but lightly: they're what's left after the other three.
 */
export function planLoss(sum: Macros, t: PlanTarget, items = 0) {
  const rel = (d: number, scale: number) => d / Math.max(scale, 1)
  const kd = sum.kcal - t.kcal
  let loss = (kd > 0 ? 1.5 : 1) * rel(kd, Math.max(t.kcal, 300)) ** 2 * 3
  if (t.p != null) {
    const short = Math.max(0, t.p - sum.p)
    loss += 2.5 * rel(short, Math.max(t.p, 20)) ** 2
    loss += 0.1 * rel(Math.max(0, sum.p - t.p), Math.max(t.p, 20)) ** 2
  }
  if (t.f != null) {
    const over = Math.max(0, sum.f - Math.max(t.f, 0))
    loss += 8 * rel(over, Math.max(t.f, 10)) ** 2
  }
  if (t.c != null) {
    const cd = sum.c - Math.max(t.c, 0)
    loss += (cd > 0 ? 1 : 0.4) * rel(cd, Math.max(t.c, 30)) ** 2
  }
  // tiny cost per distinct food: prefer fewer things when it hardly matters
  return loss + items * 0.004
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

export function planDay(candidates: PlanCandidate[], target: PlanTarget, opts: { ahead?: PlanMeal[], maxItems?: number } = {}): PlanResult {
  const ahead = opts.ahead?.length ? opts.ahead : PLAN_MEALS
  const maxItems = opts.maxItems ?? 7
  const grams = new Map<string, number>()
  const byKey = new Map(candidates.map(c => [c.key, c]))
  const sum: Macros = { kcal: 0, p: 0, f: 0, c: 0 }
  const add = (c: PlanCandidate, g: number) => { const m = at(c.per100, g); sum.kcal += m.kcal; sum.p += m.p; sum.f += m.f; sum.c += m.c }

  if (target.kcal > 50) {
    const steps = new Map(candidates.map(c => [c.key, stepOf(c.typical_g)]))
    // at most twice his usual portion: a plan of 3 bottles of skyr is not a plan
    const maxG = (c: PlanCandidate) => Math.min(Math.max(c.typical_g * 2, steps.get(c.key)! * 2), 1000)
    const tryMove = (moves: [PlanCandidate, number][]) => {
      const next = { ...sum }
      let n = grams.size
      for (const [c, dg] of moves) {
        const cur = grams.get(c.key) ?? 0
        const g = cur + dg
        if (g < 0 || g > maxG(c)) return null
        if (cur === 0 && g > 0) n++
        if (cur > 0 && g === 0) n--
        const m = at(c.per100, dg)
        next.kcal += m.kcal; next.p += m.p; next.f += m.f; next.c += m.c
      }
      if (n > maxItems) return null
      return planLoss(next, target, n)
    }
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
        const g = (grams.get(c.key) ?? 0) + dg
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
    return { key, name: c.name, product_id: c.product_id, per100: c.per100, source: c.source, grams: g, meal: placeMeal(c.usual_meal, ahead), kcal: r1(m.kcal), p: r1(m.p), f: r1(m.f), c: r1(m.c) }
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
  if (left.p != null && left.p > 10) gaps.push(`protein still ${Math.round(left.p)} g short: his recent foods can't cover it within kcal and fat; offer a bigger portion of a lean one or a lean protein not in the plan (chicken breast, skyr, egg whites, whey)`)
  if (target.f != null && target.f > 0 && left.f != null && left.f < -3) gaps.push(`fat ${Math.round(-left.f)} g over the limit even in the best mix`)
  if (left.kcal > 250) gaps.push(`${Math.round(left.kcal)} kcal still free: not enough suitable recent foods`)
  return { items, plan, left_after: left, gaps }
}
