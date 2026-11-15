import { sql } from 'drizzle-orm'
import {
  bigint, boolean, check, date, index, integer, jsonb, numeric, pgEnum, pgTable, primaryKey, text, timestamp, unique, uuid,
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

// Owner of a row: users.id ("owner" is Vasyl, who had the app before multi-user). Every query filters by it.
const userId = () => text('user_id').notNull()

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}

// Sanity limits: catch kJ-in-kcal mistakes and broken OFF records before they hit the diary.
// Pure fat is ~900 kcal/100 g; protein + fat + carbs can't exceed 100 g per 100 g (small rounding slack).
const nutritionChecks = (prefix: string, t: { kcal100: any, p100: any, f100: any, c100: any, fiber100: any, sugar100: any, salt100: any }) => [
  check(`${prefix}_kcal100_range`, sql`${t.kcal100} >= 0 and ${t.kcal100} <= 950`),
  check(`${prefix}_macros_nonneg`, sql`${t.p100} >= 0 and ${t.f100} >= 0 and ${t.c100} >= 0`),
  check(`${prefix}_macros_sum`, sql`${t.p100} + ${t.f100} + ${t.c100} <= 105`),
  // optional extras (NULL = unknown, e.g. old entries and estimates). Fiber is not part of carbs on EU labels,
  // so it is not bounded by c100; sugar is a part of carbs.
  check(`${prefix}_extras_range`, sql`coalesce(${t.fiber100}, 0) between 0 and 100 and coalesce(${t.sugar100}, 0) between 0 and 100 and coalesce(${t.salt100}, 0) between 0 and 100`),
  check(`${prefix}_sugar_in_carbs`, sql`${t.sugar100} is null or ${t.sugar100} <= ${t.c100} + 1`),
]

// Fiber, sugars (total, not only added) and salt per 100 g, as on EU labels and in Open Food Facts. Nullable.
const extras100 = () => ({
  fiber100: per100('fiber100'),
  sugar100: per100('sugar100'),
  salt100: per100('salt100'),
})

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userId(),
  name: text('name').notNull(),
  brand: text('brand'),
  // Normalised GTIN (digits only). EAN-13/UPC-A normalisation happens in the app layer.
  barcode: text('barcode'),
  kcal100: per100('kcal100').notNull(),
  p100: per100('p100').notNull(),
  f100: per100('f100').notNull(),
  c100: per100('c100').notNull(),
  ...extras100(),
  source: productSource('source').notNull(),
  note: text('note'),
  ...timestamps,
}, t => [
  ...nutritionChecks('products', t),
  check('products_barcode_digits', sql`${t.barcode} ~ '^[0-9]{8,14}$'`),
  index('products_name_lower_idx').on(sql`lower(${t.name})`),
  // one product per barcode per user (Postgres allows many NULL barcodes)
  unique('products_user_barcode_unique').on(t.userId, t.barcode),
])

export const entries = pgTable('entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userId(),
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
  ...extras100(),
  // NULL when the per-100 g value is unknown
  fiber: numeric('fiber', { precision: 9, scale: 2, mode: 'number' }).generatedAlwaysAs(sql`round(grams * fiber100 / 100, 2)`),
  sugar: numeric('sugar', { precision: 9, scale: 2, mode: 'number' }).generatedAlwaysAs(sql`round(grams * sugar100 / 100, 2)`),
  salt: numeric('salt', { precision: 9, scale: 3, mode: 'number' }).generatedAlwaysAs(sql`round(grams * salt100 / 100, 3)`),
  source: entrySource('source').notNull(),
  note: text('note'),
  loggedAt: timestamp('logged_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, t => [
  ...nutritionChecks('entries', t),
  check('entries_grams_positive', sql`${t.grams} > 0 and ${t.grams} <= 5000`),
  index('entries_user_date_idx').on(t.userId, t.date),
  index('entries_product_idx').on(t.productId),
])

