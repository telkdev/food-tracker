// Imports an export from the interim claude.ai artifact tracker (handoff §9).
// Totals in the file are ignored: Postgres recomputes them from grams × per100.
// Idempotent: an entry with the same date, meal, name and grams is skipped.
import { readFile } from 'node:fs/promises'
import postgres from 'postgres'

const file = process.argv[2]
if (!file || !process.env.DATABASE_URL) { console.error('usage: DATABASE_URL=... node scripts/import-artifact.mjs <file.json>'); process.exit(1) }
const data = JSON.parse(await readFile(file, 'utf8'))
const sql = postgres(process.env.DATABASE_URL, { max: 1 })

let added = 0, skipped = 0
try {
  await sql.begin(async (tx) => {
    if (data.settings?.kcalGoal) await tx`update settings set kcal_goal = ${data.settings.kcalGoal} where id = 1`
    for (const e of data.entries ?? []) {
      const [dup] = await tx`select 1 from entries where date = ${e.date} and meal = ${e.meal} and name = ${e.name} and grams = ${e.grams}`
      if (dup) { skipped++; continue }
      await tx`insert into entries (date, meal, name, grams, kcal100, p100, f100, c100, source, note)
        values (${e.date}, ${e.meal}, ${e.name}, ${e.grams}, ${e.per100.kcal}, ${e.per100.p}, ${e.per100.f}, ${e.per100.c}, ${e.source}, ${e.note ?? null})`
      added++
    }
  })
  console.log(`imported ${added}, skipped ${skipped} duplicates`)
} finally {
  await sql.end()
}
