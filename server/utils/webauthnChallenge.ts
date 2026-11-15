/**
 * WebAuthn challenges, one per attempt, single use, 5 minutes. In memory: one Render instance, and a restart
 * only means "try the passkey again". Without this the library would accept an empty (replayable) challenge.
 */
const TTL_MS = 5 * 60_000
const store = new Map<string, { challenge: string, exp: number, uid?: string }>()

export function storeWebAuthnChallenge(attemptId: string, challenge: string, uid?: string) {
  const now = Date.now()
  for (const [k, v] of store) if (v.exp < now) store.delete(k)
  if (store.size > 1000) throw createError({ statusCode: 429, statusMessage: 'Too many passkey attempts, try again in a few minutes' })
  store.set(attemptId, { challenge, exp: now + TTL_MS, uid })
}

/** Takes the challenge out (single use). `uid` must match the user who started a registration. */
export function takeWebAuthnChallenge(attemptId: string, uid?: string): string {
  const v = store.get(attemptId)
  store.delete(attemptId)
  if (!v || v.exp < Date.now() || v.uid !== uid) throw createError({ statusCode: 400, statusMessage: 'Passkey attempt expired, try again' })
  return v.challenge
}
