# Decisions (step 1)

Checked against current docs on 2026-11-07.

## Changed from the handoff

1. **Nuxt 4, not Nuxt 3.** Nuxt 4 is the current major (4.6). Nuxt 3 reached end of life on 2026-07-31 (no more security fixes), so it is not an option for a new app. Same Vue/TS skills; the visible difference is the `app/` source folder.
2. **Entry totals are Postgres generated columns** (`kcal = round(grams * kcal100 / 100, 2)` etc.). The handoff says "computed on the server"; generated columns make it impossible to write a wrong total from anywhere, including a bug in `update_entry`.
3. **`numeric` with fixed precision, read as JS numbers.** Per-100 g `numeric(6,2)`, grams `numeric(7,1)`, totals `numeric(9,2)`. Exact decimals (no float drift in daily sums) and Drizzle's `mode: 'number'` avoids the string-typed numerics plain `numeric` gives you. `real` was rejected: 0.1 + 0.2 problems in sums.
4. **Sanity CHECK constraints**: kcal100 0–950, macros non-negative, p+f+c ≤ 105 g per 100 g, grams 0–5000, barcode 8–14 digits. These catch the most common OFF and LLM errors (kJ typed as kcal, per-serving values typed as per-100 g).
5. **Settings is a real single row**: `id = 1` with a CHECK, seeded by migration `0001` (idempotent).
6. **Session secret is `NUXT_APP_SECRET`** (nuxt-auth-utils now derives from Nuxt's `appSecret`; `NUXT_SESSION_PASSWORD` is deprecated).

## Dates and timezone

- `entries.date` is a local calendar date, computed with `Intl` in `settings.timezone`. Never from `toISOString()`, which is UTC and puts a 00:30 snack on the previous day. Tests cover CET and CEST.
- `logged_at` stays `timestamptz` (audit). Week view groups by `date`, not by `logged_at`.
- Late-night logging for "yesterday's dinner" must pass `date` explicitly (UI date picker; MCP tool description).

## Hosting

- **Render free web service is not usable for MCP.** It sleeps after 15 min and takes ~1 min to wake; claude.ai gives OAuth discovery/registration/token endpoints 10 s. Use `starter` (always on).
- **Render free Postgres is deleted** 30 days after creation (+14 days grace), no backups. Use Neon free (no expiry, scale-to-zero, PITR window) or Render `basic-256mb` (~$6/mo, backups).
- **Chosen for now (2026-11-07): all free.** Render free web + Neon free Postgres (also $0, but doesn't expire, unlike Render free Postgres). Migrations run in `startCommand`, since the free plan has no pre-deploy step. Upgrade the web service to `starter` before connecting MCP in step 5.
- Region: Frankfurt for both.

## Auth (now and later)

- Step 1: single password from `NUXT_APP_PASSWORD`, sealed cookie session, constant-time compare, all `/api/*` private except `/api/health` and login.
- Step 5 (MCP): claude.ai custom connectors support OAuth with CIMD ("Use Claude's published identity", recommended), DCR, or your own client ID. Static request headers are beta and limited to some organizations, so don't plan on them. Plan: small built-in authorization server in Nitro: protected resource metadata whose `resource` equals the exact `/mcp` URL, `401` + `WWW-Authenticate: Bearer resource_metadata=…`, AS metadata with `client_id_metadata_document_supported: true`, `token_endpoint_auth_methods_supported: ["none"]`, `code_challenge_methods_supported: ["S256"]`, rotating refresh tokens, `invalid_grant` on bad refresh, form-urlencoded `/token`. Redirect URIs: `https://claude.ai/api/mcp/auth_callback` plus port-agnostic `http://localhost/callback` and `http://127.0.0.1/callback` for Claude Code. Consent page = the app's own login (upgrade to passkey).
- Free claude.ai plan allows only one custom connector.

## Open Food Facts (for step 3)

- Product by barcode: `/api/v2/product/{code}.json?fields=…` still valid (v3 also exists). Limit: **15 req/min/IP**.
- **`/api/v2/search` has no full-text search** (filters only). Full-text goes through Search-a-licious: `https://search.openfoodfacts.org/search?q=…&langs=pl,en&page_size=…&fields=…`. Legacy `/cgi/search.pl` still counts against the search limit: **10 req/min/IP**.
- The handoff's "product reads are much more generous than search" is no longer true (15 vs 10 per minute). All calls come from one Render IP: cache lookups in `products`, debounce search, search My products first.
- User-Agent `FoodTracker/0.1 (email)` required. Develop against staging `world.openfoodfacts.net` (basic auth `off:off`).
- Licences: ODbL (database), DbCL (contents), CC BY-SA (images). Show attribution.

## Memory for Claude (2026-11-07)

- Claude's own claude.ai memory is not used for diary facts: it is unstructured and does not keep grams. The server keeps them instead.
- `preferences` (key → free-text rule) and `saved_meals` (name + items with grams and a per-100 g snapshot). MCP `get_context` returns rules, usual meals, the 20 most-logged products of the last 60 days and today's totals; the server instructions tell Claude to call it first.
- Seeded rules: everything is weighed ready to eat (grains, pasta, meat, fish cooked); oil, butter and sauces are separate entries, and Claude asks about them.
- `log_meal` logs saved items by product id when the product still exists (current values) and falls back to the snapshot otherwise.
- Oil/sauce toggles in the add sheet log generic values as their own entries (note "with <food>"), so they show up and can be edited like anything else.
- `get_day` returns `estimate_kcal`; Today shows the share of kcal that comes from guesses.

## Several users (2026-11-07)

- Users live in env, no sign-up: `NUXT_APP_PASSWORD` is user `owner` (all earlier data), `NUXT_USERS="anna:password,petr:password"` adds more. Login stays password-only; the password identifies the user, so passwords must be unique and 12+ chars (others are ignored with a log line).
- Every table has `user_id` and every query filters by it; functions take `uid` explicitly so a missing one is a type error. Settings are one row per user, created on first login with kcal 2500 and the oil/sauce rule.
- OAuth codes and tokens carry the approving user's id; `/mcp` builds the tool server for that user. Removing a user from env cuts both their app session and their Claude tokens.
- Products are per user (a barcode is unique per user), so nobody sees anyone's labels or usual meals.
- `scripts/test-users.mjs` checks isolation over the API and MCP.
