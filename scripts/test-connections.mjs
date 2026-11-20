// Diary access: the owner grants rights (log / edit), others can ask; checked over the app API (x-diary-for) and MCP (for_user).
// Needs three users. Resets access between them, writes only on 2020-01-03, cleans up, and leaves A<->B with full access.
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
const food = (name, kcal = 100) => ({ name, grams: 100, per100: { kcal, p: 1, f: 1, c: 1 }, source: 'generic' })
const forB = { 'x-diary-for': bId }

// clean slate: no access among the three
for (const [u, others] of [[A, [bId, cId]], [Bu, [aId, cId]], [C, [aId, bId]]]) for (const o of others) { await u.api(`/api/access/granted/${o}`, { method: 'DELETE' }); await u.api(`/api/access/mine/${o}`, { method: 'DELETE' }) }

// ---- no access → nothing ----
ok((await A.api(`/api/day?date=${D}`, { headers: forB })).status === 403, 'no access: A cannot read B')
// ---- A asks, B decides ----
ok((await A.api(`/api/access/requests/${bId}`, { method: 'POST' })).status === 200, 'A asks B for access')
ok((await A.api(`/api/day?date=${D}`, { headers: forB })).status === 403, 'a request alone gives nothing')
let ov = (await Bu.api('/api/access')).data
ok(ov.granted.some(g => g.id === aId && g.status === 'requested'), 'B sees the request')
ok((await A.api(`/api/access/granted/${cId}`, { method: 'PUT', body: { can_log: true, can_edit: true } })).status === 200, 'A gives C rights to A\'s diary (own call)')
ok((await C.api(`/api/day?date=${D}`, { headers: { 'x-diary-for': aId } })).status === 200, 'C reads A after A granted')
// B approves A with log only
ok((await Bu.api(`/api/access/granted/${aId}`, { method: 'PUT', body: { can_log: true, can_edit: false } })).status === 200, 'B allows A: log only')
ok((await A.api('/api/connections')).data.some(c => c.id === bId && c.can_log && !c.can_edit), 'A sees B in switcher list with log only')
ok(!(await Bu.api('/api/connections')).data.some(c => c.id === aId), 'not mutual: B has no access to A')
ok((await Bu.api(`/api/day?date=${D}`, { headers: { 'x-diary-for': aId } })).status === 403, 'B cannot read A')

// ---- app API with log only ----
let r = await A.api('/api/entries', { method: 'POST', headers: forB, body: { date: D, meal: 'lunch', items: [food('for B')] } })
ok(r.status === 201 && r.data.created[0].logged_by === aId, 'A logs into B, marked logged_by A')
const eA = r.data.created[0]
const eB = (await Bu.api('/api/entries', { method: 'POST', body: { date: D, meal: 'lunch', items: [food('B own', 50)] } })).data.created[0]
ok((await A.api(`/api/entries/${eA.id}`, { method: 'PATCH', headers: forB, body: { grams: 150 } })).status === 200, 'log-only: A edits the entry A added')
ok((await A.api(`/api/entries/${eB.id}`, { method: 'PATCH', headers: forB, body: { grams: 1 } })).status === 404, 'log-only: A cannot edit B\'s own entry')
ok((await A.api(`/api/entries/${eB.id}`, { method: 'DELETE', headers: forB })).status === 404, 'log-only: A cannot delete B\'s own entry')
r = await A.api('/api/water', { method: 'POST', headers: forB, body: { date: D, ml: 250 } })
ok(r.status === 200 && r.data.water.ml === 250, 'A logs water for B')
await A.api('/api/settings', { method: 'PATCH', headers: forB, body: { kcal_goal: 2345 } })
ok((await Bu.api('/api/settings')).data.kcalGoal !== 2345, 'header never changes B\'s settings')
// edit only (no log)
await Bu.api(`/api/access/granted/${aId}`, { method: 'PUT', body: { can_log: false, can_edit: true } })
ok((await A.api('/api/entries', { method: 'POST', headers: forB, body: { date: D, items: [food('x')] } })).status === 403, 'edit-only: A cannot add')
ok((await A.api(`/api/entries/${eB.id}`, { method: 'PATCH', headers: forB, body: { grams: 60 } })).status === 200, 'edit-only: A edits any entry')
ok((await Bu.api(`/api/access/granted/${aId}`, { method: 'PUT', body: { can_log: false, can_edit: false } })).status === 400, 'cannot leave zero rights')

// ---- MCP ----
await Bu.api(`/api/access/granted/${aId}`, { method: 'PUT', body: { can_log: true, can_edit: false } })
const mA = await mcpFor(A.cookie)
const ctx = await mA('get_context', {})
const row = ctx.data.connections?.find(([l]) => l === process.env.APP_LOGIN_2)
ok(row && row[2] === 'log', 'get_context lists B with rights "log"')
r = await mA('log_food', { for_user: row[1].toUpperCase(), date: D, meal: 'dinner', items: [food('mcp for B')] })
ok(!r.err && r.data.for_user === bId, 'MCP log_food for B by display name')
ok((await mA('delete_entry', { id: eB.id, for_user: process.env.APP_LOGIN_2 })).err, 'MCP log-only: cannot delete B\'s own entry')
ok(!(await mA('delete_entry', { id: r.data.created[0].id, for_user: process.env.APP_LOGIN_2 })).err, 'MCP log-only: deletes own entry in B')
await Bu.api(`/api/access/granted/${aId}`, { method: 'PUT', body: { can_log: false, can_edit: true } })
r = await mA('log_water', { for_user: process.env.APP_LOGIN_2, date: D, ml: 300 })
ok(r.err && /not allowed/.test(r.data), 'MCP edit-only: log_water refused')
ok((await mA('get_day', { date: D })).data.totals.kcal === 0, 'A\'s own day untouched')
r = await mA('log_food', { for_user: process.env.APP_LOGIN_3, date: D, items: [food('x')] })
ok(r.err && /not shared/.test(r.data), 'MCP refuses C (C never shared with A)')

// ---- revoke / leave ----
ok((await Bu.api(`/api/access/granted/${aId}`, { method: 'DELETE' })).status === 200, 'B revokes A')
ok((await A.api(`/api/day?date=${D}`, { headers: forB })).status === 403, 'after revoke A cannot read B')
ok((await C.api(`/api/access/mine/${aId}`, { method: 'DELETE' })).status === 200, 'C leaves A\'s diary')
ok((await C.api(`/api/day?date=${D}`, { headers: { 'x-diary-for': aId } })).status === 403, 'after leaving C cannot read A')

// ---- cleanup: day data, and restore A<->B full access ----
for (const u of [A, Bu]) {
  const d = (await u.api(`/api/day?date=${D}`)).data
  for (const m of Object.values(d.meals)) for (const e of m.entries) await u.api(`/api/entries/${e.id}`, { method: 'DELETE' })
  for (const w of d.water.logs) await u.api(`/api/water/${w.id}`, { method: 'DELETE' })
}
await A.api(`/api/access/granted/${bId}`, { method: 'PUT', body: { can_log: true, can_edit: true } })
await Bu.api(`/api/access/granted/${aId}`, { method: 'PUT', body: { can_log: true, can_edit: true } })
ok((await Bu.api(`/api/day?date=${D}`)).data.totals.kcal === 0, 'cleaned up')
console.log('all access checks passed')
process.exit(0)
