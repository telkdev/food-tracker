export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const s = await getSettings(uid)
  const { userId: _, ...rest } = s
  const [name, water] = await Promise.all([userDisplayName(uid), waterGoal(uid, s)])
  return { ...rest, today: localDate(s.timezone), name, water_auto: water.auto }
})
