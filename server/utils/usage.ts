import { sql } from 'drizzle-orm'

/** Rough Claude token estimate: ASCII ≈ 3.5 chars/token, everything else ≈ 2 chars/token. */
export function estimateTokens(s: string) {
  let ascii = 0
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) < 128) ascii++
  return Math.ceil(ascii / 3.5 + (s.length - ascii) / 2)
}

export function logMcpCall(tool: string, args: unknown, out: string, ok: boolean, ms: number) {
  const input = JSON.stringify(args ?? {})
  // fire-and-forget: usage logging must never break a tool call
  useDb().insert(schema.mcpCalls).values({
    tool, ok, ms,
    inChars: input.length, outChars: out.length,
    inTokens: estimateTokens(input), outTokens: estimateTokens(out),
  }).catch(e => console.warn('[usage] log failed', e?.message))
}

export async function getUsage(days: number) {
  const s = await getSettings()
  const tz = s.timezone
  const c = schema.mcpCalls
  const since = sql`now() - make_interval(days => ${days})`
  const localDay = sql<string>`to_char(${c.at} at time zone ${tz}, 'YYYY-MM-DD')`
  const db = useDb()
  const [byDay, byTool] = await Promise.all([
    db.select({
      date: localDay,
      calls: sql<number>`count(*)::int`,
      tokens: sql<number>`sum(${c.inTokens} + ${c.outTokens})::int`,
    }).from(c).where(sql`${c.at} >= ${since}`).groupBy(sql`1`).orderBy(sql`1`),
    db.select({
      tool: c.tool,
      calls: sql<number>`count(*)::int`,
      errors: sql<number>`count(*) filter (where not ${c.ok})::int`,
      tokens: sql<number>`sum(${c.inTokens} + ${c.outTokens})::int`,
      avg_tokens: sql<number>`round(avg(${c.inTokens} + ${c.outTokens}))::int`,
      avg_ms: sql<number>`round(avg(${c.ms}))::int`,
    }).from(c).where(sql`${c.at} >= ${since}`).groupBy(c.tool).orderBy(sql`4 desc`),
  ])
  const today = localDate(tz)
  return {
    days,
    today: byDay.find(d => d.date === today) ?? { date: today, calls: 0, tokens: 0 },
    total: { calls: byTool.reduce((a, r) => a + r.calls, 0), tokens: byTool.reduce((a, r) => a + r.tokens, 0) },
    by_day: byDay,
    by_tool: byTool,
    note: 'Estimated tokens of tool inputs and server responses only. Claude also spends tokens on your messages, its replies, images, and about 2.5k tokens of tool definitions per chat.',
  }
}
