import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { buildMcpServer } from '../mcp/tools'

// Stateless Streamable HTTP: one server + transport per POST, JSON responses, no session state to lose
// when Render restarts or sleeps.
export default defineEventHandler(async (event) => {
  const token = await requireBearer(event)
  if (event.method !== 'POST') {
    setResponseHeader(event, 'Allow', 'POST')
    throw createError({ statusCode: 405, statusMessage: 'Method Not Allowed' })
  }
  const body = await readBody(event)
  const server = buildMcpServer(token.userId)
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  event.node.res.on('close', () => { void transport.close(); void server.close() })
  await server.connect(transport)
  await transport.handleRequest(event.node.req, event.node.res, body)
  event._handled = true
})
