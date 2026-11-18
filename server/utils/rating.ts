/**
 * Rating tab: how well each user kept to their own goals. Pure functions, no DB (see ratingData.ts).
 *
 * Score 0–100 per logged day:
 * - 60% calories: full marks within -10%…+5% of the kcal goal, falling to 0 at 40% of the goal (way under)
 *   or at 140% (way over). Fewer calories is not "better": the goal is the target, whether it is a cut or a bulk.
 * - 40% protein: share of the protein goal reached, capped at 100%. Without a protein goal the target is
 *   25% of the kcal goal (kcal × 0.25 / 4 g).
 * A day without entries has no score. A week is the sum of the last 7 full days divided by 7, so a day
 * not logged counts as 0: logging every day is part of keeping to a goal.
 */

export const KCAL_WEIGHT = 0.6
export const PROTEIN_WEIGHT = 0.4

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

/** 0–100: how close the day's kcal are to the goal. */
export function kcalScore(kcal: number, goal: number): number {
  if (goal <= 0) return 0
  const r = kcal / goal
  if (r >= 0.9 && r <= 1.05) return 100
  if (r < 0.9) return Math.round(100 * clamp01(1 - (0.9 - r) / 0.5))
  return Math.round(100 * clamp01(1 - (r - 1.05) / 0.35))
}

/** 0–100: share of the protein goal reached. */
export function proteinScore(p: number, goal: number): number {
  if (goal <= 0) return 100
  return Math.round(100 * clamp01(p / goal))
}

/** Protein goal in force: the one set in Settings, else 25% of the kcal goal. */
export function proteinGoalOf(pGoal: number | null | undefined, kcalGoal: number): { g: number, auto: boolean } {
  if (pGoal && pGoal > 0) return { g: pGoal, auto: false }
  return { g: Math.round(kcalGoal * 0.25 / 4), auto: true }
}

/** Day score, or null when nothing was logged. */
export function dayScore(day: { kcal: number, p: number, entries: number } | undefined, kcalGoal: number, pGoal: number): number | null {
  if (!day || day.entries <= 0) return null
  return Math.round(KCAL_WEIGHT * kcalScore(day.kcal, kcalGoal) + PROTEIN_WEIGHT * proteinScore(day.p, pGoal))
}

/** Kcal within the full-marks band (-10%…+5%). */
export const kcalOnTarget = (kcal: number, goal: number) => goal > 0 && kcal >= goal * 0.9 && kcal <= goal * 1.05

/** Week score: unlogged days count as 0. */
export function weekScore(scores: (number | null)[]): number {
  if (!scores.length) return 0
  return Math.round(scores.reduce<number>((a, s) => a + (s ?? 0), 0) / scores.length)
}

/** The foods that gave the most kcal, names as first written; same name in any case counts as one. */
export function topFoods(rows: { name: string, kcal: number }[], limit = 3): string[] {
  const by = new Map<string, { name: string, kcal: number }>()
  for (const r of rows) {
    const key = r.name.trim().toLowerCase()
    const cur = by.get(key)
    if (cur) cur.kcal += r.kcal
    else by.set(key, { name: r.name.trim(), kcal: r.kcal })
  }
  return [...by.values()].sort((a, b) => b.kcal - a.kcal).slice(0, limit).map(f => f.name)
}

export interface Ranked { id: string, name: string, score: number | null, streak: number }

/** Best score first; no score last; ties by streak, then name. Adds a 1-based rank (equal scores share it). */
export function rank<T extends Ranked>(list: T[]): (T & { rank: number | null })[] {
  const sorted = [...list].sort((a, b) =>
    (b.score ?? -1) - (a.score ?? -1) || b.streak - a.streak || a.name.localeCompare(b.name))
  let prev: number | null = null
  let prevRank = 0
  return sorted.map((u, i) => {
    if (u.score == null) return { ...u, rank: null }
    const r = u.score === prev ? prevRank : i + 1
    prev = u.score; prevRank = r
    return { ...u, rank: r }
  })
}
