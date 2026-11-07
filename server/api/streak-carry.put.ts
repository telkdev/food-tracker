// Streak carried over from another app (e.g. FatSecret). Body: { days, until } ; days 0 clears it.
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const body = parseOr400(streakCarrySchema, await readBody(event))
  const s = await getSettings(uid)
  if (body.until && body.until > localDate(s.timezone)) throw createError({ statusCode: 400, statusMessage: 'until cannot be in the future' })
  return setStreakCarry(uid, body)
})
