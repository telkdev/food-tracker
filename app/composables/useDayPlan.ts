import type { Meal, Per100 } from '~/utils/types'

// "Fill the rest of the day": one plan shared by the row on the calorie card (preview) and the sheet (details).
// Both show the same variant, so what the row promises is what the sheet opens with.

export type PlanFrom = 'recent' | 'history' | 'products' | 'staple'
export interface PlanItem {
  key: string, name: string, product_id: string | null, per100: Per100, source: string, grams: number, meal: Meal
  kcal: number, p: number, f: number, c: number, from: PlanFrom
  /** part of a meal he ate on that date */
  as_on?: string
}
export interface Plan {
  date: string
  goal: { kcal: number, p: number | null, f: number | null, c: number | null }
  eaten: { kcal: number, p: number, f: number, c: number }
  left_now: { kcal: number, p: number | null, f: number | null, c: number | null }
  items: PlanItem[]
  plan: { kcal: number, p: number, f: number, c: number }
  left_after: { kcal: number, p: number | null, f: number | null, c: number | null }
  gaps: string[]
  variant: number
  variants: number
}

const goneKey = (date: string) => `plan-gone:${date}`
function readGone(date: string): { key: string, name: string }[] {
  try { return JSON.parse(localStorage.getItem(goneKey(date)) ?? '[]') }
  catch { return [] }
}
function writeGone(date: string, list: { key: string, name: string }[]) {
  try { localStorage.setItem(goneKey(date), JSON.stringify(list.slice(-30))) }
  catch { /* private mode */ }
}

export function useDayPlan() {
  const plan = useState<Plan | null>('dayPlan', () => null)
  const busy = useState('dayPlanBusy', () => false)
  const variant = useState('dayPlanVariant', () => 0)
  let seq = 0

  async function fetchPlan() {
    if (!import.meta.client) return
    const my = ++seq
    busy.value = true
    try {
      const date = plan.value?.date
      // foods he said he doesn't have stay out for the rest of that day (sent as key and name, see suggest.ts)
      const gone = date ? readGone(date) : []
      const exclude = gone.flatMap(g => [g.key, g.name.slice(0, 100)])
      const r = await $fetch<Plan>('/api/plan', { query: { variant: variant.value, ...(exclude.length ? { exclude } : {}) } })
      // the first fetch of a day learns the date; refetch once if that day has saved exclusions
      if (!date && readGone(r.date).length) { plan.value = r; return fetchPlan() }
      if (my === seq) plan.value = r
    }
    finally { if (my === seq) busy.value = false }
  }

  /** ✕: he doesn't have it. Drop it at once so the tap feels instant, then refill with a replacement. */
  async function dontHave(i: PlanItem) {
    const p = plan.value
    if (!p) return
    writeGone(p.date, [...readGone(p.date), { key: i.key, name: i.name }])
    plan.value = { ...p, items: p.items.filter(x => x.key !== i.key) }
    await fetchPlan()
  }

  async function another() {
    variant.value = (variant.value + 1) % Math.max(plan.value?.variants ?? 1, 1)
    await fetchPlan()
  }

  return { plan, busy, variant, fetchPlan, dontHave, another }
}

/** "Куриная грудка, отварная" → "куриная грудка": the row on the card only needs what it is */
export function shortName(name: string) {
  const s = name.split(/[,(«]/)[0]!.trim()
  return s.charAt(0).toLowerCase() + s.slice(1)
}
