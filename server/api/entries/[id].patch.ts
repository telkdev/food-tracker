import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const id = parseOr400(z.uuid(), getRouterParam(event, 'id'))
  return updateEntry(id, parseOr400(updateEntrySchema, await readBody(event)))
})
