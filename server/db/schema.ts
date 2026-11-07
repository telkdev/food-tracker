import { sql } from 'drizzle-orm'
import {
  check, date, index, integer, numeric, pgEnum, pgTable, smallint, text, timestamp, uuid,
} from 'drizzle-orm/pg-core'

/**
 * All nutrition values are per 100 g.
 * numeric (exact decimal) instead of real/float, read as JS numbers.
 * Entry totals are Postgres GENERATED columns: nobody (client, Claude, server bug) can write them.
 */

export const productSource = pgEnum('product_source', ['label', 'off', 'generic', 'estimate'])
export const entrySource = pgEnum('entry_source', ['label', 'off', 'generic', 'estimate', 'lifesum'])
export const mealEnum = pgEnum('meal', ['breakfast', 'lunch', 'dinner', 'snack'])

// per-100 g value: up to 9999.99
const per100 = (name: string) => numeric(name, { precision: 6, scale: 2, mode: 'number' })

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}

// Sanity limits: catch kJ-in-kcal mistakes and broken OFF records before they hit the diary.
// Pure fat is ~900 kcal/100 g; protein + fat + carbs can't exceed 100 g per 100 g (small rounding slack).
const nutritionChecks = (prefix: string, t: { kcal100: any, p100: any, f100: any, c100: any }) => [
  check(`${prefix}_kcal100_range`, sql`${t.kcal100} >= 0 and ${t.kcal100} <= 950`),
  check(`${prefix}_macros_nonneg`, sql`${t.p100} >= 0 and ${t.f100} >= 0 and ${t.c100} >= 0`),
  check(`${prefix}_macros_sum`, sql`${t.p100} + ${t.f100} + ${t.c100} <= 105`),
]

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  brand: text('brand'),
  // Normalised GTIN (digits only). EAN-13/UPC-A normalisation happens in the app layer.
  barcode: text('barcode').unique(),
  kcal100: per100('kcal100').notNull(),
  p100: per100('p100').notNull(),
  f100: per100('f100').notNull(),
  c100: per100('c100').notNull(),
  source: productSource('source').notNull(),
  note: text('note'),
  ...timestamps,
}, t => [
  ...nutritionChecks('products', t),
  check('products_barcode_digits', sql`${t.barcode} ~ '^[0-9]{8,14}$'`),
  index('products_name_lower_idx').on(sql`lower(${t.name})`),
])

export const entries = pgTable('entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Local calendar date in settings.timezone. Computed on the server, never from UTC "now".
  date: date('date', { mode: 'string' }).notNull(),
  meal: mealEnum('meal').notNull(),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  grams: numeric('grams', { precision: 7, scale: 1, mode: 'number' }).notNull(),
  // snapshot of per-100 g values at log time
  kcal100: per100('kcal100').notNull(),
  p100: per100('p100').notNull(),
  f100: per100('f100').notNull(),
  c100: per100('c100').notNull(),
  // computed by Postgres
  kcal: numeric('kcal', { precision: 9, scale: 2, mode: 'number' }).generatedAlwaysAs(sql`round(grams * kcal100 / 100, 2)`),
  p: numeric('p', { precision: 9, scale: 2, mode: 'number' }).generatedAlwaysAs(sql`round(grams * p100 / 100, 2)`),
  f: numeric('f', { precision: 9, scale: 2, mode: 'number' }).generatedAlwaysAs(sql`round(grams * f100 / 100, 2)`),
  c: numeric('c', { precision: 9, scale: 2, mode: 'number' }).generatedAlwaysAs(sql`round(grams * c100 / 100, 2)`),
  source: entrySource('source').notNull(),
  note: text('note'),
  loggedAt: timestamp('logged_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, t => [
  ...nutritionChecks('entries', t),
  check('entries_grams_positive', sql`${t.grams} > 0 and ${t.grams} <= 5000`),
  index('entries_date_idx').on(t.date),
  index('entries_product_idx').on(t.productId),
])

// Exactly one row (id = 1), seeded by migration with kcal_goal = 2500.
export const settings = pgTable('settings', {
  id: smallint('id').primaryKey().default(1),
  kcalGoal: integer('kcal_goal').notNull().default(2500),
  pGoal: integer('p_goal'),
  fGoal: integer('f_goal'),
  cGoal: integer('c_goal'),
  timezone: text('timezone').notNull().default('Europe/Warsaw'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, t => [
  check('settings_single_row', sql`${t.id} = 1`),
  check('settings_kcal_goal_range', sql`${t.kcalGoal} between 800 and 8000`),
])

export type Product = typeof products.$inferSelect
export type Entry = typeof entries.$inferSelect
export type Settings = typeof settings.$inferSelect
