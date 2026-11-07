export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}))
  setResponseStatus(event, 201)
  return logSavedMeal(parseOr400(logMealSchema, { ...(body ?? {}), meal_id: getRouterParam(event, 'id') }))
})
