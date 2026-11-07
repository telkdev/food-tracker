export default defineEventHandler(async (event) => {
  setResponseStatus(event, 201)
  return upsertProduct(uidOf(event), parseOr400(upsertProductSchema, await readBody(event)))
})
