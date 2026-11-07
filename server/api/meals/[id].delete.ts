import { z } from 'zod'
export default defineEventHandler(event => deleteSavedMeal(uidOf(event), parseOr400(z.uuid(), getRouterParam(event, 'id'))))
