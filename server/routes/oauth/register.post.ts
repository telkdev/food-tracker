// RFC 7591 dynamic client registration (fallback when CIMD isn't used).
export default defineEventHandler(async (event) => {
  try {
    const meta = await readBody(event)
    const c = await registerClient(meta ?? {}, extraRedirects(event))
    setResponseStatus(event, 201)
    return {
      client_id: c.id, client_name: c.name, redirect_uris: c.redirectUris,
      token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
      client_id_issued_at: Math.floor(Date.now() / 1000),
    }
  } catch (e) { return sendOAuthError(event, e) }
})
