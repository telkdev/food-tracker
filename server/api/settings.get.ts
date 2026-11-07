export default defineEventHandler(async (event) => {
  const s = await getSettings(uidOf(event))
  const { userId: _, ...rest } = s
  return { ...rest, today: localDate(s.timezone) }
})
