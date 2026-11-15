import { eq } from 'drizzle-orm'

// Passkey login (public). Discoverable credentials: the browser offers the passkeys it has for this site,
// the credential id tells us whose it is.
export default defineWebAuthnAuthenticateEventHandler({
  storeChallenge: (_event, challenge, attemptId) => storeWebAuthnChallenge(attemptId, challenge),
  getChallenge: (_event, attemptId) => takeWebAuthnChallenge(attemptId),
  async getCredential(_event, credentialId) {
    const [row] = await useDb().select().from(schema.passkeys).where(eq(schema.passkeys.id, credentialId))
    if (!row || !await getUser(row.userId)) throw createError({ statusCode: 401, statusMessage: 'This passkey is not linked to an account here' })
    return { id: row.id, publicKey: row.publicKey, counter: row.counter, backedUp: row.backedUp, transports: (row.transports ?? undefined) as any }
  },
  async onSuccess(event, { credential, authenticationInfo }) {
    const [row] = await useDb().update(schema.passkeys)
      .set({ counter: authenticationInfo.newCounter, lastUsedAt: new Date() })
      .where(eq(schema.passkeys.id, credential.id))
      .returning({ userId: schema.passkeys.userId })
    const u = await getUser(row?.userId)
    if (!u) throw createError({ statusCode: 401, statusMessage: 'This passkey is not linked to an account here' })
    await startSession(event as any, u)
  },
})
