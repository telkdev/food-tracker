import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildReport, type ReportEntry, type ReportInput } from '../server/utils/reportSummary'
import { renderReportPdf } from '../server/utils/reportPdf'

const e = (date: string, name: string, grams: number, kcal100: number, p100: number, extra: Partial<ReportEntry> = {}): ReportEntry => ({
  date, meal: 'lunch', name, key: null, grams,
  kcal: kcal100 * grams / 100, p: p100 * grams / 100, f: 5 * grams / 100, c: 20 * grams / 100,
  fiber: null, sugar: null, salt: null, source: 'label', ...extra,
})

const base = (entries: ReportEntry[], over: Partial<ReportInput> = {}): ReportInput => ({
  from: '2026-11-09', to: '2026-11-15', today: '2026-11-16',
  goal: { kcal: 2000, p: 150, f: null, c: null }, suggested: null, waterGoalMl: 2000,
  entries, water: [], weights: [], ...over,
})

describe('buildReport', () => {
  it('leaves partial days out of averages and adherence', () => {
    const r = buildReport(base([
      e('2026-11-09', 'rice', 1000, 200, 15), // 2000 kcal, 150 p
      e('2026-11-10', 'rice', 1100, 200, 10), // 2200 kcal, 110 p
      e('2026-11-11', 'apple', 100, 50, 0), // 50 kcal → partial
    ]))
    expect(r.period_days).toBe(7)
    expect(r.logged_days).toBe(3)
    expect(r.full_days).toBe(2)
    expect(r.partial_days).toBe(1)
    expect(r.avg.kcal).toBe(2100)
    expect(r.adherence.kcal_on_target).toBe(2)
    expect(r.adherence.protein_hit).toBe(1)
    expect(r.adherence.avg_kcal_vs_goal).toBe(100)
  })

  it('clamps the end to today and uses the suggested protein goal', () => {
    const r = buildReport(base([], { to: '2026-11-30', goal: { kcal: 2000, p: null, f: null, c: null }, suggested: { p: 160, f: 70, c: 200 } }))
    expect(r.to).toBe('2026-11-16')
    expect(r.period_days).toBe(8)
    expect(r.goal.p).toBe(160)
    expect(r.goal.p_suggested).toBe(true)
  })

  it('groups top foods by product or name and averages water over days with water', () => {
    const r = buildReport(base([
      e('2026-11-09', 'Skyr', 400, 60, 11, { key: 'p1' }),
      e('2026-11-10', 'skyr natural', 400, 60, 11, { key: 'p1' }),
      e('2026-11-10', 'Bread', 300, 250, 8),
      e('2026-11-09', 'bread ', 300, 250, 8),
    ], { water: [{ date: '2026-11-09', ml: 1500 }, { date: '2026-11-09', ml: 500 }, { date: '2026-11-10', ml: 1000 }] }))
    expect(r.top_kcal[0]).toMatchObject({ name: 'bread', times: 2, grams: 600, days: 2 })
    expect(r.top_protein[0]).toMatchObject({ name: 'Skyr', times: 2, p: 88 })
    expect(r.water).toMatchObject({ avg_ml: 1500, days: 2, hit_days: 1 })
  })

  it('reports extras as a lower bound with coverage', () => {
    const r = buildReport(base([
      e('2026-11-09', 'oats', 500, 380, 13, { fiber: 50 }),
      e('2026-11-09', 'mystery', 500, 20, 0),
    ]))
    expect(r.extras.fiber.g).toBe(50)
    expect(r.extras.fiber.coverage).toBe(0.95)
    expect(r.extras.sugar.g).toBeNull()
  })

  it('computes weight change from the last weigh-in before the period', () => {
    const r = buildReport(base([], { weights: [{ date: '2026-11-05', kg: 90 }, { date: '2026-11-12', kg: 89.4 }, { date: '2026-11-15', kg: 89.0 }] }))
    expect(r.weight?.start?.kg).toBe(90)
    expect(r.weight?.change).toBe(-1)
    expect(r.weight?.weigh_ins).toBe(2)
  })
})

describe('renderReportPdf', () => {
  const fonts = {
    regular: readFileSync('server/assets/fonts/Onest_400Regular.ttf'),
    medium: readFileSync('server/assets/fonts/Onest_500Medium.ttf'),
    bold: readFileSync('server/assets/fonts/Onest_700Bold.ttf'),
  }
  it('renders a PDF in every locale, with and without the diary', async () => {
    const entries: ReportEntry[] = []
    for (let i = 0; i < 31; i++) {
      const d = new Date(Date.parse('2026-10-16T12:00:00Z') + i * 86400_000).toISOString().slice(0, 10)
      if (i % 9 === 4) continue
      entries.push(e(d, 'Овсянка с молоком', 250, 150, 6, { meal: 'breakfast', fiber: 6, sugar: 8, salt: 0.2 }))
      entries.push(e(d, 'Куриная грудка', 200 + (i % 4) * 50, 165, 31, { meal: 'lunch', key: 'chicken' }))
      entries.push(e(d, 'Рис варёный', 250, 130, 2.7, { meal: 'lunch' }))
      entries.push(e(d, 'Скир', 300, 63, 11, { meal: 'snack', source: i % 2 ? 'estimate' : 'label' }))
      if (i % 3) entries.push(e(d, 'Шоколад молочный', 50 + i * 3, 540, 7, { meal: 'snack', sugar: 50 }))
      if (i % 9 !== 2) entries.push(e(d, 'Паста болоньезе', 350, 160, 8, { meal: 'dinner' }))
    }
    const water = entries.filter((_, i) => i % 5 === 0).map(x => ({ date: x.date, ml: 1800 }))
    const r = buildReport(base(entries, {
      from: '2026-10-16', to: '2026-11-15', goal: { kcal: 2500, p: 200, f: 80, c: 250 }, water,
      weights: [{ date: '2026-10-14', kg: 92.3 }, { date: '2026-10-25', kg: 91.8 }, { date: '2026-11-08', kg: 91.1 }, { date: '2026-11-15', kg: 90.9 }],
    }))
    for (const locale of ['ru', 'uk', 'en'] as const) {
      const pdf = await renderReportPdf(r, { locale, name: 'Вася', goalType: 'recomp', details: locale === 'ru', entries, fonts })
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
      if (process.env.REPORT_OUT) writeFileSync(`${process.env.REPORT_OUT}/report-${locale}.pdf`, pdf)
    }
    const empty = await renderReportPdf(buildReport(base([])), { locale: 'ru', name: null, goalType: 'cut', details: true, entries: [], fonts })
    expect(empty.length).toBeGreaterThan(1000)
  })
})
