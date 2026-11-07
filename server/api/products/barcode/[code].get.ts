export default defineEventHandler(async event => lookupBarcode(getRouterParam(event, 'code') ?? ''))
