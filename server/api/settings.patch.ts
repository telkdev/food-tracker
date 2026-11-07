export default defineEventHandler(async event => setGoals(uidOf(event), parseOr400(goalsSchema, await readBody(event))))
