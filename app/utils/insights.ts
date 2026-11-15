// Shapes returned by GET /api/insights and GET /api/profile (see server/utils/insights.ts, profile.ts).
import type { Targets } from '~~/shared/targets'

export type InsightLevel = 'warn' | 'tip' | 'good' | 'info'
export interface InsightFood { name: string, grams: number, kcal: number, p: number, f: number }
export interface Insight { id: string, level: InsightLevel, params: Record<string, string | number>, foods?: InsightFood[] }
export interface WeighIn { date: string, kg: number }

export interface InsightsData {
  today: string
  goal: { kcal: number, p: number | null, f: number | null, c: number | null }
  goal_type: 'recomp' | 'cut' | 'bulk'
  profile_done: boolean
  weight: WeighIn | null
  weights: WeighIn[]
  targets: Targets | null
  stats: {
    from: string, to: string, window_days: number, logged_days: number, complete_days: number, partial_days: number
    avg_kcal: number | null, avg_p: number | null, avg_f: number | null, avg_c: number | null
    p_target: number | null, p_hit_days: number, kcal_ok_days: number
    days: { date: string, kcal: number, p: number, f: number, partial: boolean }[]
    meal_p: Record<'breakfast' | 'lunch' | 'dinner' | 'snack', number>
  }
  insights: Insight[]
}

export interface ProfileData {
  today: string
  profile: {
    goal_type: 'recomp' | 'cut' | 'bulk'
    sex: 'm' | 'f' | null
    birth_year: number | null
    height_cm: number | null
    activity: 'sitting' | 'light' | 'active' | 'physical' | null
    training_days: number | null
    experience: 'new' | 'returning' | 'trained' | null
    done_at: string | null
  }
  weight: WeighIn | null
  weights: WeighIn[]
  goal: { kcal: number, p: number | null, f: number | null, c: number | null }
  recommended: Targets | null
}
