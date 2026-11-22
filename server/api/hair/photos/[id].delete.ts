import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const uid = requireHair(event)
  const id = parseOr400(z.uuid(), getRouterParam(event, 'id'))
  return deletePhoto(uid, id)
})
