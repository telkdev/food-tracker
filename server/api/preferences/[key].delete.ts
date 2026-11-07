export default defineEventHandler(event => setPreference(uidOf(event), parseOr400(prefKeySchema, getRouterParam(event, 'key')), null))
