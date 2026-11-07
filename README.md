# Food Tracker

Personal food diary PWA: Nuxt 4 (Vue 3 + TS) + Nitro server routes, Postgres via Drizzle, later an MCP endpoint at `/mcp` for Claude.

Status: build step 1 (skeleton) done. See `docs/decisions.md` for why things are the way they are.

## Run locally

```bash
cp .env.example .env          # set DATABASE_URL, NUXT_APP_SECRET (32+ chars), NUXT_APP_PASSWORD (12+ chars)
npm install
npm run db:migrate            # schema + settings row (kcal_goal = 2500)
npm run db:import-artifact    # optional: entries exported from the interim artifact tracker
npm run dev
```

Other scripts: `npm test`, `npm run typecheck`, `npm run db:generate` (after editing `server/db/schema.ts`), `npm run db:studio`.

## Layout

| Path | What |
|---|---|
| `server/db/schema.ts` | products, entries, settings |
| `server/db/migrations/` | generated SQL; `0001_seed_settings.sql` seeds the single settings row |
| `server/utils/dates.ts` | local-date helpers (Europe/Warsaw), never UTC dates |
| `server/middleware/auth.ts` | everything under `/api` needs a session, except health and login |
| `scripts/migrate.mjs` | runs migrations (Render `preDeployCommand`) |
| `scripts/import-artifact.mjs` | imports the artifact export, idempotent |
| `render.yaml` | Render Blueprint |

## Deploy (Render)

1. Create a Neon project (region `aws-eu-central-1`, Frankfurt) and copy the pooled connection string, or uncomment the Render Postgres block in `render.yaml`.
2. Render → New → Blueprint → this repo. Fill `DATABASE_URL` and `NUXT_APP_PASSWORD` when asked. `NUXT_APP_SECRET` is generated.
3. Migrations run on every start (free plan has no pre-deploy step; they are idempotent).
