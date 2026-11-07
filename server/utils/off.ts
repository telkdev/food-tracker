/**
 * Open Food Facts client. Server-side only: one place for the User-Agent, timeouts and caching.
 * Limits (2026-11): product reads 15/min/IP, search 10/min/IP. We cache and keep a local token bucket
 * so a burst of searches degrades to "My products only" instead of getting the IP blocked.
 */

export interface OffProduct {
  barcode: string
  name: string
  brand: string | null
  per100: { kcal: number, p: number, f: number, c: number } | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

function cfg() {
  const c = useRuntimeConfig()
  return {
    base: c.offBaseUrl || 'https://world.openfoodfacts.org',
    searchBase: c.offSearchUrl || 'https://search.openfoodfacts.org',
    ua: `FoodTracker/0.2 (${c.offContact || 'no-contact-set'})`,
    auth: c.offBasicAuth ? `Basic ${Buffer.from(c.offBasicAuth).toString('base64')}` : undefined,
  }
}

// --- tiny per-minute limiter (per process) ---
const windows: Record<string, number[]> = {}
function allow(bucket: 'read' | 'search', perMin: number) {
  const now = Date.now()
  const w = (windows[bucket] ||= []).filter(t => now - t < 60_000)
  windows[bucket] = w
  if (w.length >= perMin) return false
  w.push(now)
  return true
}

// --- small TTL cache ---
const cache = new Map<string, { at: number, value: unknown }>()
function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return Promise.resolve(hit.value as T)
  return fn().then((value) => {
    cache.set(key, { at: Date.now(), value })
    if (cache.size > 500) cache.delete(cache.keys().next().value!)
    return value
  })
}

async function offFetch(url: string) {
  const { ua, auth } = cfg()
  const res = await fetch(url, {
    headers: { 'User-Agent': ua, 'Accept': 'application/json', ...(auth ? { Authorization: auth } : {}) },
    signal: AbortSignal.timeout(8000),
  })
  if (res.status === 404) return null
  if (res.status === 429 || res.status === 503) throw createError({ statusCode: 503, statusMessage: 'Open Food Facts is rate-limiting us, try again in a minute' })
  if (!res.ok) throw createError({ statusCode: 502, statusMessage: `Open Food Facts error ${res.status}` })
  return res.json() as Promise<any>
}

export function mapNutriments(n: any): OffProduct['per100'] {
  if (!n) return null
  let kcal = Number(n['energy-kcal_100g'])
  if (!Number.isFinite(kcal) && Number.isFinite(Number(n.energy_100g))) kcal = Number(n.energy_100g) / 4.184 // kJ → kcal
  const p = Number(n.proteins_100g), f = Number(n.fat_100g), c = Number(n.carbohydrates_100g)
  if (![kcal, p, f, c].every(Number.isFinite)) return null
  return { kcal: round2(kcal), p: round2(p), f: round2(f), c: round2(c) }
}

const asText = (v: unknown) => (Array.isArray(v) ? v.join(', ') : typeof v === 'string' ? v : '') || null

export async function offProductByBarcode(barcode: string): Promise<OffProduct | null> {
  return cached(`bc:${barcode}`, 24 * 3600_000, async () => {
    if (!allow('read', 14)) throw createError({ statusCode: 503, statusMessage: 'Open Food Facts lookup limit reached, try again in a minute' })
    const { base } = cfg()
    const json = await offFetch(`${base}/api/v2/product/${barcode}.json?fields=code,product_name,product_name_pl,product_name_en,brands,nutriments`)
    if (!json || json.status === 0 || !json.product) return null
    const p = json.product
    return {
      barcode,
      name: p.product_name || p.product_name_pl || p.product_name_en || `Product ${barcode}`,
      brand: asText(p.brands),
      per100: mapNutriments(p.nutriments),
    }
  })
}

/**
 * Full-text search via Search-a-licious (the v2 /api/v2/search endpoint has no full-text search).
 * Only products sold in Poland.
 * Cards without per-100 g kcal are dropped, so we ask for more than we show.
 */
export async function offSearch(query: string, limit = 10): Promise<OffProduct[]> {
  const q = query.trim().toLowerCase()
  return cached(`q:${q}:${limit}`, 3600_000, async () => {
    if (!allow('search', 9)) return [] // degrade quietly: My products results still come back
    const { searchBase } = cfg()
    // strip query-language characters so user text can't change the filter
    const words = q.replace(/[^\p{L}\p{N}\s'-]/gu, ' ').split(/\s+/).map(w => w.replace(/^[-']+/, '')).filter(Boolean).slice(0, 6)
    if (!words.length) return []
    // Checked live 2026-11-07 on Search-a-licious: "word*" prefixes and "word~" fuzzy both return 0 hits,
    // and diacritics are not folded ("twarog" → 4 hits, "twaróg" → 10). So OFF gets the words as typed;
    // parts of words, typos and missing diacritics are handled by My products search.
    const lucene = `${words.join(' ')} countries_tags:"en:poland"`
    const json: any = await offFetch(`${searchBase}/search?q=${encodeURIComponent(lucene)}&langs=pl,en&page_size=${limit * 2}&fields=code,product_name,brands,nutriments`)
    return (json?.hits ?? []).map((h: any) => ({
      barcode: String(h.code ?? ''),
      name: asText(h.product_name) || `Product ${h.code}`,
      brand: asText(h.brands),
      per100: mapNutriments(h.nutriments),
    })).filter((p: OffProduct) => p.per100 && !p.name.startsWith('Product ')).slice(0, limit)
  })
}
