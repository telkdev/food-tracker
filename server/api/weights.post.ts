// Log a weigh-in (default: today); one per day, a second one the same day replaces it.
export default defineEventHandler(async event => {
  const { kg, date } = parseOr400(weightSchema, await readBody(event))
  return setWeight(uidOf(event), kg, date)
})
