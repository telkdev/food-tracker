// The Products screen lists everything saved; GET /api/products needs a 2+ char query.
export default defineEventHandler(async event => ({ results: await listMyProducts(uidOf(event)) }))
