// Either side can end a connection.
export default defineEventHandler(event => disconnect(uidOf(event), String(getRouterParam(event, 'id'))))
