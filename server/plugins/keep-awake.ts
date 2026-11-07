/**
 * Render's free plan stops an instance after 15 min without inbound HTTP traffic. GitHub Actions cron is
 * far too unreliable for that (2 runs instead of ~60 on 2026-11-07), so the server pings itself through its
 * public URL, which goes through Render's edge and counts as inbound traffic.
 *
 * Only 08:30–22:00 Warsaw time (Vasyl's choice): at night it sleeps, which keeps it near 13.5 h/day of the
 * 750 free instance hours shared with other services. A self-ping cannot wake a sleeping instance: the
 * morning wake comes from .github/workflows/wake-up.yml (best effort) or the first visit of the day.
 * Disable with KEEP_AWAKE=off.
 */
const INTERVAL_MS = 10 * 60 * 1000

export default defineNitroPlugin(() => {
  const base = process.env.RENDER_EXTERNAL_URL
  if (!base || process.env.KEEP_AWAKE === 'off') return
  const url = new URL('/api/ping', base).toString()
  const timer = setInterval(async () => {
    if (!inKeepAwakeWindow()) return
    try {
      await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { 'user-agent': 'food-tracker-keep-awake' } })
    } catch (e) {
      console.warn('[keep-awake] ping failed:', (e as Error).message)
    }
  }, INTERVAL_MS)
  timer.unref()
})
