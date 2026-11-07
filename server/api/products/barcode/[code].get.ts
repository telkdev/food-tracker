export default defineEventHandler(async event => lookupBarcode(uidOf(event), getRouterParam(event, 'code') ?? ''))
