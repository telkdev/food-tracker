// Today screen with ?for=<user>: every request it makes to /api (sheets, water card, day plan…) carries
// x-diary-for, so they read and write the connected person's diary. Patched at the fetch level because
// components get their own $fetch instance. The server honours the header only on diary routes and only
// for connected users (server/utils/connections.ts); on any other screen nothing is added.
export default defineNuxtPlugin(() => {
  const router = useRouter()
  const orig = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const r = router.currentRoute.value
    const who = r.path === '/' && typeof r.query.for === 'string' ? r.query.for : null
    if (!who) return orig(input, init)
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const url = new URL(raw, location.href)
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return orig(input, init)
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    headers.set('x-diary-for', who)
    return orig(input, { ...init, headers })
  }
})
