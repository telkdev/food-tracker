import { MEALS, type Day, type Entry, type Meal } from './types'

/** Nutrients whose day total can be broken down by food. */
export type SourceKey = 'p' | 'f' | 'c' | 'fiber' | 'sugar' | 'salt'
export const SOURCE_KEYS: SourceKey[] = ['p', 'f', 'c', 'fiber', 'sugar', 'salt']

export interface SourceItem {
  key: string
  name: string
  /** grams of the nutrient this food gave today */
  g: number
  /** share of the day's total for the nutrient, 0–1 */
  share: number
  /** grams of the food eaten (summed when logged more than once) */
  grams: number
  meals: Meal[]
  times: number
  estimate: boolean
}

export interface SourceBreakdown {
  total: number
  items: SourceItem[]
  /** foods that gave nothing of it (e.g. no sugar in chicken) */
  zero: number
  /** foods with no data for it (old entries, estimates without fiber/sugar/salt) */
  unknown: { count: number, kcal: number }
}

/** Amount of one nutrient in one entry; null when the entry has no value for it. */
export function entryAmount(e: Entry, key: SourceKey): number | null {
  const stored = e[key]
  if (stored != null) return Number(stored)
  const per = e.per100[key]
  return per != null ? per * e.grams / 100 : null
}

/**
 * Which foods a day's total of `key` came from, biggest first.
 * The same food logged in several meals is one row (by product, else by name).
 */
export function nutrientSources(day: Pick<Day, 'meals'>, key: SourceKey): SourceBreakdown {
  const byFood = new Map<string, SourceItem>()
  const zeroFoods = new Set<string>()
  const unknownFoods = new Set<string>()
  let unknownKcal = 0
  for (const meal of MEALS) {
    for (const e of day.meals[meal]?.entries ?? []) {
      const id = e.product_id ? `p:${e.product_id}` : `n:${e.name.trim().toLowerCase()}`
      const g = entryAmount(e, key)
      if (g == null) { unknownFoods.add(id); unknownKcal += e.kcal ?? e.per100.kcal * e.grams / 100; continue }
      if (g <= 0) { zeroFoods.add(id); continue }
      const it = byFood.get(id)
      if (it) {
        it.g += g; it.grams += e.grams; it.times++
        if (!it.meals.includes(meal)) it.meals.push(meal)
        it.estimate ||= e.source === 'estimate'
      }
      else {
        byFood.set(id, { key: id, name: e.name, g, share: 0, grams: e.grams, meals: [meal], times: 1, estimate: e.source === 'estimate' })
      }
    }
  }
  const items = [...byFood.values()].sort((a, b) => b.g - a.g || a.name.localeCompare(b.name))
  const total = items.reduce((s, i) => s + i.g, 0)
  for (const i of items) i.share = total ? i.g / total : 0
  for (const id of byFood.keys()) { zeroFoods.delete(id); unknownFoods.delete(id) }
  return { total, items, zero: zeroFoods.size, unknown: { count: unknownFoods.size, kcal: Math.round(unknownKcal) } }
}

/** Digits to show for an amount: salt and small numbers get one decimal. */
export function sourceDigits(key: SourceKey, g: number) {
  return key === 'salt' ? (g < 0.1 ? 2 : 1) : g < 10 ? 1 : 0
}
