export default defineEventHandler(async event => logWater(uidOf(event), parseOr400(logWaterSchema, await readBody(event)), loggedByOf(event)))
