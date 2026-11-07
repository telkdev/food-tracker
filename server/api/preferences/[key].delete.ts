export default defineEventHandler(event => setPreference(parseOr400(prefKeySchema, getRouterParam(event, 'key')), null))
