export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return allConnections()
})
