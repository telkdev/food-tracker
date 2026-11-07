export default defineEventHandler(async (event) => {
  const body = await readBody<{ text?: string }>(event)
  const p = parseOr400(setPreferenceSchema, { key: getRouterParam(event, 'key'), text: body?.text ?? '' })
  return setPreference(p.key, p.text)
})
