import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import { and, eq, isNull, gt } from 'drizzle-orm'

/**
 * Minimal single-user OAuth 2.1 authorization server for the claude.ai connector.
 * - client registration: CIMD (client_id is an https URL) or DCR (/oauth/register)
 * - authorization code + PKCE S256 only, public clients ("none")
 * - opaque tokens, stored as sha256 hashes; refresh tokens rotate, reuse revokes the family
 * The only person who can approve is whoever can log in to the app (NUXT_APP_PASSWORD).
 */

export const SCOPE = 'diary'
export const ACCESS_TTL_S = 3600
export const REFRESH_TTL_S = 60 * 24 * 3600
const CODE_TTL_S = 300

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
export const b64url = (buf: Buffer) => buf.toString('base64url')
export const newToken = (prefix: string) => `${prefix}_${b64url(randomBytes(32))}`

export function baseUrl(event: H3Event) {
  const c = useRuntimeConfig(event)
  const fromEnv = c.siteUrl || process.env.RENDER_EXTERNAL_URL
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  const u = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true })
  return u.origin
}
export const mcpUrl = (event: H3Event) => `${baseUrl(event)}/mcp`
export const resourceMetadataUrl = (event: H3Event) => `${baseUrl(event)}/.well-known/oauth-protected-resource`

// ---------- redirect URIs ----------

const HOSTED_CALLBACKS = ['https://claude.ai/api/mcp/auth_callback', 'https://claude.com/api/mcp/auth_callback']
const CIMD_HOSTS = ['claude.ai', 'claude.com', 'anthropic.com']

function isLoopback(u: URL) {
  return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]')
}

/** Only Claude's callbacks and loopback (Claude Code, MCP Inspector) may receive codes. */
export function redirectAllowed(uri: string, extra: string[] = []) {
  let u: URL
  try { u = new URL(uri) } catch { return false }
  if (u.hash) return false
  if (isLoopback(u)) return true
  return u.protocol === 'https:' && [...HOSTED_CALLBACKS, ...extra].includes(`${u.origin}${u.pathname}`)
}

/** Exact match, except loopback where the port is ignored (RFC 8252 §7.3). */
export function redirectMatches(requested: string, registered: string[]) {
  let r: URL
  try { r = new URL(requested) } catch { return false }
  return registered.some((reg) => {
    if (reg === requested) return true
    try {
      const g = new URL(reg)
      return isLoopback(r) && isLoopback(g) && r.hostname === g.hostname && r.pathname === g.pathname
    } catch { return false }
  })
}

export function extraRedirects(event: H3Event): string[] {
  return String(useRuntimeConfig(event).oauthExtraRedirects || '').split(',').map(s => s.trim()).filter(Boolean)
}

// ---------- clients ----------

export interface OAuthClient { id: string, kind: 'dcr' | 'cimd', name: string | null, redirectUris: string[] }

function cimdHostAllowed(u: URL) {
  return u.protocol === 'https:' && CIMD_HOSTS.some(h => u.hostname === h || u.hostname.endsWith(`.${h}`))
}

async function fetchCimd(clientId: string): Promise<OAuthClient> {
  const u = new URL(clientId)
  if (!cimdHostAllowed(u)) throw new OAuthError('invalid_client', 'Client metadata host is not allowed')
  const res = await fetch(clientId, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000), redirect: 'error' })
  if (!res.ok) throw new OAuthError('invalid_client', `Client metadata fetch failed (${res.status})`)
  const text = await res.text()
  if (text.length > 20_000) throw new OAuthError('invalid_client', 'Client metadata too large')
  const doc = JSON.parse(text)
  if (doc.client_id !== clientId) throw new OAuthError('invalid_client', 'client_id in metadata does not match its URL')
  if (!Array.isArray(doc.redirect_uris) || !doc.redirect_uris.length) throw new OAuthError('invalid_client', 'Client metadata has no redirect_uris')
  return { id: clientId, kind: 'cimd', name: typeof doc.client_name === 'string' ? doc.client_name : null, redirectUris: doc.redirect_uris.map(String) }
}

