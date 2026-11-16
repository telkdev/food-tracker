/**
 * GET /api/report.pdf?from=YYYY-MM-DD&to=YYYY-MM-DD&lang=ru|uk|en&details=1
 * A4 PDF for a coach: summary, charts, daily table, top foods, weight, optional food diary.
 */
export default defineEventHandler(async (event) => {
  const q = parseOr400(reportQuerySchema, getQuery(event))
  const uid = uidOf(event)
  const [{ report, entries, meta }, fonts] = await Promise.all([getReport(uid, q.from, q.to), reportFonts()])
  const pdf = await renderReportPdf(report, {
    locale: q.lang ?? 'ru',
    name: meta.name,
    goalType: meta.goal_type,
    details: q.details === '1',
    entries,
    fonts,
  })
  const file = `food-report_${report.from}_${report.to}.pdf`
  setResponseHeaders(event, {
    'content-type': 'application/pdf',
    'content-disposition': `attachment; filename="${file}"`,
    'cache-control': 'private, no-store',
  })
  return pdf
})
