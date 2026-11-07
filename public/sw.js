// Food Tracker service worker: offline app shell + static assets only.
// Never caches API, MCP, OAuth or discovery responses (private, and must always be live).
const VERSION = 'ft-v1'
const STATIC = `${VERSION}-static`
const PAGES = `${VERSION}-pages`
const PRECACHE = ['/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png']
const NEVER = [/^\/api(\/|$)/, /^\/mcp(\/|$)/, /^\/oauth(\/|$)/, /^\/\.well-known(\/|$)/, /^\/_auth(\/|$)/]

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(STATIC).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()))
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (NEVER.some(re => re.test(url.pathname))) return

  // hashed build assets and icons: cache first
  if (url.pathname.startsWith('/_nuxt/') || url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest') {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(STATIC).then(c => c.put(req, copy)) }
      return res
    })))
    return
  }

  // pages: network first, fall back to the last copy when offline
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok && res.type === 'basic' && !res.redirected) { const copy = res.clone(); caches.open(PAGES).then(c => c.put(url.pathname, copy)) }
      return res
    }).catch(() => caches.open(PAGES).then(c => c.match(url.pathname).then(hit => hit || c.match('/')))
      .then(hit => hit || new Response('<h1>Offline</h1>', { headers: { 'content-type': 'text/html; charset=utf-8' } }))))
  }
})
