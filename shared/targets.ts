/**
 * Suggested daily goals from the questionnaire. Pure, used by the server (insights) and the questionnaire UI.
 *
 * kcal: Mifflin-St Jeor BMR × activity factor (daily activity + strength sessions), then the goal type's
 * adjustment. It's an estimate (±10–15% for most people): the real check is the weight trend over 2–3 weeks.
 * Protein per kg of body weight; above BMI 27 per kg of a reference weight (BMI 27), so a heavy person
 * isn't told to eat 250 g. Fat ~25% of kcal but not under 0.7 g/kg; carbs are the rest.
 */

export type GoalType = 'recomp' | 'cut' | 'bulk'
export type Sex = 'm' | 'f'
export type Activity = 'sitting' | 'light' | 'active' | 'physical'
export type Experience = 'new' | 'returning' | 'trained'

export interface Profile {
  goalType: GoalType
  sex: Sex | null
  birthYear: number | null
  heightCm: number | null
  activity: Activity | null
  trainingDays: number | null
  experience: Experience | null
}

export const ACTIVITY_FACTOR: Record<Activity, number> = { sitting: 1.2, light: 1.35, active: 1.5, physical: 1.65 }
/** per strength session a week; 4 sessions ≈ +0.1 */
export const TRAINING_FACTOR = 0.025

/**
 * Activity factor from measured steps (phone / watch), replacing the questionnaire answer when there's
 * enough data. Linear through the questionnaire levels: ~3k steps = sitting 1.2, ~6k = light 1.35,
 * ~9k = active 1.5, ~12k = physical 1.65; capped at 1.75. An average over weeks, never one day:
 * a phone's per-day "active kcal" is too noisy to eat back.
 */
export function stepsFactor(avgSteps: number) {
  return Math.round(Math.min(1.75, Math.max(1.2, 1.2 + 0.05 * (avgSteps - 3000) / 1000)) * 1000) / 1000
}
/** Days with step data (in the last 14) needed before steps replace the questionnaire. */
export const MIN_STEP_DAYS = 7

/** kcal multiplier on maintenance and protein g/kg, by goal (and, for recomp/bulk, experience) */
export function goalAdjust(goal: GoalType, exp: Experience | null) {
  if (goal === 'cut') return { kcal: 0.8, pPerKg: 2.2 }
  if (goal === 'bulk') return { kcal: exp === 'trained' ? 1.05 : 1.1, pPerKg: 1.8 }
  // recomp: beginners and returners can recomp on a small deficit; trained people barely recomp, keep it near maintenance
  return { kcal: exp === 'trained' ? 0.97 : 0.9, pPerKg: 2.0 }
}

const round = (n: number, step: number) => Math.round(n / step) * step

export function ageOf(birthYear: number, today: string) {
  return Number(today.slice(0, 4)) - birthYear
}

export interface Targets {
  bmr: number
  maintenance: number
  kcal: number
  p: number
  f: number
  c: number
  /** body weight the protein/fat per kg are counted from */
  refKg: number
  bmi: number
  pPerKg: number
  /** where the daily activity part of the factor came from */
  activitySource: 'steps' | 'questionnaire'
  /** average daily steps used, when activitySource is 'steps' */
  avgSteps: number | null
  /** total activity factor (daily activity + training) */
  factor: number
}

/** Measured steps: average over the days that have data, and how many days that is. */
export interface StepsInput { avg: number, days: number }

/**
 * null when something needed is missing (sex, age, height, weight, and activity unless steps cover it).
 * With steps from MIN_STEP_DAYS+ days, the daily activity comes from steps instead of the questionnaire.
 */
export function recommendTargets(p: Profile, weightKg: number | null, today: string, steps?: StepsInput | null): Targets | null {
  const useSteps = !!steps && steps.days >= MIN_STEP_DAYS
  if (!p.sex || !p.birthYear || !p.heightCm || !weightKg || (!p.activity && !useSteps)) return null
  const age = ageOf(p.birthYear, today)
  const h = p.heightCm
  const bmr = 10 * weightKg + 6.25 * h - 5 * age + (p.sex === 'm' ? 5 : -161)
  const daily = useSteps ? stepsFactor(steps!.avg) : ACTIVITY_FACTOR[p.activity!]
  const factor = daily + TRAINING_FACTOR * Math.min(7, p.trainingDays ?? 0)
  const maintenance = bmr * factor
  const adj = goalAdjust(p.goalType, p.experience)
  const kcal = Math.max(p.sex === 'm' ? 1500 : 1200, round(maintenance * adj.kcal, 50))
  const bmi = weightKg / (h / 100) ** 2
  const refKg = bmi > 27 ? 27 * (h / 100) ** 2 : weightKg
  const prot = round(refKg * adj.pPerKg, 5)
  const fat = round(Math.max(0.7 * refKg, kcal * 0.25 / 9), 5)
  const carbs = Math.max(0, round((kcal - prot * 4 - fat * 9) / 4, 5))
  return {
    bmr: Math.round(bmr), maintenance: round(maintenance, 50), kcal, p: prot, f: fat, c: carbs,
    refKg: Math.round(refKg * 10) / 10, bmi: Math.round(bmi * 10) / 10, pPerKg: adj.pPerKg,
    activitySource: useSteps ? 'steps' : 'questionnaire', avgSteps: useSteps ? Math.round(steps!.avg) : null,
    factor: Math.round(factor * 1000) / 1000,
  }
}

/** Weekly weight change from a log (kg/week, by least squares over the last `days` days). null with < 2 points or < 7 days span. */
export function weightTrend(points: { date: string, kg: number }[], today: string, days = 28) {
  const since = Date.parse(`${today}T12:00:00Z`) - days * 86400_000
  const pts = points.map(p => ({ x: (Date.parse(`${p.date}T12:00:00Z`) - since) / 86400_000, y: p.kg })).filter(p => p.x >= 0)
  if (pts.length < 2) return null
  const span = Math.max(...pts.map(p => p.x)) - Math.min(...pts.map(p => p.x))
  if (span < 7) return null
  const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length
  const my = pts.reduce((a, p) => a + p.y, 0) / pts.length
  const slope = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / pts.reduce((a, p) => a + (p.x - mx) ** 2, 0)
  return { perWeek: Math.round(slope * 7 * 100) / 100, points: pts.length, spanDays: Math.round(span) }
}