// One row per user, created on first use with kcal_goal = 2500.
export const settings = pgTable('settings', {
  userId: text('user_id').primaryKey(),
  kcalGoal: integer('kcal_goal').notNull().default(2500),
  pGoal: integer('p_goal'),
  fGoal: integer('f_goal'),
  cGoal: integer('c_goal'),
  timezone: text('timezone').notNull().default('Europe/Warsaw'),
  // Streak carried over from another app (e.g. FatSecret): this many days, ending on streak_carry_until.
  // Not diary entries; see server/utils/streak.ts.
  streakCarryDays: integer('streak_carry_days').notNull().default(0),
  streakCarryUntil: date('streak_carry_until', { mode: 'string' }),
  // Profile from the Tips questionnaire (all optional). Used for advice and suggested goals, never for auth.
  goalType: text('goal_type', { enum: ['recomp', 'cut', 'bulk'] }).notNull().default('recomp'),
  sex: text('sex', { enum: ['m', 'f'] }),
  birthYear: integer('birth_year'),
  heightCm: integer('height_cm'),
  // daily activity outside training: sitting job / some walking / on feet most of the day / physical work
  activity: text('activity', { enum: ['sitting', 'light', 'active', 'physical'] }),
  trainingDays: integer('training_days'),
  experience: text('experience', { enum: ['new', 'returning', 'trained'] }),
  profileDoneAt: timestamp('profile_done_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, t => [
  check('settings_kcal_goal_range', sql`${t.kcalGoal} between 800 and 8000`),
  check('settings_streak_carry_range', sql`${t.streakCarryDays} between 0 and 3650`),
  check('settings_goal_type', sql`${t.goalType} in ('recomp', 'cut', 'bulk')`),
  check('settings_sex', sql`${t.sex} in ('m', 'f')`),
  check('settings_birth_year', sql`${t.birthYear} between 1920 and 2015`),
  check('settings_height', sql`${t.heightCm} between 120 and 230`),
  check('settings_activity', sql`${t.activity} in ('sitting', 'light', 'active', 'physical')`),
  check('settings_training_days', sql`${t.trainingDays} between 0 and 7`),
  check('settings_experience', sql`${t.experience} in ('new', 'returning', 'trained')`),
])

/** Body weight, one value per local day (a new weigh-in the same day replaces it). */
export const weights = pgTable('weights', {
  userId: userId(),
  date: date('date', { mode: 'string' }).notNull(),
  kg: numeric('kg', { precision: 5, scale: 1, mode: 'number' }).notNull(),
  ...timestamps,
}, t => [
  primaryKey({ name: 'weights_pkey', columns: [t.userId, t.date] }),
  check('weights_kg_range', sql`${t.kg} between 30 and 300`),
])

// ---------- Memory for Claude: preferences and "my usual" meals ----------

/** Free-text rules Claude must follow (how food is weighed, oil/sauce habits...). Returned by get_context. */
export const preferences = pgTable('preferences', {
  userId: userId(),
  key: text('key').notNull(),
  text: text('text').notNull(),
  ...timestamps,
}, t => [
  primaryKey({ name: 'preferences_pkey', columns: [t.userId, t.key] }),
  check('preferences_key_slug', sql`${t.key} ~ '^[a-z0-9_]{1,40}$'`),
])

export type SavedMealItem = {
  name: string
  grams: number
  product_id: string | null
  // snapshot, used when the product was deleted or for items without a product
  per100: { kcal: number, p: number, f: number, c: number, fiber?: number, sugar?: number, salt?: number }
  source: 'label' | 'off' | 'generic' | 'estimate' | 'lifesum'
}

/** A meal the user eats often ("my usual breakfast"), logged in one go. */
export const savedMeals = pgTable('saved_meals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userId(),
  name: text('name').notNull(),
  defaultMeal: mealEnum('default_meal'),
  items: jsonb('items').$type<SavedMealItem[]>().notNull(),
  ...timestamps,
}, t => [index('saved_meals_name_lower_idx').on(sql`lower(${t.name})`), index('saved_meals_user_idx').on(t.userId)])

