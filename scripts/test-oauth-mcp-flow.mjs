// End-to-end check of OAuth (DCR, PKCE, consent, refresh rotation) and all MCP tools against a running server.
// Writes test entries on 2026-11-07. Usage: BASE_URL=http://localhost:3000 APP_PASSWORD=... node scripts/test-oauth-mcp-flow.mjs
import { createHash, randomBytes } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const B = process.env.BASE_URL || 'http://localhost:3000'
const ok = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1) } console.log('ok  ', m) }
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback'

// 1. 401 + discovery
let r = await fetch(`${B}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
const www = r.headers.get('www-authenticate')
ok(r.status === 401 && www.includes(`resource_metadata="${B}/.well-known/oauth-protected-resource"`), `401 with ${www}`)
const prm = await (await fetch(`${B}/.well-known/oauth-protected-resource`)).json()
ok(prm.resource === `${B}/mcp` && prm.authorization_servers[0] === B, 'protected resource metadata')
const as = await (await fetch(`${B}/.well-known/oauth-authorization-server`)).json()
ok(as.client_id_metadata_document_supported && as.token_endpoint_auth_methods_supported.includes('none') && as.code_challenge_methods_supported.includes('S256'), 'AS metadata advertises CIMD + none + S256')

// 2. DCR: bad redirect rejected, Claude's accepted
r = await fetch(as.registration_endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ redirect_uris: ['https://evil.example/cb'] }) })
ok(r.status === 400, 'DCR rejects foreign redirect_uri')
const client = await (await fetch(as.registration_endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Claude', redirect_uris: [REDIRECT] }) })).json()
ok(client.client_id?.startsWith('dcr_'), `DCR client ${client.client_id}`)

// 3. authorize without login → login page
const verifier = randomBytes(32).toString('base64url')
const challenge = createHash('sha256').update(verifier).digest('base64url')
const q = new URLSearchParams({ response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz', scope: 'diary offline_access', resource: `${B}/mcp` })
r = await fetch(`${as.authorization_endpoint}?${q}`, { redirect: 'manual' })
ok(r.status === 302 && r.headers.get('location').startsWith('/login?next=%2Foauth%2Fauthorize'), 'not logged in → /login?next=…')
// wrong redirect → error page, not a redirect
r = await fetch(`${as.authorization_endpoint}?${new URLSearchParams({ ...Object.fromEntries(q), redirect_uri: 'https://evil.example/cb' })}`, { redirect: 'manual' })
ok(r.status === 400, 'unregistered redirect_uri → error page, no redirect')

// 4. login, consent
r = await fetch(`${B}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: process.env.APP_PASSWORD }) })
let cookie = r.headers.getSetCookie().map(c => c.split(';')[0]).join('; ')
r = await fetch(`${as.authorization_endpoint}?${q}`, { headers: { cookie } })
const html = await r.text()
cookie = [cookie, ...r.headers.getSetCookie().map(c => c.split(';')[0])].reduce((acc, c) => { const [k] = c.split('='); acc[k] = c; return acc }, {})
cookie = Object.values(cookie).join('; ')
ok(r.status === 200 && html.includes('Connect to your food diary?') && html.includes('claude.ai'), 'consent page shows redirect host')
const fields = Object.fromEntries([...html.matchAll(/name="([^"]+)" value="([^"]*)"/g)].map(m => [m[1], m[2].replace(/&amp;/g, '&')]))
// CSRF: tampered token rejected
r = await fetch(`${B}/oauth/authorize`, { method: 'POST', redirect: 'manual', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...fields, csrf: 'x'.repeat(fields.csrf.length), action: 'approve' }) })
ok(r.status === 400, 'bad CSRF token rejected')
r = await fetch(`${B}/oauth/authorize`, { method: 'POST', redirect: 'manual', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...fields, action: 'approve' }) })
const loc = new URL(r.headers.get('location'))
ok(r.status === 303 && loc.origin + loc.pathname === REDIRECT && loc.searchParams.get('state') === 'xyz', `approve → ${loc.origin}${loc.pathname}?code=…&state=xyz`)
const code = loc.searchParams.get('code')

// 5. token exchange (form-urlencoded)
const tok = body => fetch(as.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) })
r = await tok({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: client.client_id, code_verifier: 'wrong'.padEnd(43, 'x') })
ok(r.status === 400 && (await r.json()).error === 'invalid_grant', 'wrong PKCE verifier → invalid_grant (and burns the code)')
// get a fresh code (code is single-use)
r = await fetch(`${as.authorization_endpoint}?${q}`, { headers: { cookie } })
const html2 = await r.text()
cookie = [cookie, ...r.headers.getSetCookie().map(c => c.split(';')[0])].reduce((acc, c) => { const [k] = c.split('='); acc[k] = c; return acc }, {}); cookie = Object.values(cookie).join('; ')
const f2 = Object.fromEntries([...html2.matchAll(/name="([^"]+)" value="([^"]*)"/g)].map(m => [m[1], m[2].replace(/&amp;/g, '&')]))
r = await fetch(`${B}/oauth/authorize`, { method: 'POST', redirect: 'manual', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...f2, action: 'approve' }) })
const code2 = new URL(r.headers.get('location')).searchParams.get('code')
r = await tok({ grant_type: 'authorization_code', code: code2, redirect_uri: REDIRECT, client_id: client.client_id, code_verifier: verifier })
const t1 = await r.json()
ok(r.status === 200 && t1.access_token && t1.refresh_token && t1.expires_in === 3600, 'code + PKCE → access + refresh token')
r = await tok({ grant_type: 'authorization_code', code: code2, redirect_uri: REDIRECT, client_id: client.client_id, code_verifier: verifier })
ok(r.status === 400, 'code reuse rejected')

