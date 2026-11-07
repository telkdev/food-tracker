import { and, eq, isNull } from 'drizzle-orm'

// RFC 6749 token endpoint. Body is application/x-www-form-urlencoded (h3 readBody parses it).
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  try {
    const body = (await readBody(event)) ?? {}
    // public clients send client_id in the body; tolerate HTTP Basic too
    let clientId = body.client_id ? String(body.client_id) : ''
    const basic = /^Basic\s+(.+)$/i.exec(getRequestHeader(event, 'authorization') || '')
    if (!clientId && basic) clientId = decodeURIComponent(Buffer.from(basic[1]!, 'base64').toString().split(':')[0] || '')
    if (!clientId) throw new OAuthError('invalid_client', 'client_id is required', 401)
    const db = useDb()

    if (body.grant_type === 'authorization_code') {
      const code = String(body.code || '')
      const verifier = String(body.code_verifier || '')
      const c = schema.oauthCodes
      // single use: mark as used atomically
      const [row] = await db.update(c).set({ usedAt: new Date() })
        .where(and(eq(c.codeHash, sha256(code)), isNull(c.usedAt))).returning()
      if (!row) throw new OAuthError('invalid_grant', 'Authorization code is invalid or already used')
      if (row.expiresAt < new Date()) throw new OAuthError('invalid_grant', 'Authorization code expired')
      if (row.clientId !== clientId) throw new OAuthError('invalid_grant', 'Code was issued to another client')
      if (body.redirect_uri && String(body.redirect_uri) !== row.redirectUri) throw new OAuthError('invalid_grant', 'redirect_uri mismatch')
      if (!verifier || pkceS256(verifier) !== row.codeChallenge) throw new OAuthError('invalid_grant', 'PKCE verification failed')
      return await issueTokens({ clientId, scope: row.scope, resource: row.resource })
    }

    if (body.grant_type === 'refresh_token') {
      const t = schema.oauthTokens
      const [row] = await db.select().from(t).where(and(eq(t.tokenHash, sha256(String(body.refresh_token || ''))), eq(t.kind, 'refresh')))
      if (!row || row.clientId !== clientId) throw new OAuthError('invalid_grant', 'Refresh token is invalid')
      if (row.revokedAt) {
        // reuse of a rotated token: treat as theft, kill the whole family
        await db.update(t).set({ revokedAt: new Date() }).where(and(eq(t.familyId, row.familyId), isNull(t.revokedAt)))
        throw new OAuthError('invalid_grant', 'Refresh token was already used')
      }
      if (row.expiresAt < new Date()) throw new OAuthError('invalid_grant', 'Refresh token expired')
      // rotate: revoke old refresh + old access tokens of the family, issue new pair
      await db.update(t).set({ revokedAt: new Date() }).where(and(eq(t.familyId, row.familyId), isNull(t.revokedAt)))
      return await issueTokens({ clientId, scope: row.scope, resource: row.resource, familyId: row.familyId })
    }

    throw new OAuthError('unsupported_grant_type', 'Use authorization_code or refresh_token')
  } catch (e) { return sendOAuthError(event, e) }
})
