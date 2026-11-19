/**
 * Coach report as a PDF, drawn with pdfkit (pure JS, no headless browser: Render's free plan has
 * 512 MB and a cold start, Chromium alone would eat most of both). Fonts: Onest TTF (Cyrillic),
 * bundled as server assets. A4 portrait, vector charts, light theme only (it gets printed).
 */
import PDFDocument from 'pdfkit'
import type { Report, ReportEntry, ReportMeal } from './reportSummary'
import { REPORT_MEALS } from './reportSummary'

export type ReportLocale = 'ru' | 'uk' | 'en'

const TAG: Record<ReportLocale, string> = { ru: 'ru-RU', uk: 'uk-UA', en: 'en-GB' }

const STR = {
  ru: {
    title: 'Отчёт о питании', days: (n: number) => `${n} ${plural(n, 'день', 'дня', 'дней')}`,
    goal_recomp: 'Цель: рекомпозиция', goal_cut: 'Цель: снижение веса', goal_bulk: 'Цель: набор массы',
    goals: 'Цели на день', kcal: 'ккал', g: 'г', l: 'л', kg: 'кг', water: 'вода',
    p: 'Б', f: 'Ж', c: 'У', protein: 'Белок', fat: 'Жиры', carbs: 'Углеводы',
    avgKcal: 'Калории в среднем', vsGoal: (d: string) => `${d} к цели`,
    avgP: 'Белок в среднем', ofGoal: (n: number) => `${n}% от цели`,
    kcalOn: 'Калории в коридоре ±10%', ofDays: (a: number, b: number) => `${a} из ${b} дней`, overUnder: (o: number, u: number) => `перебор ${o} · недобор ${u}`,
    pHit: 'Белок ≥ 90% цели', logged: 'Заполнено дней', partial: (n: number, none: number) => `без записей ${none} · неполных ${n}`,
    waterAvg: 'Вода в среднем', waterHint: (d: number, g: string) => `цель ${g} · дней с водой: ${d}`,
    fiber: 'Клетчатка', sugar: 'Сахара', salt: 'Соль', perDay: 'в день', known: (n: number) => `точно для ${n}% ккал, остальное — оценка`,
    estimate: 'Записано «на глаз»', estimateHint: 'доля ккал без этикетки',
    chartKcal: 'Калории по дням', chartP: 'Белок по дням, г', goalLine: 'цель', partialDay: 'неполный день', overDay: 'больше цели',
    energy: 'Энергия из БЖУ (в среднем)', mealShare: 'Калории по приёмам пищи',
    breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус',
    daily: 'По дням', date: 'Дата', est: 'На глаз',
    topKcal: 'Основные источники калорий', topP: 'Основные источники белка', food: 'Продукт', times: 'Раз', share: '% ккал', pShare: '% белка',
    weight: 'Вес', wStart: 'Начало', wEnd: 'Конец', wChange: 'Изменение', wTrend: 'Тренд', perWeek: 'кг/нед', weighIns: (n: number) => `${n} взвеш.`,
    diary: 'Дневник питания', noData: 'За этот период нет записей.',
    notes: 'Как считалось',
    note1: 'Средние и попадание в цели считаются только по полным дням: день, где записано меньше 40% цели по калориям, отмечен как неполный и в средние не входит.',
    note2: 'Цели — те, что стоят в приложении сейчас. Где у продукта нет клетчатки, сахаров или соли, они оценены по типу продукта (≈).',
    noteP: 'Цель по белку рассчитана по профилю (вручную не задана).',
    page: (a: number, b: number) => `стр. ${a} из ${b}`, made: 'Food Tracker',
    notLogged: 'нет записей',
  },
  uk: {
    title: 'Звіт про харчування', days: (n: number) => `${n} ${plural(n, 'день', 'дні', 'днів')}`,
    goal_recomp: 'Мета: рекомпозиція', goal_cut: 'Мета: зниження ваги', goal_bulk: 'Мета: набір маси',
    goals: 'Цілі на день', kcal: 'ккал', g: 'г', l: 'л', kg: 'кг', water: 'вода',
    p: 'Б', f: 'Ж', c: 'В', protein: 'Білок', fat: 'Жири', carbs: 'Вуглеводи',
    avgKcal: 'Калорії в середньому', vsGoal: (d: string) => `${d} до цілі`,
    avgP: 'Білок у середньому', ofGoal: (n: number) => `${n}% від цілі`,
    kcalOn: 'Калорії в коридорі ±10%', ofDays: (a: number, b: number) => `${a} з ${b} днів`, overUnder: (o: number, u: number) => `перебір ${o} · недобір ${u}`,
    pHit: 'Білок ≥ 90% цілі', logged: 'Заповнено днів', partial: (n: number, none: number) => `без записів ${none} · неповних ${n}`,
    waterAvg: 'Вода в середньому', waterHint: (d: number, g: string) => `ціль ${g} · днів із водою: ${d}`,
    fiber: 'Клітковина', sugar: 'Цукри', salt: 'Сіль', perDay: 'на день', known: (n: number) => `точно для ${n}% ккал, решта — оцінка`,
    estimate: 'Записано «на око»', estimateHint: 'частка ккал без етикетки',
    chartKcal: 'Калорії по днях', chartP: 'Білок по днях, г', goalLine: 'ціль', partialDay: 'неповний день', overDay: 'більше цілі',
    energy: 'Енергія з БЖВ (в середньому)', mealShare: 'Калорії за прийомами їжі',
    breakfast: 'Сніданок', lunch: 'Обід', dinner: 'Вечеря', snack: 'Перекус',
    daily: 'По днях', date: 'Дата', est: 'На око',
    topKcal: 'Основні джерела калорій', topP: 'Основні джерела білка', food: 'Продукт', times: 'Разів', share: '% ккал', pShare: '% білка',
    weight: 'Вага', wStart: 'Початок', wEnd: 'Кінець', wChange: 'Зміна', wTrend: 'Тренд', perWeek: 'кг/тижд', weighIns: (n: number) => `${n} зважув.`,
    diary: 'Щоденник харчування', noData: 'За цей період немає записів.',
    notes: 'Як рахувалося',
    note1: 'Середні та влучання в цілі рахуються лише за повними днями: день, де записано менше 40% цілі з калорій, позначено як неповний і в середні не входить.',
    note2: 'Цілі — ті, що зараз стоять у застосунку. Де в продукту немає клітковини, цукрів чи солі, їх оцінено за типом продукту (≈).',
    noteP: 'Ціль з білка розрахована за профілем (вручну не задана).',
    page: (a: number, b: number) => `стор. ${a} з ${b}`, made: 'Food Tracker',
    notLogged: 'немає записів',
  },
  en: {
    title: 'Nutrition report', days: (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`,
    goal_recomp: 'Goal: recomposition', goal_cut: 'Goal: fat loss', goal_bulk: 'Goal: muscle gain',
    goals: 'Daily goals', kcal: 'kcal', g: 'g', l: 'L', kg: 'kg', water: 'water',
    p: 'P', f: 'F', c: 'C', protein: 'Protein', fat: 'Fat', carbs: 'Carbs',
    avgKcal: 'Average calories', vsGoal: (d: string) => `${d} vs goal`,
    avgP: 'Average protein', ofGoal: (n: number) => `${n}% of goal`,
    kcalOn: 'Calories within ±10%', ofDays: (a: number, b: number) => `${a} of ${b} days`, overUnder: (o: number, u: number) => `over ${o} · under ${u}`,
    pHit: 'Protein ≥ 90% of goal', logged: 'Days logged', partial: (n: number, none: number) => `${none} not logged · ${n} partial`,
    waterAvg: 'Average water', waterHint: (d: number, g: string) => `goal ${g} · ${d} days logged`,
    fiber: 'Fiber', sugar: 'Sugars', salt: 'Salt', perDay: 'a day', known: (n: number) => `exact for ${n}% of kcal, the rest estimated`,
    estimate: 'Logged by estimate', estimateHint: 'share of kcal, no label',
    chartKcal: 'Calories by day', chartP: 'Protein by day, g', goalLine: 'goal', partialDay: 'partial day', overDay: 'over goal',
    energy: 'Energy from macros (average)', mealShare: 'Calories by meal',
    breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack',
    daily: 'By day', date: 'Date', est: 'Est.',
    topKcal: 'Top calorie sources', topP: 'Top protein sources', food: 'Food', times: 'Times', share: '% kcal', pShare: '% protein',
    weight: 'Weight', wStart: 'Start', wEnd: 'End', wChange: 'Change', wTrend: 'Trend', perWeek: 'kg/wk', weighIns: (n: number) => `${n} weigh-ins`,
    diary: 'Food diary', noData: 'Nothing logged in this period.',
    notes: 'How this is counted',
    note1: 'Averages and goal hits use complete days only: a day with less than 40% of the calorie goal logged is marked partial and left out.',
    note2: 'Goals are the ones set in the app today. Where a food has no fiber, sugars or salt, they are estimated from the food type (≈).',
    noteP: 'The protein goal is recommended from the profile (none set by hand).',
    page: (a: number, b: number) => `page ${a} of ${b}`, made: 'Food Tracker',
    notLogged: 'not logged',
  },
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

// light "Hairline Oat" tokens
const C = {
  ink: '#1d1b17', ink2: '#5c574d', ink3: '#6c665b', line: '#e4dfd3', track: '#ece8de', paper: '#faf8f3',
  accent: '#2e6a4e', accentSoft: '#cfe0d4', over: '#a84f37', overSoft: '#e9c4b6',
  protein: '#a35d84', fat: '#a07c2e', carbs: '#4f80ad', water: '#3a86b0', partial: '#cfc9bc',
}

export interface ReportFonts { regular: Buffer, medium: Buffer, bold: Buffer }

export interface RenderOptions {
  locale: ReportLocale
  name: string | null
  goalType: 'recomp' | 'cut' | 'bulk'
  details: boolean
  entries: ReportEntry[]
  fonts: ReportFonts
}

const A4 = { w: 595.28, h: 841.89 }
const M = 40
const W = A4.w - 2 * M
const BOTTOM = A4.h - 46

export function renderReportPdf(r: Report, o: RenderOptions): Promise<Buffer> {
  const s = STR[o.locale]
  const tag = TAG[o.locale]
  const nf = (n: number | null | undefined, d = 0) => n == null ? '—' : new Intl.NumberFormat(tag, { maximumFractionDigits: d }).format(n)
  const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${nf(Math.abs(n))}`
  const dFmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(tag, { ...opts, timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`))
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
  const dayShort = (iso: string) => cap(dFmt(iso, { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, ''))
  const litres = (ml: number | null) => ml == null ? '—' : `${nf(ml / 1000, 1)} ${s.l}`

  const doc = new PDFDocument({
    size: 'A4', margin: M, bufferPages: true, font: o.fonts.regular as any,
    info: { Title: `${s.title} ${r.from} – ${r.to}`, ...(o.name ? { Author: o.name } : {}), Creator: 'Food Tracker', CreationDate: new Date() },
  })
  doc.registerFont('R', o.fonts.regular)
  doc.registerFont('M', o.fonts.medium)
  doc.registerFont('B', o.fonts.bold)
  const chunks: Buffer[] = []
  doc.on('data', (b: Buffer) => chunks.push(b))
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  let y = M
  const ensure = (h: number) => { if (y + h > BOTTOM) { doc.addPage(); y = M } }
  const text = (t: string, x: number, yy: number, opts: { font?: 'R' | 'M' | 'B', size?: number, color?: string, width?: number, align?: 'left' | 'right' | 'center', lineBreak?: boolean } = {}) => {
    doc.font(opts.font ?? 'R').fontSize(opts.size ?? 9).fillColor(opts.color ?? C.ink)
      .text(t, x, yy, { width: opts.width, align: opts.align ?? 'left', lineBreak: opts.lineBreak ?? !!opts.width })
  }
  const h2 = (t: string) => {
    // keep a heading with at least a few rows of what follows
    ensure(90)
    y += 8
    text(t, M, y, { font: 'B', size: 12 })
    y += 20
  }

  // ---------- header ----------
  const periodLabel = r.from === r.to
    ? dFmt(r.from, { day: 'numeric', month: 'long', year: 'numeric' })
    : `${dFmt(r.from, { day: 'numeric', month: 'long', ...(r.from.slice(0, 4) !== r.to.slice(0, 4) ? { year: 'numeric' } : {}) })} – ${dFmt(r.to, { day: 'numeric', month: 'long', year: 'numeric' })}`
  text(s.title, M, y, { font: 'B', size: 22 })
  text(s[`goal_${o.goalType}`], M, y + 6, { size: 9, color: C.ink2, width: W, align: 'right' })
  y += 30
  text([o.name, periodLabel, s.days(r.period_days)].filter(Boolean).join('  ·  '), M, y, { size: 11, color: C.ink2 })
  y += 20
  const g = r.goal
  const goalBits = [
    `${nf(g.kcal)} ${s.kcal}`,
    g.p ? `${s.p} ${nf(g.p)} ${s.g}${g.p_suggested ? '*' : ''}` : null,
    g.f ? `${s.f} ${nf(g.f)} ${s.g}` : null,
    g.c ? `${s.c} ${nf(g.c)} ${s.g}` : null,
    g.water_ml ? `${s.water} ${litres(g.water_ml)}` : null,
  ].filter(Boolean)
  text(`${s.goals}:  ${goalBits.join('  ·  ')}`, M, y, { size: 9, color: C.ink3 })
  y += 16
  doc.moveTo(M, y).lineTo(M + W, y).lineWidth(0.6).strokeColor(C.line).stroke()
  y += 14

  if (!r.logged_days) {
    text(s.noData, M, y, { size: 12, color: C.ink2 })
    y += 30
  }
  else {
    // ---------- KPI tiles ----------
    const tiles: { label: string, value: string, hint: string, tone?: string }[] = [
      { label: s.avgKcal, value: r.avg.kcal != null ? `${nf(r.avg.kcal)} ${s.kcal}` : '—', hint: r.adherence.avg_kcal_vs_goal != null ? s.vsGoal(signed(r.adherence.avg_kcal_vs_goal)) : '' },
      { label: s.avgP, value: r.avg.p != null ? `${nf(r.avg.p)} ${s.g}` : '—', hint: r.adherence.avg_p_pct != null ? s.ofGoal(r.adherence.avg_p_pct) : '', tone: C.protein },
      { label: s.kcalOn, value: `${r.adherence.kcal_on_target} / ${r.full_days}`, hint: s.overUnder(r.adherence.kcal_over, r.adherence.kcal_under) },
      { label: s.pHit, value: r.adherence.protein_hit != null ? `${r.adherence.protein_hit} / ${r.full_days}` : '—', hint: g.p ? `${s.goalLine} ${nf(g.p)} ${s.g}` : '', tone: C.protein },
      { label: s.logged, value: `${r.full_days} / ${r.period_days}`, hint: s.partial(r.partial_days, r.period_days - r.logged_days) },
      { label: s.waterAvg, value: litres(r.water.avg_ml), hint: s.waterHint(r.water.days, litres(r.water.goal_ml)), tone: C.water },
      { label: `${s.fiber} / ${s.sugar} / ${s.salt}`, value: `${nf(r.extras.fiber.g)} / ${nf(r.extras.sugar.g)} / ${nf(r.extras.salt.g, 1)} ${s.g}`, hint: s.known(Math.round(Math.min(r.extras.fiber.coverage, r.extras.sugar.coverage, r.extras.salt.coverage) * 100)) },
      { label: s.estimate, value: `${r.estimate_pct}%`, hint: s.estimateHint, tone: r.estimate_pct > 40 ? C.over : undefined },
    ]
    const cols = 4
    const gap = 8
    const tw = (W - gap * (cols - 1)) / cols
    const th = 58
    tiles.forEach((t, i) => {
      const x = M + (i % cols) * (tw + gap)
      const ty = y + Math.floor(i / cols) * (th + gap)
      doc.roundedRect(x, ty, tw, th, 6).fillColor(C.paper).fill()
      doc.roundedRect(x, ty, tw, th, 6).lineWidth(0.5).strokeColor(C.line).stroke()
      text(t.label, x + 9, ty + 8, { size: 7.5, color: C.ink2, width: tw - 18 })
      text(t.value, x + 9, ty + 22, { font: 'B', size: 13, color: t.tone ?? C.ink, width: tw - 18 })
      text(t.hint, x + 9, ty + 41, { size: 7, color: C.ink3, width: tw - 18 })
    })
    y += 2 * th + gap + 18

    // ---------- bar charts ----------
    const barChart = (title: string, vals: { date: string, v: number, logged: boolean, partial: boolean }[], goalV: number | null, color: string, colorSoft: string, overIsBad: boolean) => {
      const ch = 120
      ensure(ch + 50)
      text(title, M, y, { font: 'M', size: 10 })
      y += 18
      const top = y
      const max = Math.max(goalV ? goalV * 1.25 : 0, ...vals.map(v => v.v), 1)
      const n = vals.length
      const step = W / n
      const bw = Math.max(1.5, Math.min(22, step * 0.7))
      // gridline + goal
      doc.moveTo(M, top + ch).lineTo(M + W, top + ch).lineWidth(0.5).strokeColor(C.line).stroke()
      vals.forEach((d, i) => {
        const x = M + i * step + (step - bw) / 2
        if (!d.logged) {
          doc.rect(x, top + ch - 2, bw, 2).fillColor(C.track).fill()
          return
        }
        const h = Math.max(1.5, d.v / max * ch)
        const over = goalV != null && overIsBad && d.v > goalV * 1.1
        const fill = d.partial ? C.partial : over ? C.over : (goalV != null && !overIsBad && d.v >= goalV * 0.9) ? color : colorSoft
        doc.roundedRect(x, top + ch - h, bw, h, Math.min(2, bw / 3)).fillColor(fill).fill()
        if (n <= 16) text(nf(d.v), x - 10, top + ch - h - 10, { size: 6.5, color: C.ink3, width: bw + 20, align: 'center' })
      })
      if (goalV) {
        const gy = top + ch - goalV / max * ch
        doc.moveTo(M, gy).lineTo(M + W, gy).dash(3, { space: 2 }).lineWidth(0.7).strokeColor(C.ink2).stroke().undash()
        const lbl = `${s.goalLine} ${nf(goalV)}`
        doc.font('R').fontSize(6.5)
        const lw = doc.widthOfString(lbl) + 6
        doc.rect(M + W - lw, gy - 9, lw, 8).fillColor('#ffffff').fill()
        text(lbl, M + W - lw + 3, gy - 8.5, { size: 6.5, color: C.ink2 })
      }
      // x labels
      const every = n <= 16 ? 1 : n <= 35 ? 3 : 7
      vals.forEach((d, i) => {
        if (i % every && i !== n - 1) return
        const lbl = n <= 10 ? dayShort(d.date) : dFmt(d.date, { day: 'numeric', month: n > 35 ? 'short' : undefined }).replace(/\./g, '')
        text(lbl, M + i * step - 15, top + ch + 4, { size: 6.5, color: C.ink3, width: step + 30, align: 'center' })
      })
      y = top + ch + 16
    }
    const series = (k: 'kcal' | 'p') => r.days.map(d => ({ date: d.date, v: d[k], logged: d.logged, partial: d.partial }))
    barChart(`${s.chartKcal}, ${s.kcal}`, series('kcal'), g.kcal, C.accent, C.accentSoft, true)
    // legend
    const legend = [[C.accentSoft, s.chartKcal], [C.over, s.overDay], [C.partial, s.partialDay]] as const
    let lx = M
    for (const [col, lbl] of legend.slice(1)) {
      doc.rect(lx, y + 1, 7, 7).fillColor(col).fill()
      text(lbl, lx + 10, y, { size: 7, color: C.ink3 })
      lx += 20 + doc.font('R').fontSize(7).widthOfString(lbl)
    }
    y += 18
    barChart(s.chartP, series('p'), g.p, C.protein, '#dcc0d0', false)
    y += 8

    // ---------- energy split + meal split ----------
    ensure(70)
    const half = (W - 20) / 2
    const stackBar = (x: number, title: string, parts: { label: string, pct: number, color: string }[]) => {
      text(title, x, y, { font: 'M', size: 10 })
      const by = y + 18
      let bx = x
      const total = parts.reduce((a, p) => a + p.pct, 0) || 1
      for (const p of parts) {
        const w = p.pct / total * half
        if (w > 0) doc.rect(bx, by, w, 12).fillColor(p.color).fill()
        bx += w
      }
      let tx = x
      for (const p of parts) {
        const lbl = `${p.label} ${p.pct}%`
        doc.rect(tx, by + 20, 7, 7).fillColor(p.color).fill()
        text(lbl, tx + 10, by + 19, { size: 7.5, color: C.ink2 })
        tx += 16 + doc.font('R').fontSize(7.5).widthOfString(lbl)
      }
    }
    if (r.energy_pct) {
      stackBar(M, s.energy, [
        { label: s.protein, pct: r.energy_pct.p, color: C.protein },
        { label: s.fat, pct: r.energy_pct.f, color: C.fat },
        { label: s.carbs, pct: r.energy_pct.c, color: C.carbs },
      ])
    }
    const mealColors: Record<ReportMeal, string> = { breakfast: '#2e6a4e', lunch: '#6f9a7f', dinner: '#a8c4b0', snack: '#c9a46a' }
    stackBar(M + half + 20, s.mealShare, REPORT_MEALS.map(m => ({ label: s[m], pct: r.meal_share[m], color: mealColors[m] })))
    y += 64

    // ---------- daily table ----------
    type Col = { h: string, w: number, align?: 'left' | 'right', get: (d: Report['days'][number]) => string }
    const table = <T>(cols: { h: string, w: number, align?: 'left' | 'right', get: (row: T) => string, color?: (row: T) => string | undefined }[], rows: T[], opts: { muted?: (row: T) => boolean, total?: string[] } = {}) => {
      const rowH = 15
      const totalW = cols.reduce((a, c) => a + c.w, 0)
      const scale = W / totalW
      const xs: number[] = []
      let acc = M
      for (const c of cols) { xs.push(acc); acc += c.w * scale }
      const head = () => {
        cols.forEach((c, i) => text(c.h, xs[i]! + 3, y, { font: 'M', size: 7.5, color: C.ink2, width: c.w * scale - 6, align: c.align ?? 'right' }))
        y += 13
        doc.moveTo(M, y - 2).lineTo(M + W, y - 2).lineWidth(0.6).strokeColor(C.ink3).stroke()
      }
      ensure(rowH * 3)
      head()
      rows.forEach((row, ri) => {
        if (y + rowH > BOTTOM) { doc.addPage(); y = M; head() }
        if (ri % 2) doc.rect(M, y - 2, W, rowH).fillColor(C.paper).fill()
        const muted = opts.muted?.(row)
        cols.forEach((c, i) => text(c.get(row), xs[i]! + 3, y + 1.5, { size: 8, color: muted ? C.ink3 : (c.color?.(row) ?? C.ink), width: c.w * scale - 6, align: c.align ?? 'right', lineBreak: false }))
        y += rowH
      })
      if (opts.total) {
        doc.moveTo(M, y - 1).lineTo(M + W, y - 1).lineWidth(0.6).strokeColor(C.ink3).stroke()
        cols.forEach((c, i) => text(opts.total![i] ?? '', xs[i]! + 3, y + 2, { font: 'B', size: 8, width: c.w * scale - 6, align: c.align ?? 'right', lineBreak: false }))
        y += rowH + 2
      }
      y += 6
    }

    doc.addPage(); y = M
    h2(s.daily)
    const dayCols: (Col & { color?: (d: Report['days'][number]) => string | undefined })[] = [
      { h: s.date, w: 70, align: 'left', get: d => dayShort(d.date) },
      { h: s.kcal, w: 44, get: d => d.logged ? nf(d.kcal) : s.notLogged, color: d => d.logged && !d.partial && d.kcal > g.kcal * 1.1 ? C.over : undefined },
      { h: `${s.p}, ${s.g}`, w: 36, get: d => d.logged ? nf(d.p) : '', color: d => g.p && d.logged && !d.partial && d.p >= g.p * 0.9 ? C.accent : undefined },
      { h: `${s.f}, ${s.g}`, w: 34, get: d => d.logged ? nf(d.f) : '' },
      { h: `${s.c}, ${s.g}`, w: 34, get: d => d.logged ? nf(d.c) : '' },
      { h: s.fiber, w: 42, get: d => d.fiber != null ? nf(d.fiber) : '' },
      { h: s.sugar, w: 36, get: d => d.sugar != null ? nf(d.sugar) : '' },
      { h: s.salt, w: 30, get: d => d.salt != null ? nf(d.salt, 1) : '' },
      { h: `${cap(s.water)}, ${s.l}`, w: 36, get: d => d.water_ml ? nf(d.water_ml / 1000, 1) : '' },
      { h: s.est, w: 36, get: d => d.logged && d.kcal ? `${Math.round(d.estimate_kcal / d.kcal * 100)}%` : '' },
    ]
    table(dayCols, r.days, {
      muted: d => !d.logged || d.partial,
      total: ['Ø', nf(r.avg.kcal), nf(r.avg.p), nf(r.avg.f), nf(r.avg.c), nf(r.extras.fiber.g), nf(r.extras.sugar.g), nf(r.extras.salt.g, 1), r.water.avg_ml != null ? nf(r.water.avg_ml / 1000, 1) : '', `${r.estimate_pct}%`],
    })

    // ---------- top foods ----------
    type Food = Report['top_kcal'][number]
    h2(s.topKcal)
    table<Food>([
      { h: s.food, w: 210, align: 'left', get: f => f.name },
      { h: s.times, w: 40, get: f => nf(f.times) },
      { h: s.g, w: 50, get: f => nf(f.grams) },
      { h: s.kcal, w: 50, get: f => nf(f.kcal) },
      { h: s.share, w: 46, get: f => `${nf(f.kcal_share, 1)}%` },
      { h: `${s.p}, ${s.g}`, w: 44, get: f => nf(f.p) },
    ], r.top_kcal)
    h2(s.topP)
    table<Food>([
      { h: s.food, w: 210, align: 'left', get: f => f.name },
      { h: s.times, w: 40, get: f => nf(f.times) },
      { h: s.g, w: 50, get: f => nf(f.grams) },
      { h: `${s.p}, ${s.g}`, w: 50, get: f => nf(f.p) },
      { h: s.pShare, w: 46, get: f => `${nf(f.p_share, 1)}%` },
      { h: s.kcal, w: 44, get: f => nf(f.kcal) },
    ], r.top_protein)

    // ---------- weight ----------
    if (r.weight) {
      h2(s.weight)
      const w = r.weight
      const bits = [
        w.start ? `${s.wStart}: ${nf(w.start.kg, 1)} ${s.kg} (${dayShort(w.start.date)})` : null,
        `${s.wEnd}: ${nf(w.end.kg, 1)} ${s.kg} (${dayShort(w.end.date)})`,
        w.change != null ? `${s.wChange}: ${w.change > 0 ? '+' : w.change < 0 ? '−' : '±'}${nf(Math.abs(w.change), 1)} ${s.kg}` : null,
        w.per_week != null ? `${s.wTrend}: ${w.per_week > 0 ? '+' : w.per_week < 0 ? '−' : '±'}${nf(Math.abs(w.per_week), 2)} ${s.perWeek}` : null,
        s.weighIns(w.weigh_ins),
      ].filter(Boolean) as string[]
      ensure(20)
      text(bits.join('   ·   '), M, y, { size: 9, color: C.ink, width: W })
      y += 22
    }

    // ---------- notes ----------
    ensure(60)
    y += 4
    text(s.notes, M, y, { font: 'M', size: 8, color: C.ink2 })
    y += 12
    for (const t of [s.note1, s.note2, ...(g.p_suggested ? [`* ${s.noteP}`] : [])]) {
      doc.font('R').fontSize(7.5)
      const h = doc.heightOfString(t, { width: W })
      ensure(h + 4)
      text(t, M, y, { size: 7.5, color: C.ink3, width: W })
      y += h + 4
    }

    // ---------- appendix: food diary ----------
    if (o.details) {
      doc.addPage(); y = M
      h2(s.diary)
      const byDate = new Map<string, ReportEntry[]>()
      for (const e of o.entries) {
        if (e.date < r.from || e.date > r.to) continue
        if (!byDate.has(e.date)) byDate.set(e.date, [])
        byDate.get(e.date)!.push(e)
      }
      for (const d of r.days.filter(d => d.logged)) {
        const rows = (byDate.get(d.date) ?? []).slice().sort((a, b) => REPORT_MEALS.indexOf(a.meal) - REPORT_MEALS.indexOf(b.meal))
        ensure(40)
        text(cap(dFmt(d.date, { weekday: 'long', day: 'numeric', month: 'long' })), M, y, { font: 'B', size: 10 })
        text(`${nf(d.kcal)} ${s.kcal}  ·  ${s.p} ${nf(d.p)}  ${s.f} ${nf(d.f)}  ${s.c} ${nf(d.c)}${d.water_ml ? `  ·  ${s.water} ${litres(d.water_ml)}` : ''}`, M, y + 1, { size: 8.5, color: d.partial ? C.ink3 : C.ink2, width: W, align: 'right' })
        y += 17
        table<ReportEntry>([
          { h: '', w: 62, align: 'left', get: e => rows[rows.indexOf(e) - 1]?.meal === e.meal ? '' : s[e.meal] },
          { h: s.food, w: 220, align: 'left', get: e => e.source === 'estimate' ? `${e.name} ≈` : e.name },
          { h: s.g, w: 40, get: e => nf(e.grams) },
          { h: s.kcal, w: 40, get: e => nf(e.kcal) },
          { h: s.p, w: 30, get: e => nf(e.p) },
          { h: s.f, w: 30, get: e => nf(e.f) },
          { h: s.c, w: 30, get: e => nf(e.c) },
        ], rows)
        y += 4
      }
    }
  }

  // ---------- footers ----------
  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i)
    const fy = A4.h - 30
    // writing below the bottom margin would make pdfkit add a page
    const bm = doc.page.margins.bottom
    doc.page.margins.bottom = 0
    text(`${s.made}  ·  ${periodLabel}`, M, fy, { size: 7, color: C.ink3 })
    text(s.page(i + 1, range.count), M, fy, { size: 7, color: C.ink3, width: W, align: 'right' })
    doc.page.margins.bottom = bm
  }
  doc.end()
  return done
}
