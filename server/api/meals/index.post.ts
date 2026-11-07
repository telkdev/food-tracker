export default defineEventHandler(async (event) => {
  setResponseStatus(event, 201)
  return saveMeal(uidOf(event), parseOr400(saveMealSchema, await readBody(event)))
})
