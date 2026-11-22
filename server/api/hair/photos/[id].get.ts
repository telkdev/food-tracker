import { z } from 'zod'
/** The JPEG itself (?size=thumb for the small one). Private: only the owner's session can fetch it. */
export default defineEventHandler(async (event) => {
  const uid = requireHair(event)
  const id = parseOr400(z.uuid(), getRouterParam(event, 'id'))
  const size = getQuery(event).size === 'thumb' ? 'thumb' : 'full'
  const data = await photoBytes(uid, id, size)
  setResponseHeaders(event, {
    'content-type': 'image/jpeg',
    'content-length': data.length,
    // a photo never changes under its id; cached in this browser only, never by a shared cache
    'cache-control': 'private, max-age=2592000, immutable',
    'x-content-type-options': 'nosniff',
  })
  return data
})
