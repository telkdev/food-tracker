export default defineEventHandler(async (event) => {
  setResponseStatus(event, 201)
  return logFood(uidOf(event), parseOr400(logFoodSchema, await readBody(event)))
})
