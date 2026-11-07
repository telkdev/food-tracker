import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const id = parseOr400(z.uuid(), getRouterParam(event, 'id'))
  return deleteProduct(uidOf(event), id)
})
