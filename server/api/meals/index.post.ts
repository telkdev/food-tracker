export default defineEventHandler(async (event) => {
  setResponseStatus(event, 201)
  return saveMeal(parseOr400(saveMealSchema, await readBody(event)))
})
