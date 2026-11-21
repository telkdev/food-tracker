import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const uid = requireHair(event)
  const id = parseOr400(z.uuid(), getRouterParam(event, 'id'))
  return updateRoutine(uid, id, parseOr400(hairRoutinePatchSchema, await readBody(event)))
})
