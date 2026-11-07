// Cheap liveness endpoint for keep-awake pings: no DB query, so pings don't keep Neon's compute running.
export default defineEventHandler(() => ({ ok: true }))
