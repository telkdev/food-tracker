import { and, asc, between, eq } from 'drizzle-orm'
import { z } from 'zod'
import { recommendTargets } from '../../shared/targets'
import { addDaysIso, buildReport, type ReportEntry, type ReportMeal } from './reportSummary'
import type { ReportFonts } from './reportPdf'

export const MAX_REPORT_DAYS = 366

export const reportQuerySchema = z.object({
  from: isoDate,
  to: isoDate,
  lang: z.enum(['ru', 'uk', 'en']).optional(),
  // include the food-by-food diary as an appendix
  details: z.enum(['0', '1']).optional(),
})

/** Everything the report needs for one user and period, read-only. */
export async function getReport(uid: string, from: string, to: string) {
  if (from > to) throw createError({ statusCode: 400, statusMessage: '`from` must be on or before `to`' })
  if ((Date.parse(to) - Date.parse(from)) / 86400_000 >= MAX_REPORT_DAYS) throw createError({ statusCode: 400, statusMessage: `Range is limited to ${MAX_REPORT_DAYS} days` })
  const s = await getSettings(uid)
  const today = localDate(s.timezone)
  if (from > today) throw createError({ statusCode: 400, statusMessage: '`from` is in the future' })
  const end = to > today ? today : to
  const e = schema.entries
  const w = schema.water
  const wt = schema.weights
  const db = useDb()
  const [rows, water, weights, waterGoalInfo] = await Promise.all([
    db.select().from(e).where(and(eq(e.userId, uid), between(e.date, from, end))).orderBy(asc(e.date), asc(e.loggedAt)),
    db.select({ date: w.date, ml: w.ml }).from(w).where(and(eq(w.userId, uid), between(w.date, from, end))),
    db.select({ date: wt.date, kg: wt.kg }).from(wt).where(and(eq(wt.userId, uid), between(wt.date, addDaysIso(from, -14), end))).orderBy(asc(wt.date)),
    waterGoal(uid, s),
  ])
  const entries: ReportEntry[] = rows.map((r) => {
    // unknown fiber / sugar / salt are estimated by food type, like on Today
    const x = entryExtras(r)
    return {
      date: r.date, meal: r.meal as ReportMeal, name: r.name, key: r.productId, grams: r.grams,
      kcal: r.kcal ?? 0, p: r.p ?? 0, f: r.f ?? 0, c: r.c ?? 0,
      fiber: x.fiber, sugar: x.sugar, salt: x.salt, est: x.est, source: r.source,
    }
  })
  const lastKg = weights.at(-1)?.kg ?? (await getWeights(uid, today, 120)).at(-1)?.kg ?? null
  const targets = recommendTargets(profileOf(s), lastKg, today)
  const report = buildReport({
    from, to, today,
    goal: { kcal: s.kcalGoal, p: s.pGoal, f: s.fGoal, c: s.cGoal },
    suggested: targets ? { p: targets.p, f: targets.f, c: targets.c } : null,
    waterGoalMl: waterGoalInfo.goal_ml,
    entries, water, weights,
  })
  return {
    report,
    entries,
    meta: {
      name: await userDisplayName(uid).catch(() => null),
      goal_type: s.goalType,
      generated: today,
    },
  }
}

let fontCache: Promise<ReportFonts> | undefined

/** Onest TTFs from server/assets/fonts (bundled into the build by Nitro), read once. */
export function reportFonts(): Promise<ReportFonts> {
  fontCache ??= (async () => {
    const storage = useStorage('assets:server')
    const one = async (f: string) => {
      const raw = await storage.getItemRaw(`fonts:${f}`)
      if (!raw) throw new Error(`font ${f} missing from server assets`)
      return Buffer.from(raw as Uint8Array)
    }
    const [regular, medium, bold] = await Promise.all([one('Onest_400Regular.ttf'), one('Onest_500Medium.ttf'), one('Onest_700Bold.ttf')])
    return { regular, medium, bold }
  })().catch((e) => { fontCache = undefined; throw e })
  return fontCache
}
