import { isAwakeHour, KEEP_AWAKE_INTERVAL_MS, parseHours } from '../utils/keepAwake'

// Only on Render (RENDER_EXTERNAL_URL is set there). KEEP_AWAKE_HOURS: local Warsaw hours, default "7-24"; "off" disables.
export default defineNitroPlugin(() => {
  const base = process.env.RENDER_EXTERNAL_URL
  if (!base) return
  const spec = process.env.KEEP_AWAKE_HOURS ?? '7-24'
  const hours = parseHours(spec)
  if (!hours) {
    console.log(`keep-awake: off (KEEP_AWAKE_HOURS=${spec})`)
    return
  }
  const url = new URL('/ping', base).toString()
  const timer = setInterval(async () => {
    if (!isAwakeHour(hours, 'Europe/Warsaw')) return
    try {
      await fetch(url, { signal: AbortSignal.timeout(30_000) })
    }
    catch (e) {
      console.warn('keep-awake: ping failed', (e as Error).message)
    }
  }, KEEP_AWAKE_INTERVAL_MS)
  timer.unref()
  console.log(`keep-awake: pinging ${url} every 10 min, ${hours.from}:00–${hours.to}:00 Europe/Warsaw`)
})
