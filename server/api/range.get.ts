import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const { from, to } = parseOr400(z.object({ from: isoDate, to: isoDate }), getQuery(event))
  return getRange(from, to)
})
