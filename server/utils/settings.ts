import { eq } from 'drizzle-orm'

export async function getSettings() {
  const db = useDb()
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.id, 1))
  if (!row) throw createError({ statusCode: 500, statusMessage: 'settings row missing: run migrations' })
  return row
}
