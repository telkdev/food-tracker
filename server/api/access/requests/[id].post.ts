// I ask someone to let me keep their diary; they decide in their Settings.
export default defineEventHandler(event => requestAccess(uidOf(event), String(getRouterParam(event, 'id'))))
