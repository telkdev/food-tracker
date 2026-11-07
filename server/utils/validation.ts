import { z } from 'zod'

export const isoDate = z.string().refine(isIsoDate, 'expected a date as YYYY-MM-DD')
export const mealSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack'])
export const entrySourceSchema = z.enum(['label', 'off', 'generic', 'estimate', 'lifesum'])
export const productSourceSchema = z.enum(['label', 'off', 'generic', 'estimate'])

export const per100Schema = z.object({
  kcal: z.number().min(0).max(950).describe('kcal per 100 g'),
  p: z.number().min(0).max(100).describe('protein g per 100 g'),
  f: z.number().min(0).max(100).describe('fat g per 100 g'),
  c: z.number().min(0).max(100).describe('carbohydrates g per 100 g'),
}).refine(v => v.p + v.f + v.c <= 105, 'protein + fat + carbs cannot exceed 100 g per 100 g')

export const logItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  grams: z.number().positive().max(5000),
  product_id: z.uuid().optional(),
  per100: per100Schema.optional(),
  source: entrySourceSchema.optional(),
  note: z.string().max(500).optional(),
})

export const logFoodSchema = z.object({
  date: isoDate.optional(),
  meal: mealSchema.optional(),
  items: z.array(logItemSchema).min(1).max(30),
})

export const updateEntrySchema = z.object({
  grams: z.number().positive().max(5000).optional(),
  meal: mealSchema.optional(),
  date: isoDate.optional(),
  note: z.string().max(500).nullable().optional(),
  name: z.string().trim().min(1).max(200).optional(),
})

export const upsertProductSchema = z.object({
  name: z.string().trim().min(1).max(200),
  brand: z.string().trim().max(200).optional(),
  barcode: z.string().optional(),
  per100: per100Schema,
  source: productSourceSchema,
  note: z.string().max(500).optional(),
})

export const goalsSchema = z.object({
  kcal_goal: z.number().int().min(800).max(8000).optional(),
  p_goal: z.number().int().min(0).max(1000).nullable().optional(),
  f_goal: z.number().int().min(0).max(1000).nullable().optional(),
  c_goal: z.number().int().min(0).max(2000).nullable().optional(),
})

export const prefKeySchema = z.string().regex(/^[a-z0-9_]{1,40}$/, 'key: 1–40 chars of a-z, 0-9, _')
export const setPreferenceSchema = z.object({
  key: prefKeySchema,
  text: z.string().trim().min(1).max(500).nullable(),
})

export const saveMealSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(100),
  default_meal: mealSchema.optional(),
  items: z.array(z.object({
    name: z.string().trim().min(1).max(200),
    grams: z.number().positive().max(5000),
    product_id: z.uuid().optional(),
    per100: per100Schema.optional(),
    source: entrySourceSchema.optional(),
  })).min(1).max(30).optional(),
  from: z.object({ date: isoDate, meal: mealSchema }).optional(),
}).refine(v => !!v.items !== !!v.from, 'give either items or from (date + meal)')

export const logMealSchema = z.object({
  meal_id: z.uuid(),
  date: isoDate.optional(),
  meal: mealSchema.optional(),
  scale: z.number().positive().max(5).optional(),
})

export type SetPreferenceInput = z.infer<typeof setPreferenceSchema>
export type SaveMealInput = z.infer<typeof saveMealSchema>
export type LogMealInput = z.infer<typeof logMealSchema>
export type LogFoodInput = z.infer<typeof logFoodSchema>
export type UpdateEntryInput = z.infer<typeof updateEntrySchema>
export type UpsertProductInput = z.infer<typeof upsertProductSchema>
export type GoalsInput = z.infer<typeof goalsSchema>

/** Streak carried over from another app: `days` days ending on `until` (the last day logged there). days 0 clears it. */
export const streakCarrySchema = z.object({
  days: z.number().int().min(0).max(3650),
  until: isoDate.nullable(),
}).refine(c => c.days === 0 || c.until !== null, { message: 'until is required when days > 0', path: ['until'] })
export type StreakCarryInput = z.infer<typeof streakCarrySchema>

/** zod error → 400 */
export function parseOr400<T>(schema: z.ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data)
  if (!r.success) throw createError({ statusCode: 400, statusMessage: 'Invalid input', data: z.treeifyError(r.error) })
  return r.data
}
