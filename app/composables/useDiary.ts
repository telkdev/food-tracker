import type { Day, Entry, Meal, Pickable, Product, Range, SavedMeal, Settings } from '~/utils/types'
import { addDays } from '~/utils/format'

/** Settings incl. the server's idea of "today" in Europe/Warsaw. */
export function useSettings() {
  const settings = useState<Settings | null>('settings', () => null)
  async function load() {
    settings.value = await $fetch<Settings>('/api/settings')
    return settings.value
  }
  return { settings, load }
}

/** Recent distinct foods, newest first, derived from the last few logged days. */
export function useRecent() {
  const items = useState<Pickable[]>('recent', () => [])
  const stamp = useState<number>('recent-at', () => 0)
  const loading = useState<boolean>('recent-loading', () => false)

  async function load(today: string, force = false) {
    if (!force && Date.now() - stamp.value < 5 * 60_000 && items.value.length) return
    if (loading.value) return
    loading.value = true
    try {
      const range = await $fetch<Range>('/api/range', { query: { from: addDays(today, -27), to: today } })
      const dates = range.days.map(d => d.date).sort().reverse().slice(0, 5)
      const days = await Promise.all(dates.map(date => $fetch<Day>('/api/day', { query: { date } })))
      const all: Entry[] = days.flatMap(d => Object.values(d.meals).flatMap(m => m.entries))
      all.sort((a, b) => b.logged_at.localeCompare(a.logged_at))
      const seen = new Set<string>()
      const out: Pickable[] = []
      for (const e of all) {
        const key = e.product_id ?? `${e.name.trim().toLowerCase()}|${e.per100.kcal}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ key: `r:${key}`, name: e.name, per100: e.per100, source: e.source, product_id: e.product_id, lastGrams: e.grams, origin: 'recent' })
        if (out.length >= 15) break
      }
      items.value = out
      stamp.value = Date.now()
    }
    catch { /* recent is a convenience; search still works */ }
    finally { loading.value = false }
  }
  function invalidate() { stamp.value = 0 }
  return { items, load, invalidate, loading }
}

/** Logs one item. Products from OFF / manual entry are saved first so the next search is local. */
export async function logPickable(p: Pickable, grams: number, meal: Meal, date: string) {
  let productId = p.product_id ?? undefined
  if (!productId && p.saveAsProduct && p.source !== 'lifesum') {
    try {
      const saved = await $fetch<Product>('/api/products', {
        method: 'POST',
        body: { name: p.name, brand: p.brand || undefined, barcode: p.barcode || undefined, per100: p.per100, source: p.source },
      })
      productId = saved.id
    }
    catch { /* still log the entry with its own values */ }
  }
  const item = productId
    ? { name: p.name, grams, product_id: productId }
    : { name: p.name, grams, per100: p.per100, source: p.source }
  return $fetch<{ created: Entry[], day: Day }>('/api/entries', { method: 'POST', body: { date, meal, items: [item] } })
}

/** Re-create a deleted entry (undo). Falls back to the snapshot if its product was removed. */
export async function restoreEntry(e: Entry) {
  const base = { name: e.name, grams: e.grams, note: e.note ?? undefined }
  const body = (item: Record<string, unknown>) => ({ date: e.date, meal: e.meal, items: [{ ...base, ...item }] })
  try {
    if (e.product_id) return await $fetch<{ created: Entry[], day: Day }>('/api/entries', { method: 'POST', body: body({ product_id: e.product_id }) })
  }
  catch { /* fall through */ }
  return $fetch<{ created: Entry[], day: Day }>('/api/entries', { method: 'POST', body: body({ per100: e.per100, source: e.source }) })
}

/** "My usual" meals, cached for the session; refresh after saving or deleting one. */
export function useSavedMeals() {
  const items = useState<SavedMeal[]>('saved-meals', () => [])
  const loaded = useState<boolean>('saved-meals-loaded', () => false)
  async function load(force = false) {
    if (loaded.value && !force) return items.value
    try {
      items.value = await $fetch<SavedMeal[]>('/api/meals')
      loaded.value = true
    }
    catch { /* convenience only */ }
    return items.value
  }
  async function log(id: string, meal: Meal, date: string) {
    return $fetch<{ created: Entry[], day: Day }>(`/api/meals/${id}/log`, { method: 'POST', body: { meal, date } })
  }
  async function saveFromDiary(name: string, date: string, meal: Meal) {
    const m = await $fetch<SavedMeal>('/api/meals', { method: 'POST', body: { name, from: { date, meal } } })
    await load(true)
    return m
  }
  async function remove(id: string) {
    await $fetch(`/api/meals/${id}`, { method: 'DELETE' })
    await load(true)
  }
  return { items, load, log, saveFromDiary, remove }
}
