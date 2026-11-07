export default defineEventHandler(async (event) => {
  setResponseStatus(event, 201)
  return upsertProduct(parseOr400(upsertProductSchema, await readBody(event)))
})
