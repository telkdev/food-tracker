// I (the diary owner) revoke someone's access or decline their request.
export default defineEventHandler(event => removeAccess(uidOf(event), String(getRouterParam(event, 'id'))))