// 6. MCP with the token, through the official SDK client
const mcp = new Client({ name: 'flow-test', version: '1' })
await mcp.connect(new StreamableHTTPClientTransport(new URL(`${B}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${t1.access_token}` } } }))
const tools = (await mcp.listTools()).tools.map(t => t.name)
ok(tools.length === 9, `tools: ${tools.join(', ')}`)
const call = async (name, args) => { const res = await mcp.callTool({ name, arguments: args }); return { err: res.isError, data: res.isError ? res.content[0].text : JSON.parse(res.content[0].text) } }
let res = await call('get_day', { date: '2026-11-07' })
ok(!res.err && res.data.totals.kcal > 1000, `get_day: ${res.data.totals.kcal} kcal, ${res.data.left_kcal} left`)
res = await call('search_products', { query: 'skyr' })
ok(!res.err && res.data.results[0].from === 'mine' && res.data.results[0].id, `search_products: ${res.data.results.map(r => `${r.from}:${r.name}`).join(' | ')}`)
const skyrId = res.data.results[0].id
res = await call('log_food', { date: '2026-11-07', meal: 'snack', items: [{ name: 'Skyr naturalny', grams: 150, product_id: skyrId }] })
ok(!res.err && res.data.created[0].kcal === 96, `log_food via product_id: ${res.data.created[0].kcal} kcal (64 × 1.5)`)
const entryId = res.data.created[0].id
res = await call('update_entry', { id: entryId, grams: 200 })
ok(!res.err && res.data.kcal === 128, `update_entry recomputes: ${res.data.kcal} kcal`)
res = await call('log_food', { items: [{ name: 'per serving mistake', grams: 30, per100: { kcal: 2000, p: 1, f: 1, c: 1 }, source: 'estimate' }] })
ok(res.err, `bad values rejected as tool error: ${res.data.slice(0, 80)}`)
res = await call('log_food', { items: [{ name: 'no values', grams: 30 }] })
ok(res.err, `missing per100 → tool error: ${res.data}`)
res = await call('upsert_product', { name: 'Twaróg półtłusty', brand: 'Mlekovita', barcode: '5900512320614', per100: { kcal: 133, p: 18, f: 5, c: 3.7 }, source: 'label' })
ok(!res.err && res.data.id, 'upsert_product from label')
res = await call('lookup_barcode', { barcode: '5900512320614' })
ok(!res.err && res.data.origin === 'my_products', 'lookup_barcode finds saved label product locally')
res = await call('get_range', { from: '2026-11-01', to: '2026-11-07' })
ok(!res.err && res.data.logged_days === 1, `get_range avg ${res.data.avg_kcal}, days ${JSON.stringify(res.data.days[0])}`)
res = await call('delete_entry', { id: entryId })
ok(!res.err && res.data.deleted.id === entryId, 'delete_entry')
res = await call('set_goals', { kcal_goal: 2500 })
ok(!res.err, 'set_goals')
await mcp.close()
r = await fetch(`${B}/api/usage?days=1`, { headers: { cookie } })
const usage = await r.json()
ok(r.status === 200 && usage.total.calls >= 12, `usage logged: ${usage.total.calls} calls, ~${usage.total.tokens} tokens; top ${usage.by_tool.slice(0, 3).map(t => `${t.tool}≈${t.avg_tokens}`).join(', ')}`)

// 7. refresh rotation + reuse detection
r = await tok({ grant_type: 'refresh_token', refresh_token: t1.refresh_token, client_id: client.client_id })
const t2 = await r.json()
ok(r.status === 200 && t2.refresh_token !== t1.refresh_token, 'refresh rotates the refresh token')
r = await fetch(`${B}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${t1.access_token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) })
ok(r.status === 401, 'old access token revoked after refresh')
r = await tok({ grant_type: 'refresh_token', refresh_token: t1.refresh_token, client_id: client.client_id })
ok(r.status === 400 && (await r.json()).error === 'invalid_grant', 'reused refresh token → invalid_grant')
r = await fetch(`${B}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${t2.access_token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) })
ok(r.status === 401, 'reuse revoked the whole token family')
console.log('\nALL PASSED')
