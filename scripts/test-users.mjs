// Two users must never see or change each other's data, over the app API and over MCP.
// Needs NUXT_USERS with a second user on the server. Writes only on 2020-01-02 and cleans up.
// Usage: BASE_URL=http://localhost:3000 APP_PASSWORD=<owner> APP_PASSWORD_2=<second user> node scripts/test-users.mjs
import { createHash, randomBytes } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const B = process.env.BASE_URL || 'http://localhost:3000'
const ok = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1) } console.log('ok  ', m) }
const D = '2020-01-02'
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback'

async function login(password) {
  const r = await fetch(`${B}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })
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

const A = await login(process.env.APP_PASSWORD)
const Bu = await login(process.env.APP_PASSWORD_2)
ok((await (await fetch(`${B}/api/_auth/session`, { headers: { cookie: Bu.cookie } })).json()).user.id !== 'owner', 'second password logs in as a different user')

// A creates a product, an entry, a usual meal and a rule
const prod = (await A.api('/api/products', { method: 'POST', body: { name: 'isolation test product', barcode: '4006381333931', per100: { kcal: 100, p: 1, f: 1, c: 1 }, source: 'label' } })).data
const entry = (await A.api('/api/entries', { method: 'POST', body: { date: D, meal: 'lunch', items: [{ name: 'isolation test', grams: 100, product_id: prod.id }] } })).data.created[0]
const meal = (await A.api('/api/meals', { method: 'POST', body: { name: 'isolation meal', items: [{ name: 'x', grams: 10, product_id: prod.id }] } })).data
await A.api('/api/preferences/isolation_rule', { method: 'PUT', body: { text: 'secret rule' } })
ok(entry?.id && meal?.id, 'owner created product, entry, meal, rule')

// B sees none of it over the app API
ok((await Bu.api(`/api/day?date=${D}`)).data.totals.kcal === 0, 'B: day is empty')
ok(!(await Bu.api('/api/products/mine')).data.results.some(p => p.id === prod.id), 'B: product not in My products')
ok((await Bu.api('/api/products?q=isolation&off=0')).data.results.length === 0, 'B: search finds nothing')
ok((await Bu.api('/api/products/barcode/4006381333931')).data.origin !== 'my_products', 'B: barcode not found locally')
ok(!(await Bu.api('/api/meals')).data.some(m => m.id === meal.id), 'B: usual meal hidden')
ok(!(await Bu.api('/api/preferences')).data.some(p => p.key === 'isolation_rule'), 'B: rule hidden')
// ...and can't touch it by id
ok((await Bu.api(`/api/entries/${entry.id}`, { method: 'PATCH', body: { grams: 1 } })).status === 404, 'B: edit A\'s entry → 404')
ok((await Bu.api(`/api/entries/${entry.id}`, { method: 'DELETE' })).status === 404, 'B: delete A\'s entry → 404')
ok((await Bu.api(`/api/products/${prod.id}`, { method: 'DELETE' })).status === 404, 'B: delete A\'s product → 404')
ok((await Bu.api(`/api/meals/${meal.id}/log`, { method: 'POST', body: { date: D } })).status === 404, 'B: log A\'s usual meal → 404')
ok((await Bu.api('/api/entries', { method: 'POST', body: { date: D, items: [{ name: 'steal', grams: 10, product_id: prod.id }] } })).status === 400, 'B: log with A\'s product id → 400')
ok((await Bu.api('/api/preferences/isolation_rule', { method: 'DELETE' })).status === 404, 'B: delete A\'s rule → 404')
// goals are per user
await Bu.api('/api/settings', { method: 'PATCH', body: { kcal_goal: 1800 } })
ok((await A.api('/api/settings')).data.kcalGoal !== 1800 && (await Bu.api('/api/settings')).data.kcalGoal === 1800, 'goals are per user')
await Bu.api('/api/settings', { method: 'PATCH', body: { kcal_goal: 2500 } })

// MCP: B's token acts as B
const callB = await mcpFor(Bu.cookie)
let r = await callB('get_day', { date: D })
ok(!r.err && r.data.totals.kcal === 0, 'B via MCP: day is empty')
r = await callB('get_context', {})
ok(!r.err && !r.data.meals.some(m => m.id === meal.id) && !r.data.prefs.isolation_rule, 'B via MCP: context has none of A\'s memory')
r = await callB('delete_entry', { id: entry.id })
ok(r.err, 'B via MCP: delete A\'s entry → error')
r = await callB('log_meal', { meal_id: meal.id, date: D })
ok(r.err, 'B via MCP: log A\'s usual meal → error')
r = await callB('log_food', { date: D, meal: 'snack', items: [{ name: 'B snack', grams: 50, per100: { kcal: 200, p: 1, f: 1, c: 1 }, source: 'generic' }] })
ok(!r.err && r.data.day.totals.kcal === 100, 'B via MCP: logs into B\'s diary')
const bEntry = r.data.created[0].id
ok((await A.api(`/api/day?date=${D}`)).data.totals.kcal === 100, 'A still sees only A\'s 100 kcal')

// A's MCP token acts as A
const callA = await mcpFor(A.cookie)
r = await callA('get_day', { date: D })
ok(!r.err && r.data.totals.kcal === 100 && r.data.meals.lunch, 'A via MCP: sees A\'s entry')

// cleanup
await callB('delete_entry', { id: bEntry })
await A.api(`/api/entries/${entry.id}`, { method: 'DELETE' })
await A.api(`/api/meals/${meal.id}`, { method: 'DELETE' })
await A.api('/api/preferences/isolation_rule', { method: 'DELETE' })
await A.api(`/api/products/${prod.id}`, { method: 'DELETE' })
console.log('\nALL PASSED')
process.exit(0)
