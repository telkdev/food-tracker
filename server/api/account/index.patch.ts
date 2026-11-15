import { eq } from 'drizzle-orm'
import { z } from 'zod'

// Own greeting name ("Надя"). Empty → default.
const body = z.object({ name: z.string().trim().max(40).nullable() })

export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const { name } = await readValidatedBody(event, body.parse)
  await useDb().update(schema.users).set({ name: name ? name.normalize('NFC') : null }).where(eq(schema.users.id, uid))
  invalidateUsers()
  return { ok: true, greeting: await userDisplayName(uid) }
})
