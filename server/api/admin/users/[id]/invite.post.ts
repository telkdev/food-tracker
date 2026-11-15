// New one-time link for a user: to set a first password, or to reset a forgotten one.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id')!
  if (!(await allUsers()).has(id)) throw createError({ statusCode: 404, statusMessage: 'No such user' })
  return { invite: await createInvite(event, id) }
})
