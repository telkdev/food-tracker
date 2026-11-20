// Connected users can log into each other's diary (app API with x-diary-for, MCP with for_user); others cannot.
// Needs three users: A and B connected, C not connected to A. Writes only on 2020-01-03 and cleans up.
// Usage: BASE_URL=… APP_LOGIN=owner APP_PASSWORD=… APP_LOGIN_2=nadia APP_PASSWORD_2=… APP_LOGIN_3=dima APP_PASSWORD_3=… node scripts/test-connections.mjs
import { createHash, randomBytes } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const B = process.env.BASE_URL || 'http://localhost:3000'
const ok = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1) } console.log('ok  ', m) }
const D = '2020-01-03'
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback'

async function login(login, password) {
  const r = await fetch(`${B}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login, password }) })
  ok(r.status === 200, `login ${r.status}`)
  const cookie = r.headers.getSetCookie().map(c => c.split(';')[0]).join('; ')
  const api = async (path, init = {}) => {
    const res = await fetch(`${B}${path}`, { ...init, headers: { cookie, 'content-type': 'application/json', ...(init.headers ?? {}) }, body: init.body ? JSON.stringify(init.body) : undefined })
    return { status: res.status, data: await res.json().catch(() => null) }
  }
  return { cookie, api }
}

/** Full OAuth code flow for the logged-in user, then an MCP client with that token. */
async function mcpFor(cookie) {
  const as = await (await fetch(`${B}/.well-known/oauth-authorization-server`)).json()
  const client = await (await fetch(as.registration_endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'test', redirect_uris: [REDIRECT] }) })).json()
  const verifier = randomBytes(32).toString('base64url')
  const q = new URLSearchParams({ response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', state: 's', scope: 'diary', resource: `${B}/mcp` })
  let r = await fetch(`${as.authorization_endpoint}?${q}`, { headers: { cookie } })
  const html = await r.text()
  const jar = Object.values([cookie, ...r.headers.getSetCookie().map(c => c.split(';')[0])].reduce((a, c) => { a[c.split('=')[0]] = c; return a }, {})).join('; ')
  const fields = Object.fromEntries([...html.matchAll(/name="([^"]+)" value="([^"]*)"/g)].map(m => [m[1], m[2].replace(/&amp;/g, '&')]))
  r = await fetch(`${B}/oauth/authorize`, { method: 'POST', redirect: 'manual', headers: { cookie: jar, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...fields, action: 'approve' }) })
  const code = new URL(r.headers.get('location')).searchParams.get('code')
  const t = await (await fetch(as.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: client.client_id, code_verifier: verifier }) })).json()
  const mcp = new Client({ name: 'users-test', version: '1' })
  await mcp.connect(new StreamableHTTPClientTransport(new URL(`${B}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${t.access_token}` } } }))
  return async (name, args) => { const res = await mcp.callTool({ name, arguments: args }); return { err: res.isError, data: res.isError ? res.content[0].text : JSON.parse(res.content[0].text) } }
}

const A = await login(process.env.APP_LOGIN || 'owner', process.env.APP_PASSWORD)
const Bu = await login(process.env.APP_LOGIN_2, process.env.APP_PASSWORD_2)
const C = await login(process.env.APP_LOGIN_3, process.env.APP_PASSWORD_3)
const idOf = async u => (await (await fetch(`${B}/api/_auth/session`, { headers: { cookie: u.cookie } })).json()).user.id
const [aId, bId, cId] = [await idOf(A), await idOf(Bu), await idOf(C)]

const conns = (await A.api('/api/connections')).data
ok(conns.some(c => c.id === bId) && !conns.some(c => c.id === cId), `A is connected to ${bId}, not to ${cId}`)
ok((await Bu.api('/api/connections')).data.some(c => c.id === aId), 'connection is mutual')

// ---- app API: A logs into B's diary ----
const forB = { 'x-diary-for': bId }
const aProd = (await A.api('/api/products', { method: 'POST', body: { name: 'connections test A product', per100: { kcal: 200, p: 10, f: 5, c: 20 }, source: 'label' } })).data
let r = await A.api('/api/entries', { method: 'POST', headers: forB, body: { date: D, meal: 'lunch', items: [{ name: 'for B', grams: 100, per100: { kcal: 100, p: 1, f: 1, c: 1 }, source: 'generic' }] } })
ok(r.status === 201 && r.data.created[0].logged_by === aId, 'app: A logged into B, entry marked logged_by A')
const e1 = r.data.created[0]
ok((await Bu.api(`/api/day?date=${D}`)).data.totals.kcal === 100, 'B sees it in her own day')
ok((await A.api(`/api/day?date=${D}`)).data.totals.kcal === 0, 'not in A\'s own day')
ok((await A.api(`/api/day?date=${D}`, { headers: forB })).data.totals.kcal === 100, 'A reads B\'s day with the header')
r = await A.api(`/api/entries/${e1.id}`, { method: 'PATCH', headers: forB, body: { grams: 150 } })
ok(r.status === 200 && r.data.grams === 150, 'A edits the entry in B\'s diary')
r = await A.api('/api/water', { method: 'POST', headers: forB, body: { date: D, ml: 250 } })
ok(r.status === 200 && r.data.water.ml === 250, 'A logs water for B')
ok((await A.api(`/api/entries/${e1.id}`, { method: 'DELETE' })).status === 404, 'without the header A cannot touch B\'s entry')
// out-of-scope routes ignore the header
const aGoal = (await A.api('/api/settings')).data.kcalGoal
await A.api('/api/settings', { method: 'PATCH', headers: forB, body: { kcal_goal: 2345 } })
ok((await Bu.api('/api/settings')).data.kcalGoal !== 2345, 'header never changes B\'s settings')
await A.api('/api/settings', { method: 'PATCH', body: { kcal_goal: aGoal } })
// C is not connected
ok((await C.api(`/api/day?date=${D}`, { headers: { 'x-diary-for': bId } })).status === 403, 'C (not connected) gets 403 for B\'s day')
ok((await C.api('/api/entries', { method: 'POST', headers: { 'x-diary-for': aId }, body: { date: D, items: [{ name: 'x', grams: 1, per100: { kcal: 1, p: 0, f: 0, c: 0 }, source: 'generic' }] } })).status === 403, 'C cannot log for A')

// ---- MCP: A's Claude logs for B ----
const mA = await mcpFor(A.cookie)
const ctx = await mA('get_context', {})
ok(ctx.data.connections?.some(([l]) => l === process.env.APP_LOGIN_2), 'get_context lists connections')
const bctx = await mA('get_context', { for_user: process.env.APP_LOGIN_2 })
ok(!bctx.err && bctx.data.for_user === bId, 'get_context for_user returns B\'s context')
r = await mA('log_food', { for_user: process.env.APP_LOGIN_2, date: D, meal: 'dinner', items: [{ name: 'mcp for B', grams: 50, product_id: aProd.id }] })
ok(!r.err && r.data.for_user === bId && r.data.created[0].kcal === 100, 'MCP log_food for B, with A\'s own product id (values copied)')
const e2 = r.data.created[0]
const bDay = (await Bu.api(`/api/day?date=${D}`)).data
const bE2 = bDay.meals.dinner.entries.find(e => e.id === e2.id)
ok(bE2 && bE2.product_id === null && bE2.logged_by === aId, 'B\'s entry is not linked to A\'s product')
const bName = ctx.data.connections.find(([l]) => l === process.env.APP_LOGIN_2)[1]
ok((await mA('get_day', { date: D, for_user: bName.toUpperCase() })).data.for_user === bId, `for_user accepts the display name (${bName})`)
r = await mA('log_water', { for_user: process.env.APP_LOGIN_2, date: D, ml: 300 })
ok(!r.err && r.data.water_ml === 550, 'MCP log_water for B')
ok((await mA('get_day', { date: D })).data.totals.kcal === 0, 'A\'s own day untouched')
r = await mA('log_food', { for_user: process.env.APP_LOGIN_3, date: D, items: [{ name: 'x', grams: 1, per100: { kcal: 1, p: 0, f: 0, c: 0 }, source: 'generic' }] })
ok(r.err && /not connected/.test(r.data), 'MCP refuses a person who is not connected')
ok(!(await mA('delete_entry', { id: e2.id, for_user: process.env.APP_LOGIN_2 })).err, 'MCP delete_entry for B')
const mB = await mcpFor(Bu.cookie)
r = await mB('log_food', { for_user: process.env.APP_LOGIN || 'owner', date: D, items: [{ name: 'from B', grams: 100, per100: { kcal: 10, p: 0, f: 0, c: 2 }, source: 'generic' }] })
ok(!r.err && r.data.for_user === aId, 'and B can log for A')

// ---- cleanup ----
for (const u of [A, Bu]) {
  const d = (await u.api(`/api/day?date=${D}`)).data
  for (const m of Object.values(d.meals)) for (const e of m.entries) await u.api(`/api/entries/${e.id}`, { method: 'DELETE' })
  for (const w of d.water.logs) await u.api(`/api/water/${w.id}`, { method: 'DELETE' })
}
await A.api(`/api/products/${aProd.id}`, { method: 'DELETE' })
ok((await Bu.api(`/api/day?date=${D}`)).data.totals.kcal === 0, 'cleaned up')
console.log('all connection checks passed')
process.exit(0)
