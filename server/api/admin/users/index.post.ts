import { z } from 'zod'

// New user: gets an empty diary and a one-time link to set a password.
const body = z.object({ login: z.string().trim().toLowerCase().regex(LOGIN_RE), name: z.string().trim().max(40).optional() })

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const parsed = body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Login: latin letters, digits and _, up to 30' })
  const { login, name } = parsed.data
  const taken = [...(await allUsers()).values()].some(u => u.login === login || u.id === login)
  if (taken) throw createError({ statusCode: 409, statusMessage: 'This login is taken' })
  await useDb().insert(schema.users).values({ id: login, login, name: name || null })
  invalidateUsers()
  return { id: login, invite: await createInvite(event, login) }
})
