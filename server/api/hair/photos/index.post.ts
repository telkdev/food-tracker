export default defineEventHandler(async (event) => {
  const uid = requireHair(event)
  return addPhoto(event, uid)
})
