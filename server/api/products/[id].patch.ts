import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const id = parseOr400(z.uuid(), getRouterParam(event, 'id'))
  return updateProduct(id, parseOr400(upsertProductSchema, await readBody(event)))
})
