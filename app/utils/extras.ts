import type { Per100, ProductSource } from '~/utils/types'

/** Generic per-100 g values for what usually goes unlogged: cooking fat and sauces. */
export interface Extra { key: string, per100: Per100, grams: number, source: ProductSource }

export const OILS: Extra[] = [
  { key: 'oil', per100: { kcal: 884, p: 0, f: 100, c: 0 }, grams: 5, source: 'generic' },
  { key: 'butter', per100: { kcal: 748, p: 0.6, f: 82.5, c: 0.6 }, grams: 5, source: 'generic' },
]

export const SAUCES: Extra[] = [
  { key: 'ketchup', per100: { kcal: 112, p: 1.3, f: 0.2, c: 26 }, grams: 20, source: 'generic' },
  { key: 'mayo', per100: { kcal: 624, p: 0.5, f: 67, c: 2.5 }, grams: 15, source: 'generic' },
  { key: 'sourcream', per100: { kcal: 186, p: 2.5, f: 18, c: 3.6 }, grams: 20, source: 'generic' },
  { key: 'soy', per100: { kcal: 53, p: 8.1, f: 0.6, c: 4.9 }, grams: 15, source: 'generic' },
  { key: 'pesto', per100: { kcal: 460, p: 5, f: 46, c: 5 }, grams: 15, source: 'generic' },
  { key: 'garlic', per100: { kcal: 180, p: 2.5, f: 16, c: 6 }, grams: 20, source: 'estimate' },
]
