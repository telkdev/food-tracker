// Path-suffixed variant some clients probe first (RFC 9728 §3.1).
export default defineEventHandler(event => ({
  resource: mcpUrl(event),
  authorization_servers: [baseUrl(event)],
  scopes_supported: [SCOPE],
  bearer_methods_supported: ['header'],
  resource_name: 'Food Tracker',
}))
