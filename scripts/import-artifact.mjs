// Imports an export from the interim claude.ai artifact tracker (handoff §9).
// Totals in the file are ignored: Postgres recomputes them from grams × per100.
// Idempotent: an entry with the same date, meal, name and grams is skipped. Imports into user IMPORT_USER (default "owner").
import { readFile } from 'node:fs/promises'
import postgres from 'postgres'

const file = process.argv[2]
if (!file || !process.env.DATABASE_URL) { console.error('usage: DATABASE_URL=... node scripts/import-artifact.mjs <file.json>'); process.exit(1) }
const data = JSON.parse(await readFile(file, 'utf8'))
const sql = postgres(process.env.DATABASE_URL, { max: 1 })

const uid = process.env.IMPORT_USER || 'owner'
let added = 0, skipped = 0
try {
  await sql.begin(async (tx) => {
    if (data.settings?.kcalGoal) await tx`insert into settings (user_id, kcal_goal) values (${uid}, ${data.settings.kcalGoal}) on conflict (user_id) do update set kcal_goal = excluded.kcal_goal`
    for (const e of data.entries ?? []) {
      const [dup] = await tx`select 1 from entries where user_id = ${uid} and date = ${e.date} and meal = ${e.meal} and name = ${e.name} and grams = ${e.grams}`
      if (dup) { skipped++; continue }
      await tx`insert into entries (user_id, date, meal, name, grams, kcal100, p100, f100, c100, source, note)
        values (${uid}, ${e.date}, ${e.meal}, ${e.name}, ${e.grams}, ${e.per100.kcal}, ${e.per100.p}, ${e.per100.f}, ${e.per100.c}, ${e.source}, ${e.note ?? null})`
      added++
    }
  })
  console.log(`imported ${added}, skipped ${skipped} duplicates`)
} finally {
  await sql.end()
}
