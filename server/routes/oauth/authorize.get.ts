export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const v = await validateAuthorize(event, q)
  if (v.fatal) return errorPage(event, v.fatal)
  if (v.redirectError) return sendRedirect(event, v.redirectError, 302)
  const session = await getUserSession(event)
  if (!session.user) {
    const u = getRequestURL(event)
    return sendRedirect(event, `/login?next=${encodeURIComponent(u.pathname + u.search)}`, 302)
  }
  return consentPage(event, v.client!, v.params!)
})
