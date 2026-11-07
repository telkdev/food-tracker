# Decisions (step 1)

Checked against current docs on 2026-11-07.

## Changed from the handoff

1. **Nuxt 4, not Nuxt 3.** Nuxt 4 is the current major (4.6). Nuxt 3 is in maintenance, so starting a new app on it means migrating later. Same Vue/TS skills; the visible difference is the `app/` source folder.
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
