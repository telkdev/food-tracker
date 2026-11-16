/** Period report as JSON (the in-app preview and Claude via MCP use the same numbers as the PDF). */
export default defineEventHandler(async (event) => {
  const q = parseOr400(reportQuerySchema, getQuery(event))
  const { report, meta } = await getReport(uidOf(event), q.from, q.to)
  return { ...meta, ...report }
})
