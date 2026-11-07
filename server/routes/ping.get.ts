// Keep-alive target: answers without touching the database, so pings don't keep Neon awake too.
export default defineEventHandler(() => 'ok')
