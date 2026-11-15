import { eq } from 'drizzle-orm'

// Adds a passkey to the logged-in user (behind server/middleware/auth.ts). The user comes from the session,
// never from the request body.
export default defineWebAuthnRegisterEventHandler({
  async validateUser(_body, event) {
    const u = await getUser(uidOf(event as any))
    if (!u) throw createError({ statusCode: 401, statusMessage: 'Not logged in' })
    return { userName: u.login, displayName: u.name || displayName(u.id) || u.login }
  },
  async getOptions() {
    return {
      rpName: 'Food Tracker',
      // discoverable credential: log in with one tap, no login to type
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    }
  },
  async excludeCredentials(event) {
    const rows = await useDb().select({ id: schema.passkeys.id, transports: schema.passkeys.transports })
      .from(schema.passkeys).where(eq(schema.passkeys.userId, uidOf(event as any)))
    return rows.map(r => ({ id: r.id, transports: (r.transports ?? undefined) as any }))
  },
  storeChallenge: (event, challenge, attemptId) => storeWebAuthnChallenge(attemptId, challenge, uidOf(event as any)),
  getChallenge: (event, attemptId) => takeWebAuthnChallenge(attemptId, uidOf(event as any)),
  async onSuccess(event, { credential }) {
    const body = await readBody(event as any)
    const raw = body?.user?.name
    const name = typeof raw === 'string' ? raw.trim().slice(0, 60) || null : null
    await useDb().insert(schema.passkeys).values({
      id: credential.id,
      userId: uidOf(event as any),
      publicKey: credential.publicKey,
      counter: credential.counter,
      backedUp: credential.backedUp,
      transports: credential.transports ?? null,
      name,
    })
  },
})