export async function getClient(clientId: string): Promise<OAuthClient> {
  const db = useDb()
  const [row] = await db.select().from(schema.oauthClients).where(eq(schema.oauthClients.id, clientId))
  const isUrl = clientId.startsWith('https://')
  if (row && (!isUrl || Date.now() - row.refreshedAt.getTime() < 24 * 3600_000)) return row
  if (!isUrl) throw new OAuthError('invalid_client', 'Unknown client_id')
  const c = await fetchCimd(clientId)
  await db.insert(schema.oauthClients).values({ ...c, refreshedAt: new Date() })
    .onConflictDoUpdate({ target: schema.oauthClients.id, set: { name: c.name, redirectUris: c.redirectUris, refreshedAt: new Date() } })
  return c
}

export async function registerClient(meta: { redirect_uris?: unknown, client_name?: unknown }, extra: string[]) {
  const uris = Array.isArray(meta.redirect_uris) ? meta.redirect_uris.map(String) : []
  if (!uris.length) throw new OAuthError('invalid_redirect_uri', 'redirect_uris is required')
  const bad = uris.find(u => !redirectAllowed(u, extra))
  if (bad) throw new OAuthError('invalid_redirect_uri', `redirect_uri not allowed: ${bad}`)
  const client: OAuthClient = { id: `dcr_${randomUUID()}`, kind: 'dcr', name: typeof meta.client_name === 'string' ? meta.client_name.slice(0, 100) : null, redirectUris: uris }
  await useDb().insert(schema.oauthClients).values(client)
  return client
}

// ---------- codes & tokens ----------

export class OAuthError extends Error {
  constructor(public error: string, public description: string, public status = 400) { super(description) }
}

export function sendOAuthError(event: H3Event, e: unknown) {
  if (e instanceof OAuthError) {
    setResponseStatus(event, e.status)
    setResponseHeader(event, 'Cache-Control', 'no-store')
    return { error: e.error, error_description: e.description }
  }
  throw e
}

export async function createCode(p: { clientId: string, redirectUri: string, codeChallenge: string, scope: string, resource: string }) {
  const code = newToken('ftc')
  await useDb().insert(schema.oauthCodes).values({ ...p, codeHash: sha256(code), expiresAt: new Date(Date.now() + CODE_TTL_S * 1000) })
  return code
}

export async function issueTokens(p: { clientId: string, scope: string, resource: string, familyId?: string }) {
  const familyId = p.familyId ?? randomUUID()
  const access = newToken('fta')
  const refresh = newToken('ftr')
  const now = Date.now()
  await useDb().insert(schema.oauthTokens).values([
    { tokenHash: sha256(access), kind: 'access', familyId, clientId: p.clientId, scope: p.scope, resource: p.resource, expiresAt: new Date(now + ACCESS_TTL_S * 1000) },
    { tokenHash: sha256(refresh), kind: 'refresh', familyId, clientId: p.clientId, scope: p.scope, resource: p.resource, expiresAt: new Date(now + REFRESH_TTL_S * 1000) },
  ])
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: p.scope }
}

export function pkceS256(verifier: string) {
  return b64url(createHash('sha256').update(verifier).digest())
}

/** Guard for /mcp. Throws a 401 carrying the discovery pointer Claude needs to start sign-in. */
export async function requireBearer(event: H3Event) {
  const header = getRequestHeader(event, 'authorization') || ''
  const m = /^Bearer\s+(\S+)$/i.exec(header)
  const fail = (desc?: string) => {
    const parts = [`Bearer resource_metadata="${resourceMetadataUrl(event)}"`, `scope="${SCOPE}"`]
    if (desc) parts.push('error="invalid_token"', `error_description="${desc}"`)
    setResponseHeader(event, 'WWW-Authenticate', parts.join(', '))
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!m) fail()
  const t = schema.oauthTokens
  const [row] = await useDb().select().from(t).where(and(
    eq(t.tokenHash, sha256(m![1]!)), eq(t.kind, 'access'), isNull(t.revokedAt), gt(t.expiresAt, new Date()),
  ))
  if (!row) fail('token expired or revoked')
  if (row!.resource !== mcpUrl(event)) fail('token issued for a different resource')
  return row!
}
