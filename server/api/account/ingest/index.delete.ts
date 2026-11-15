// Disconnect the phone: the token stops working. Data already received stays.
export default defineEventHandler(async (event) => {
  await revokeIngestToken(uidOf(event))
  return { ok: true }
})
