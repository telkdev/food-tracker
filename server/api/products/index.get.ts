import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const { q, off } = parseOr400(z.object({ q: z.string().min(2).max(100), off: z.enum(['0', '1']).default('1') }), getQuery(event))
  return off === '1' ? searchProducts(uidOf(event), q) : { results: (await searchMyProducts(uidOf(event), q)).map(p => ({ origin: 'my_products', ...p })) }
})
