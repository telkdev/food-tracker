/**
 * Render's free plan stops an instance after 15 min without inbound HTTP traffic. GitHub Actions cron
 * turned out to be far too unreliable to prevent that (2 runs instead of ~60 on 2026-11-07), so the
 * server pings itself through its public URL, which goes through Render's edge and counts as inbound.
 *
 * Only during waking hours (Warsaw 07:00–23:59): at night it is allowed to sleep, which keeps this
 * service at ~17 h/day and leaves room in the 750 free instance hours shared with other services.
 * A self-ping cannot wake a sleeping instance, so the first request of the morning is still slow;
 * an external pinger (cron-job.org) covers that. Disable with KEEP_AWAKE=off.
 */
const INTERVAL_MS = 10 * 60 * 1000
const TZ = 'Europe/Warsaw'
const FROM_HOUR = 7

export default defineNitroPlugin(() => {
  const base = process.env.RENDER_EXTERNAL_URL
  if (!base || process.env.KEEP_AWAKE === 'off') return
  const url = new URL('/api/ping', base).toString()
  const timer = setInterval(async () => {
    if (localHour(TZ) < FROM_HOUR) return
    try {
      await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { 'user-agent': 'food-tracker-keep-awake' } })
    } catch (e) {
      console.warn('[keep-awake] ping failed:', (e as Error).message)
    }
  }, INTERVAL_MS)
  timer.unref()
})
