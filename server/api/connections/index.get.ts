// People I can log food for (and who can log for me).
export default defineEventHandler(event => listConnections(uidOf(event)))
