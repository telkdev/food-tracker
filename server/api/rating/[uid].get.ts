import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const { date } = parseOr400(z.object({ date: isoDate.optional() }), getQuery(event))
  const uid = getRouterParam(event, 'uid') ?? ''
  return getRatingPerson(uidOf(event), uid, date)
})
