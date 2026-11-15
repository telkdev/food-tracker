// Is the phone connected: token exists, last sync, last data.
export default defineEventHandler(async event => ingestStatus(uidOf(event)))
