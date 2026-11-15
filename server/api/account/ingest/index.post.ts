// Create or replace the phone's ingest token. The token is returned only once.
export default defineEventHandler(async (event) => {
  const token = await rotateIngestToken(uidOf(event))
  return { token, url: `${baseUrl(event)}/api/ingest/health` }
})
