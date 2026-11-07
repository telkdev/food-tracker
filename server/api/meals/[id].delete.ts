import { z } from 'zod'
export default defineEventHandler(event => deleteSavedMeal(parseOr400(z.uuid(), getRouterParam(event, 'id'))))
