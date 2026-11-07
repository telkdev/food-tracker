// The Products screen lists everything saved; GET /api/products needs a 2+ char query.
export default defineEventHandler(async () => ({ results: await listMyProducts() }))
