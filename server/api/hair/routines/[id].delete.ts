import { z } from 'zod'
// archives: past checks stay for reports
export default defineEventHandler(async (event) => {
  const uid = requireHair(event)
  const id = parseOr400(z.uuid(), getRouterParam(event, 'id'))
  return archiveRoutine(uid, id)
})
