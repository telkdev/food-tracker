import { timingSafeEqual } from 'node:crypto'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const session = await getUserSession(event)
  const uid = (session.user as { id?: unknown } | undefined)?.id
  if (!isKnownUser(uid)) return errorPage(event, 'Your login expired. Start connecting again from Claude.')
  const csrf = String(body?.csrf || '')
  const expected = String((session as any).oauthCsrf || '')
  if (!expected || csrf.length !== expected.length || !timingSafeEqual(Buffer.from(csrf), Buffer.from(expected))) {
    return errorPage(event, 'This approval form expired. Start connecting again from Claude.')
  }
  await setUserSession(event, { oauthCsrf: null })
  const v = await validateAuthorize(event, { ...body, response_type: 'code', code_challenge_method: 'S256' })
  if (v.fatal) return errorPage(event, v.fatal)
  if (v.redirectError) return sendRedirect(event, v.redirectError, 303)
  const p = v.params!
  if (body.action !== 'approve') {
    return sendRedirect(event, redirectWith(p.redirect_uri, { error: 'access_denied', state: p.state, iss: baseUrl(event) }), 303)
  }
  const code = await createCode({ userId: uid, clientId: p.client_id, redirectUri: p.redirect_uri, codeChallenge: p.code_challenge, scope: p.scope, resource: p.resource })
  return sendRedirect(event, redirectWith(p.redirect_uri, { code, state: p.state, iss: baseUrl(event) }), 303)
})
