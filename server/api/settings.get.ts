export default defineEventHandler(async () => {
  const s = await getSettings()
  return { ...s, today: localDate(s.timezone) }
})
