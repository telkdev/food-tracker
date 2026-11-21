export default defineEventHandler(async (event) => {
  const uid = requireHair(event)
  return createRoutine(uid, parseOr400(hairRoutineSchema, await readBody(event)))
})
