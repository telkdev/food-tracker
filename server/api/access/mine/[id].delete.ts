// I stop keeping someone's diary, or cancel my request.
export default defineEventHandler(event => removeAccess(String(getRouterParam(event, 'id')), uidOf(event)))
