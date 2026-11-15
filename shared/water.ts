/**
 * Suggested daily drinking goal. Pure, used by the server (day, MCP) and Settings.
 *
 * Evidence is thin and there is no exact "norm". What we lean on:
 * - EFSA adequate intake of total water (drinks + food): men 2.5 L, women 2.0 L a day; about 20% comes from
 *   food, so drinks ≈ 2.0 L / 1.6 L.
 * - The popular 30–35 ml/kg rule gives total water; we take 30 ml/kg × 0.8 for the drinks part, on the same
 *   capped reference weight as protein (BMI 27), so a heavy person isn't told to drink 4 L.
 * - More on active days and in the heat: roughly +0.5 L per hour of training. We have no training log, only
 *   sessions a week, so the goal adds their daily average. Thirst and pale-yellow urine are the real check.
 * Tea, coffee and other non-caloric drinks count (caffeine's diuretic effect is small for regular drinkers).
 */
import type { Activity, Sex } from './targets'

export interface WaterProfile { sex: Sex | null, heightCm: number | null, activity: Activity | null, trainingDays: number | null }

/** ml per day on top of the base, by daily activity */
export const WATER_ACTIVITY_ML: Record<Activity, number> = { sitting: 0, light: 150, active: 300, physical: 500 }
/** one training session ≈ +500 ml that day */
export const WATER_PER_SESSION_ML = 500
export const WATER_MIN_ML = 1500
export const WATER_MAX_ML = 4000

const round100 = (n: number) => Math.round(n / 100) * 100

export interface WaterGoal {
  ml: number
  /** what the base came from: body weight, sex only (EFSA), or nothing known */
  basis: 'weight' | 'sex' | 'default'
  /** extra to drink on a training day, already averaged into ml over the week */
  training_day_extra_ml: number
}

export function recommendWater(p: WaterProfile, weightKg: number | null): WaterGoal {
  let base: number
  let basis: WaterGoal['basis']
  if (weightKg && weightKg >= 30) {
    const h = p.heightCm
    const refKg = h && weightKg / (h / 100) ** 2 > 27 ? 27 * (h / 100) ** 2 : weightKg
    base = refKg * 30 * 0.8
    basis = 'weight'
  }
  else if (p.sex) { base = p.sex === 'm' ? 2000 : 1600; basis = 'sex' }
  else { base = 1800; basis = 'default' }
  const activity = p.activity ? WATER_ACTIVITY_ML[p.activity] : 0
  const training = WATER_PER_SESSION_ML * Math.min(7, Math.max(0, p.trainingDays ?? 0)) / 7
  const ml = Math.min(WATER_MAX_ML, Math.max(WATER_MIN_ML, round100(base + activity + training)))
  return { ml, basis, training_day_extra_ml: WATER_PER_SESSION_ML }
}
