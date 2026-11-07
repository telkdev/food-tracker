import { randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'

export interface AuthorizeParams {
  client_id: string, redirect_uri: string, code_challenge: string, state?: string, scope: string, resource: string
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]!))

export function errorPage(event: H3Event, message: string) {
  setResponseStatus(event, 400)
  setResponseHeader(event, 'Content-Type', 'text/html; charset=utf-8')
  return `<!doctype html><meta name="viewport" content="width=device-width"><title>Authorization error</title>
<body style="font:16px system-ui;max-width:480px;margin:40px auto;padding:0 16px"><h1>Can't connect</h1><p>${esc(message)}</p></body>`
}

export function redirectWith(uri: string, params: Record<string, string | undefined>) {
  const u = new URL(uri)
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, v)
  return u.toString()
}

/**
 * Validates an authorization request. Client/redirect problems return { fatal } (shown as a page, never redirected,
 * so an attacker can't bounce errors to an arbitrary URL). Other problems return { redirectError }.
 */
export async function validateAuthorize(event: H3Event, q: Record<string, any>): Promise<{ fatal?: string, client?: OAuthClient, redirectError?: string, params?: AuthorizeParams }> {
  const clientId = String(q.client_id || '')
  const redirectUri = String(q.redirect_uri || '')
  if (!clientId) return { fatal: 'Missing client_id.' }
  let client
  try { client = await getClient(clientId) } catch (e: any) { return { fatal: e?.description || 'Unknown client.' } }
  if (!redirectUri || !redirectAllowed(redirectUri, extraRedirects(event)) || !redirectMatches(redirectUri, client.redirectUris)) {
    return { fatal: 'This redirect address is not registered for the app that asked to connect.' }
  }
  const state = q.state ? String(q.state) : undefined
  const err = (error: string, desc: string) => ({ client, redirectError: redirectWith(redirectUri, { error, error_description: desc, state, iss: baseUrl(event) }) })
  if (q.response_type !== 'code') return err('unsupported_response_type', 'Only response_type=code is supported')
  if (q.code_challenge_method !== 'S256' || !/^[\w-]{43,128}$/.test(String(q.code_challenge || ''))) return err('invalid_request', 'PKCE with S256 is required')
  const resource = q.resource ? String(q.resource) : mcpUrl(event)
  if (resource !== mcpUrl(event)) return err('invalid_target', 'Unknown resource')
  const requested = String(q.scope || SCOPE).split(/\s+/).filter(Boolean)
  const scope = requested.filter(s => s === SCOPE || s === 'offline_access')
  if (!scope.includes(SCOPE)) scope.unshift(SCOPE)
  const params: AuthorizeParams = { client_id: clientId, redirect_uri: redirectUri, code_challenge: String(q.code_challenge), state, scope: scope.join(' '), resource }
  return { client, params }
}

export async function consentPage(event: H3Event, client: OAuthClient, p: AuthorizeParams) {
  const csrf = randomBytes(24).toString('base64url')
  await setUserSession(event, { oauthCsrf: csrf })
  const host = new URL(p.redirect_uri).host
  const loopback = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)
  const hidden = Object.entries({ ...p, csrf }).filter(([, v]) => v !== undefined)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(String(v))}">`).join('')
  setResponseHeader(event, 'Content-Type', 'text/html; charset=utf-8')
  setResponseHeader(event, 'Cache-Control', 'no-store')
  setResponseHeader(event, 'X-Frame-Options', 'DENY')
  return `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>Connect Food Tracker</title>
<style>:root{color-scheme:light dark}body{font:16px/1.45 system-ui,sans-serif;max-width:480px;margin:40px auto;padding:0 16px}
.card{border:1px solid #8885;border-radius:14px;padding:18px}button{font:inherit;padding:10px 16px;border-radius:10px;border:1px solid #8886;margin-right:8px;cursor:pointer}
.ok{background:#16a34a;color:#fff;border:0}.warn{color:#b45309}</style>
<h1>Connect to your food diary?</h1>
<div class="card">
<p><b>${esc(client.name || 'An app')}</b> wants to read and write your food diary: entries, products and goals.</p>
<p>After you approve, you'll be sent to <b>${esc(host)}</b>.</p>
${loopback ? '<p class="warn">This is an address on your own computer (Claude Code or MCP Inspector). Only approve if you just started this connection yourself.</p>' : ''}
<form method="post" action="/oauth/authorize">${hidden}
<button class="ok" name="action" value="approve" type="submit">Allow</button><button name="action" value="deny" type="submit">Deny</button>
</form></div>`
}
