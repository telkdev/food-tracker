import { z } from 'zod'
// I (the diary owner) give someone rights to my diary, change them, or approve their request.
export default defineEventHandler(async (event) => {
  const body = parseOr400(z.object({ can_log: z.boolean(), can_edit: z.boolean() }), await readBody(event))
  return grantAccess(uidOf(event), String(getRouterParam(event, 'id')), body)
})
