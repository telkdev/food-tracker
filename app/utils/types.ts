export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack']
export type EntrySource = 'label' | 'off' | 'generic' | 'estimate' | 'lifesum'
export type ProductSource = 'label' | 'off' | 'generic' | 'estimate'

export interface Per100 { kcal: number, p: number, f: number, c: number }
export interface Totals { kcal: number, p: number, f: number, c: number }

export interface Entry {
  id: string
  date?: string
  meal?: Meal
  name: string
  grams: number
  per100: Per100
  kcal: number | null
  p: number | null
  f: number | null
  c: number | null
  source: EntrySource
  note: string | null
  product_id: string | null
  logged_at: string
}

export interface Day {
  date: string
  goal: { kcal: number, p: number | null, f: number | null, c: number | null }
  totals: Totals
  remaining_kcal: number
  estimate_kcal?: number
  streak?: Streak
  meals: Record<Meal, { totals: Totals, entries: Entry[] }>
}

/** Consecutive days with at least one entry, as of today. */
export interface Streak { days: number, today_logged: boolean, since: string | null, carried: number, milestone: boolean, next_milestone: number }

export interface RangeDay { date: string, kcal: number, p: number, f: number, c: number, entries: number }
export interface Range { from: string, to: string, goal_kcal: number, logged_days: number, avg_kcal_logged_days: number | null, days: RangeDay[] }

export interface Product {
  id: string
  name: string
  brand: string | null
  barcode: string | null
  per100: Per100
  source: ProductSource
  note?: string | null
}

export interface SearchResult {
  origin: 'my_products' | 'open_food_facts'
  id: string | null
  name: string
  brand: string | null
  barcode: string | null
  per100: Per100 | null
  source: ProductSource
}

export interface Settings {
  kcalGoal: number
  pGoal: number | null
  fGoal: number | null
  cGoal: number | null
  timezone: string
  streakCarryDays: number
  streakCarryUntil: string | null
  today: string
}

/** Something that can be logged: a saved product, an OFF hit, a recent entry or a manual item. */
export interface Pickable {
  key: string
  name: string
  brand?: string | null
  barcode?: string | null
  per100: Per100
  source: EntrySource
  product_id?: string | null
  /** OFF hit or manual item that should be saved to My products before logging */
  saveAsProduct?: boolean
  lastGrams?: number
  origin: 'my_products' | 'open_food_facts' | 'recent' | 'manual'
}

export interface SavedMealItem { name: string, grams: number, product_id: string | null, per100: Per100, source: EntrySource }
export interface SavedMeal { id: string, name: string, default_meal: Meal | null, items: SavedMealItem[], kcal: number }
export interface Preference { key: string, text: string }
