export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const s = await getSettings(uid)
  const { userId: _, ...rest } = s
  return { ...rest, today: localDate(s.timezone), name: await userDisplayName(uid) }
})
