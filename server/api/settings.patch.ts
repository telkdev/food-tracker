export default defineEventHandler(async event => setGoals(parseOr400(goalsSchema, await readBody(event))))
