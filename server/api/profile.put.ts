// Save questionnaire answers (any subset) and, optionally, today's weight.
export default defineEventHandler(async event => updateProfile(uidOf(event), parseOr400(profileSchema, await readBody(event))))