export type Product = typeof products.$inferSelect
export type Entry = typeof entries.$inferSelect
export type Settings = typeof settings.$inferSelect
export type SavedMeal = typeof savedMeals.$inferSelect
export type Preference = typeof preferences.$inferSelect

// ---------- OAuth (authorization server for the claude.ai connector; tokens belong to one user) ----------

export const oauthClients = pgTable('oauth_clients', {
  // DCR: random id we issue. CIMD: the https URL of the client's metadata document.
  id: text('id').primaryKey(),
  kind: text('kind', { enum: ['dcr', 'cimd'] }).notNull(),
  name: text('name'),
  redirectUris: text('redirect_uris').array().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  refreshedAt: timestamp('refreshed_at', { withTimezone: true }).notNull().defaultNow(),
})

export const oauthCodes = pgTable('oauth_codes', {
  codeHash: text('code_hash').primaryKey(),
  userId: userId(),
  clientId: text('client_id').notNull(),
  redirectUri: text('redirect_uri').notNull(),
  codeChallenge: text('code_challenge').notNull(),
  scope: text('scope').notNull(),
  resource: text('resource').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
})

export const oauthTokens = pgTable('oauth_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenHash: text('token_hash').notNull().unique(),
  // the user who approved the connection; every MCP call acts as this user
  userId: userId(),
  kind: text('kind', { enum: ['access', 'refresh'] }).notNull(),
  // all tokens issued from one authorization share a family; refresh-token reuse revokes the family
  familyId: uuid('family_id').notNull(),
  clientId: text('client_id').notNull(),
  scope: text('scope').notNull(),
  resource: text('resource').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('oauth_tokens_family_idx').on(t.familyId)])

// ---------- MCP usage log (how much context the connector adds to Claude chats) ----------

export const mcpCalls = pgTable('mcp_calls', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userId(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  tool: text('tool').notNull(),
  ok: boolean('ok').notNull(),
  inChars: integer('in_chars').notNull(),
  outChars: integer('out_chars').notNull(),
  // rough: ASCII ≈ 3.5 chars/token, other scripts (Cyrillic, Polish diacritics) ≈ 2 chars/token
  inTokens: integer('in_tokens').notNull(),
  outTokens: integer('out_tokens').notNull(),
  ms: integer('ms').notNull(),
}, t => [index('mcp_calls_user_at_idx').on(t.userId, t.at)])

// ---------- Users and passkeys (until migration 0008 users lived in env) ----------

export const users = pgTable('users', {
  // stable key used as user_id everywhere; never changes ("owner", "nadia"...)
  id: text('id').primaryKey(),
  // what you type to log in; can be renamed without touching data
  login: text('login').notNull().unique('users_login_unique'),
  // greeting name ("Надя"); null → capitalised login, "Вася" for owner
  name: text('name'),
  // scrypt (nuxt-auth-utils hashPassword); null = can't log in with a password (invite pending or passkey only)
  passwordHash: text('password_hash'),
  isAdmin: boolean('is_admin').notNull().default(false),
  // bumped by "log out everywhere" and password resets; session cookies carry it as `sv`
  sessionVersion: integer('session_version').notNull().default(1),
  // one-time link to set a password (new user or reset): sha256 of the token
  inviteHash: text('invite_hash').unique('users_invite_hash_unique'),
  inviteExpiresAt: timestamp('invite_expires_at', { withTimezone: true }),
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
  ...timestamps,
}, t => [
  check('users_login_format', sql`${t.login} ~ '^[a-z0-9_]{1,30}$'`),
  check('users_id_format', sql`${t.id} ~ '^[a-z0-9_]{1,30}$'`),
])

export const passkeys = pgTable('passkeys', {
  // WebAuthn credential id (base64url)
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  publicKey: text('public_key').notNull(),
  counter: bigint('counter', { mode: 'number' }).notNull().default(0),
  backedUp: boolean('backed_up').notNull().default(false),
  transports: text('transports').array(),
  name: text('name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
}, t => [index('passkeys_user_idx').on(t.userId)])

export type User = typeof users.$inferSelect
export type Passkey = typeof passkeys.$inferSelect
