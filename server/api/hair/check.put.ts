export default defineEventHandler(async (event) => {
  const uid = requireHair(event)
  return checkRoutine(uid, parseOr400(hairCheckSchema, await readBody(event)))
})
