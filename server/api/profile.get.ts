// Questionnaire answers, weigh-ins (90 days) and suggested goals.
export default defineEventHandler(async event => getProfile(uidOf(event)))
