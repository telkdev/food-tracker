// "Log out on other devices": bumps session_version, then re-issues this device's cookie.
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  await bumpSessionVersion(uid)
  await startSession(event, (await getUser(uid))!)
  return { ok: true }
})
