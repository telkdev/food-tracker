<script setup lang="ts">
import type { Day, Entry, Meal, Pickable, ProductSource, SearchResult } from '~/utils/types'
import { errMsg, fmtDate, parseDecimal } from '~/utils/format'

const props = defineProps<{ open: boolean, date: string, meal: Meal, initialPick?: Pickable | null }>()
const emit = defineEmits<{ close: [], added: [day: Day, created: Entry[], name: string] }>()
const { t, n, locale } = useT()
const { items: recent } = useRecent()

type Step = 'search' | 'amount' | 'manual' | 'scan'
const step = ref<Step>('search')
const meal = ref<Meal>(props.meal)
const q = ref('')
const searchEl = ref<HTMLInputElement>()

// ---------- search ----------
const mine = ref<SearchResult[]>([])
const off = ref<SearchResult[]>([])
const offState = ref<'idle' | 'loading' | 'done' | 'error'>('idle')
const offErr = ref('')
const localBusy = ref(false)
const offCache = new Map<string, { results: SearchResult[], error: string | null }>()
let localTimer: ReturnType<typeof setTimeout> | undefined
let offTimer: ReturnType<typeof setTimeout> | undefined
let seq = 0

const query = computed(() => q.value.trim())

watch(query, (s) => {
  clearTimeout(localTimer); clearTimeout(offTimer)
  const my = ++seq
  off.value = []; offState.value = 'idle'; offErr.value = ''
  if (s.length < 2) { mine.value = []; localBusy.value = false; return }
  localBusy.value = true
  // My products: fast, local, no rate limit
  localTimer = setTimeout(async () => {
    try {
      const r = await $fetch<{ results: SearchResult[] }>('/api/products', { query: { q: s, off: '0' } })
      if (my === seq) mine.value = r.results
    }
    catch { if (my === seq) mine.value = [] }
    finally { if (my === seq) localBusy.value = false }
  }, 160)
  // Open Food Facts: 10 searches/min for the whole app, so only when typing pauses
  if (s.length >= 3) offTimer = setTimeout(() => searchOnline(), 900)
})

async function searchOnline() {
  clearTimeout(offTimer)
  const s = query.value
  if (s.length < 2) return
  const my = seq
  const apply = (r: { results: SearchResult[], error: string | null }) => {
    if (my !== seq) return
    off.value = r.results.filter(x => x.origin === 'open_food_facts')
    const mineIds = new Set(mine.value.map(m => m.id))
    const extraMine = r.results.filter(x => x.origin === 'my_products' && !mineIds.has(x.id))
    if (extraMine.length) mine.value = [...mine.value, ...extraMine]
    offErr.value = r.error ?? ''
    offState.value = r.error ? 'error' : 'done'
  }
  const hit = offCache.get(s.toLowerCase())
  if (hit) return apply(hit)
  offState.value = 'loading'
  try {
    const r = await $fetch<{ results: SearchResult[], off_error: string | null }>('/api/products', { query: { q: s, off: '1' } })
    const v = { results: r.results, error: r.off_error }
    if (!v.error) offCache.set(s.toLowerCase(), v)
    apply(v)
  }
  catch (e) { apply({ results: [], error: errMsg(e) }) }
}

const recentMatches = computed(() => {
  const s = query.value.toLowerCase()
  if (s.length < 2) return recent.value
  const mineIds = new Set(mine.value.map(m => m.id))
  return recent.value.filter(r => r.name.toLowerCase().includes(s) && !(r.product_id && mineIds.has(r.product_id))).slice(0, 5)
})

const lastGramsFor = (productId: string | null | undefined) => productId ? recent.value.find(r => r.product_id === productId)?.lastGrams : undefined

function fromResult(r: SearchResult): Pickable | null {
  if (!r.per100) return null
  return r.origin === 'my_products'
    ? { key: `p:${r.id}`, name: r.name, brand: r.brand, barcode: r.barcode, per100: r.per100, source: r.source, product_id: r.id, origin: 'my_products', lastGrams: lastGramsFor(r.id) }
    : { key: `o:${r.barcode}`, name: r.name, brand: r.brand, barcode: r.barcode, per100: r.per100, source: 'off', saveAsProduct: true, origin: 'open_food_facts' }
}

const nothing = computed(() => query.value.length >= 2 && !localBusy.value && !mine.value.length && !recentMatches.value.length && offState.value !== 'loading' && !off.value.length)

// ---------- amount ----------
const picked = ref<Pickable | null>(null)
const grams = ref(100)
const gramsInput = ref<{ focus: (select?: boolean) => void }>()
const busy = ref(false)
const error = ref('')

async function pick(p: Pickable) {
  picked.value = p
  grams.value = p.lastGrams ?? 100
  error.value = ''
  step.value = 'amount'
  await nextTick()
  gramsInput.value?.focus()
}

function pickResult(r: SearchResult) {
  const p = fromResult(r)
  if (p) return pick(p)
  // OFF hit without nutrition: take the name over to manual entry
  openManual({ name: r.name, brand: r.brand ?? '', barcode: r.barcode ?? '' })
}

const chips = computed(() => {
  const base = [50, 100, 150, 200]
  const last = picked.value?.lastGrams
  return last && !base.includes(last) ? [...base.slice(0, 3), last] : base
})

async function add(p = picked.value, g = grams.value, keepOpen = false) {
  if (!p || !(g > 0) || busy.value) return
  busy.value = true; error.value = ''
  try {
    const res = await logPickable(p, g, meal.value, props.date)
    emit('added', res.day, res.created, p.name)
    if (!keepOpen) emit('close')
    return true
  }
  catch (e) { error.value = errMsg(e, t('somethingWrong')) }
  finally { busy.value = false }
}

// one-tap re-log from Recent (the sheet stays open for the next item)
const justAdded = ref<string | null>(null)
async function quickAdd(p: Pickable) {
  if (await add(p, p.lastGrams ?? 100, true)) {
    justAdded.value = p.key
    setTimeout(() => { if (justAdded.value === p.key) justAdded.value = null }, 1600)
  }
}

// ---------- manual ----------
const manual = reactive({ name: '', brand: '', barcode: '', kcal: '', p: '', f: '', c: '', source: 'label' as ProductSource, save: true })
const manualHint = ref('')
const manualTouched = ref(false)
watch(() => manual.source, (s) => { manual.save = s !== 'estimate' })

function openManual(prefill: Partial<{ name: string, brand: string, barcode: string }> = {}, hint = '') {
  Object.assign(manual, { name: query.value.length >= 2 ? q.value.trim() : '', brand: '', barcode: '', kcal: '', p: '', f: '', c: '', source: 'label', save: true }, prefill)
  manualHint.value = hint
  manualTouched.value = false
  step.value = 'manual'
  nextTick(() => document.getElementById('m-name')?.focus())
}

const manualVals = computed(() => ({ kcal: parseDecimal(manual.kcal), p: parseDecimal(manual.p || '0'), f: parseDecimal(manual.f || '0'), c: parseDecimal(manual.c || '0') }))
const manualErrors = computed(() => {
  const v = manualVals.value
  const e: Record<string, string> = {}
  if (!manual.name.trim()) e.name = t('required')
  if (!Number.isFinite(v.kcal) || v.kcal < 0 || v.kcal > 950) e.kcal = manual.kcal === '' ? t('required') : t('kcalRangeError')
  for (const k of ['p', 'f', 'c'] as const) if (!Number.isFinite(v[k]) || v[k] < 0 || v[k] > 100) e[k] = '0–100'
  if (!e.p && !e.f && !e.c && v.p + v.f + v.c > 105) e.sum = t('macroSumError')
  return e
})

function manualNext() {
  manualTouched.value = true
  if (Object.keys(manualErrors.value).length) return
  pick({
    key: `m:${Date.now()}`, name: manual.name.trim(), brand: manual.brand.trim() || null, barcode: manual.barcode.trim() || null,
    per100: manualVals.value, source: manual.source, saveAsProduct: manual.save, origin: 'manual',
  })
}

// ---------- scan ----------
const barcode = ref('')
const scanMsg = ref('')
const scanBusy = ref(false)
async function lookup(code = barcode.value) {
  const digits = code.replace(/\D/g, '')
  if (!/^\d{8,14}$/.test(digits)) { scanMsg.value = t('barcodeInvalid'); return }
  scanBusy.value = true; scanMsg.value = ''
  try {
    const r = await $fetch<any>(`/api/products/barcode/${digits}`)
    if (r.found) {
      const p = r.product
      await pick({ key: `p:${p.id}`, name: p.name, brand: p.brand, barcode: p.barcode, per100: p.per100, source: p.source, product_id: p.id, origin: r.origin, lastGrams: lastGramsFor(p.id) })
    }
    else {
      openManual({ name: r.name ?? '', brand: r.brand ?? '', barcode: digits }, t('barcodeNotFound'))
    }
  }
  catch (e) { scanMsg.value = errMsg(e, t('somethingWrong')) }
  finally { scanBusy.value = false }
}
function openScan() {
  barcode.value = ''; scanMsg.value = ''
  step.value = 'scan'
}

// ---------- lifecycle ----------
function back() {
  if (step.value === 'amount' && picked.value?.origin === 'manual') { step.value = 'manual'; return }
  step.value = 'search'
  nextTick(() => searchEl.value?.focus({ preventScroll: true }))
}

watch(() => props.open, (o) => {
  if (!o) return
  meal.value = props.meal
  q.value = ''
  error.value = ''
  justAdded.value = null
  picked.value = null
  step.value = 'search'
  if (props.initialPick) pick(props.initialPick)
})

const dayLabel = computed(() => fmtDate(locale.value, props.date, { day: 'numeric', month: 'short' }))
const title = computed(() => step.value === 'manual' ? t('manualTitle') : step.value === 'scan' ? t('scanTitle') : t('addFood'))
const showsOff = computed(() => off.value.length > 0 || picked.value?.origin === 'open_food_facts' || (step.value === 'amount' && picked.value?.source === 'off'))
const kcalPreview = computed(() => picked.value ? Math.round(picked.value.per100.kcal * (grams.value || 0) / 100) : 0)
</script>

<template>
  <BottomSheet :open="open" :label="title" tall @close="emit('close')">
    <template #header>
      <div v-if="step === 'search'" class="search">
        <label class="sbox">
          <Icon name="search" class="sicon" />
          <span class="sr-only">{{ t('searchPlaceholder') }}</span>
          <input
            ref="searchEl" v-model="q" type="search" autofocus enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false"
            :placeholder="t('searchPlaceholder')" @keydown.enter.prevent="searchOnline()"
          >
          <button v-if="q" type="button" class="clear" :aria-label="t('close')" @click="q = ''; searchEl?.focus()"><Icon name="close" :size="18" /></button>
        </label>
        <div class="actions">
          <button type="button" class="act" @click="openScan"><Icon name="barcode" :size="20" />{{ t('scanBarcode') }}</button>
          <button type="button" class="act" @click="openManual()"><Icon name="pencil" :size="20" />{{ t('enterManually') }}</button>
        </div>
        <div class="ctx">
          <span>{{ t(meal) }} · {{ dayLabel }}</span>
        </div>
      </div>
      <div v-else class="stephead">
        <button type="button" class="icon-btn" :aria-label="t('back')" @click="back"><Icon name="back" /></button>
        <h2>{{ step === 'amount' ? picked?.name : title }}</h2>
        <button type="button" class="icon-btn" :aria-label="t('close')" @click="emit('close')"><Icon name="close" /></button>
      </div>
    </template>

    <!-- SEARCH -->
    <div v-if="step === 'search'" class="results">
      <section v-if="recentMatches.length">
        <h3 class="section-title">{{ t('recent') }}</h3>
        <ul class="list">
          <li v-for="r in recentMatches" :key="r.key" class="hit">
            <button type="button" class="hit-main" @click="pick(r)">
              <span class="hn">{{ r.name }}</span>
              <span class="hm num">{{ n(r.per100.kcal) }} {{ t('kcal') }} · {{ t('per100') }} <SourceBadge :source="r.source" /></span>
            </button>
            <button type="button" class="quick" :class="{ ok: justAdded === r.key }" :disabled="busy" :aria-label="t('quickAdd', { g: n(r.lastGrams ?? 100) })" @click="quickAdd(r)">
              <Icon :name="justAdded === r.key ? 'check' : 'plus'" :size="18" />
              <span class="num">{{ n(r.lastGrams ?? 100) }} {{ t('g') }}</span>
            </button>
          </li>
        </ul>
      </section>

      <section v-if="mine.length">
        <h3 class="section-title">{{ t('myProducts') }}</h3>
        <ul class="list">
          <li v-for="r in mine" :key="r.id ?? r.name" class="hit">
            <button type="button" class="hit-main" @click="pickResult(r)">
              <span class="hn">{{ r.name }}<span v-if="r.brand" class="brand"> · {{ r.brand }}</span></span>
              <span class="hm num"><template v-if="r.per100">{{ n(r.per100.kcal) }} {{ t('kcal') }} · {{ t('proteinShort') }} {{ n(r.per100.p, 1) }} · {{ t('fatShort') }} {{ n(r.per100.f, 1) }} · {{ t('carbsShort') }} {{ n(r.per100.c, 1) }}</template> <SourceBadge :source="r.source" /></span>
            </button>
          </li>
        </ul>
      </section>

      <section v-if="query.length >= 2" class="offsec">
        <h3 class="section-title off-title"><Icon name="globe" :size="14" />{{ t('openFoodFacts') }}</h3>
        <ul v-if="off.length" class="list">
          <li v-for="r in off" :key="r.barcode ?? r.name" class="hit">
            <button type="button" class="hit-main" @click="pickResult(r)">
              <span class="hn">{{ r.name }}<span v-if="r.brand" class="brand"> · {{ r.brand }}</span></span>
              <span class="hm num">
                <template v-if="r.per100">{{ n(r.per100.kcal) }} {{ t('kcal') }} · {{ t('proteinShort') }} {{ n(r.per100.p, 1) }} · {{ t('fatShort') }} {{ n(r.per100.f, 1) }} · {{ t('carbsShort') }} {{ n(r.per100.c, 1) }}</template>
                <i v-else>{{ t('noNutrition') }}</i>
                <SourceBadge source="off" />
              </span>
            </button>
          </li>
        </ul>
        <p v-if="offState === 'loading'" class="state"><span class="spinner" />{{ t('searchingOnline') }}</p>
        <p v-else-if="offState === 'error'" class="state err">{{ t('offError', { msg: offErr }) }}</p>
        <button v-if="offState === 'idle' || offState === 'error'" type="button" class="btn online" @click="searchOnline()"><Icon name="globe" :size="18" />{{ t('searchOnline') }}</button>
        <p v-if="off.length" class="attribution">{{ t('offAttribution') }}</p>
      </section>

      <div v-if="nothing" class="empty">
        <p>{{ t('noResults', { q: query }) }}</p>
        <button type="button" class="btn" @click="openManual()"><Icon name="pencil" :size="18" />{{ t('enterManually') }}</button>
      </div>
      <p v-if="error" class="state err">{{ error }}</p>
    </div>

    <!-- AMOUNT -->
    <form v-else-if="step === 'amount' && picked" class="amount" @submit.prevent="add()">
      <div class="pmeta">
        <span v-if="picked.brand" class="muted">{{ picked.brand }}</span>
        <SourceBadge :source="picked.source" />
        <span class="muted num">{{ n(picked.per100.kcal) }} {{ t('kcal') }} {{ t('per100') }}</span>
        <span v-if="picked.lastGrams" class="muted">· {{ t('lastTime', { g: n(picked.lastGrams) }) }}</span>
      </div>
      <GramsInput ref="gramsInput" v-model="grams" :chips="chips" @submit="add()" />
      <NutritionPreview :per100="picked.per100" :grams="grams" :source="picked.source" />
      <div class="field">
        <span>{{ t('meal') }}</span>
        <MealPicker v-model="meal" />
      </div>
      <p v-if="error" class="state err">{{ error }}</p>
      <p v-if="showsOff" class="attribution">{{ t('offAttribution') }}</p>
    </form>

    <!-- MANUAL -->
    <form v-else-if="step === 'manual'" class="manual" novalidate @submit.prevent="manualNext">
      <p v-if="manualHint" class="hintbox">{{ manualHint }}</p>
      <label class="field">
        <span>{{ t('name') }}</span>
        <input id="m-name" v-model="manual.name" class="input" :placeholder="t('namePlaceholder')" autocomplete="off" enterkeyhint="next" :aria-invalid="manualTouched && !!manualErrors.name">
        <small v-if="manualTouched && manualErrors.name" class="ferr">{{ manualErrors.name }}</small>
      </label>
      <div class="grid2">
        <label class="field"><span>{{ t('brand') }}</span><input v-model="manual.brand" class="input" autocomplete="off"></label>
        <label class="field"><span>{{ t('barcode') }}</span><input v-model="manual.barcode" class="input num" inputmode="numeric" autocomplete="off"></label>
      </div>
      <fieldset class="per100">
        <legend class="label">{{ t('per100Title') }}</legend>
        <div class="grid4">
          <label class="field"><span>{{ t('kcal') }}</span><input v-model="manual.kcal" class="input num" inputmode="decimal" placeholder="0" :aria-invalid="manualTouched && !!manualErrors.kcal"></label>
          <label class="field"><span><i class="dot p" />{{ t('protein') }}</span><input v-model="manual.p" class="input num" inputmode="decimal" placeholder="0" :aria-invalid="manualTouched && !!manualErrors.p"></label>
          <label class="field"><span><i class="dot f" />{{ t('fat') }}</span><input v-model="manual.f" class="input num" inputmode="decimal" placeholder="0" :aria-invalid="manualTouched && !!manualErrors.f"></label>
          <label class="field"><span><i class="dot c" />{{ t('carbs') }}</span><input v-model="manual.c" class="input num" inputmode="decimal" placeholder="0" :aria-invalid="manualTouched && !!manualErrors.c"></label>
        </div>
        <small v-if="manualTouched && (manualErrors.kcal || manualErrors.sum || manualErrors.p || manualErrors.f || manualErrors.c)" class="ferr">{{ manualErrors.kcal || manualErrors.sum || `${t('protein')}/${t('fat')}/${t('carbs')}: 0–100` }}</small>
      </fieldset>
      <div class="field">
        <span>{{ t('source') }}</span>
        <div class="seg" role="group" :aria-label="t('source')">
          <button v-for="s in (['label', 'generic', 'estimate'] as const)" :key="s" type="button" :aria-pressed="manual.source === s" @click="manual.source = s">{{ t(`srcPick_${s}`) }}</button>
        </div>
      </div>
      <label class="toggle">
        <input v-model="manual.save" type="checkbox">
        <span class="sw" aria-hidden="true" />
        <span>{{ t('saveToProducts') }}</span>
      </label>
      <button type="submit" class="sr-only" tabindex="-1">{{ t('next') }}</button>
    </form>

    <!-- SCAN -->
    <div v-else-if="step === 'scan'" class="scan">
      <LazyBarcodeScanner @detected="(c: string) => { barcode = c; lookup(c) }" />
      <form class="bc" @submit.prevent="lookup()">
        <label class="field">
          <span>{{ t('typeBarcode') }}</span>
          <div class="bcrow">
            <input v-model="barcode" class="input num" inputmode="numeric" autocomplete="off" enterkeyhint="search" placeholder="5900820000011">
            <button type="submit" class="btn btn-primary" :disabled="scanBusy">{{ scanBusy ? t('lookingUp') : t('lookup') }}</button>
          </div>
        </label>
        <p v-if="scanMsg" class="state err">{{ scanMsg }}</p>
      </form>
    </div>

    <template v-if="step === 'amount' || step === 'manual'" #footer>
      <button v-if="step === 'amount'" type="button" class="btn btn-primary btn-block btn-lg" :disabled="busy || !(grams > 0)" @click="add()">
        <Icon name="plus" />{{ t('addKcal', { kcal: (picked?.source === 'estimate' ? '≈' : '') + n(kcalPreview) }) }}
      </button>
      <button v-else type="button" class="btn btn-primary btn-block btn-lg" @click="manualNext">{{ t('next') }}</button>
    </template>
  </BottomSheet>
</template>

<style scoped>
.search { display: grid; gap: var(--s-3); padding-bottom: var(--s-2); }
.sbox {
  display: flex; align-items: center; gap: var(--s-2); height: 52px; padding: 0 var(--s-2) 0 var(--s-4);
  border-radius: var(--r-pill); background: var(--surface-2); border: 1.5px solid transparent;
}
.sbox:focus-within { border-color: var(--accent); background: var(--surface); }
.sicon { color: var(--ink-2); flex: none; }
.sbox input { flex: 1; min-width: 0; height: 100%; border: 0; background: transparent; font-size: var(--fs-lg); }
.sbox input::-webkit-search-cancel-button { display: none; }
.sbox input::placeholder { color: var(--ink-3); }
.clear { width: 40px; height: 40px; border: 0; border-radius: 50%; background: transparent; color: var(--ink-2); display: grid; place-items: center; }
.actions { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-2); }
.act {
  display: flex; align-items: center; justify-content: center; gap: var(--s-2); min-height: var(--tap); padding: 0 var(--s-3);
  border: 1.5px solid var(--line); border-radius: var(--r-md); background: var(--surface); color: var(--ink); font-size: var(--fs-sm); font-weight: var(--fw-medium);
}
.act:active { background: var(--surface-2); }
.ctx { font-size: var(--fs-xs); color: var(--ink-2); text-align: center; }

.stephead { display: grid; grid-template-columns: var(--tap) 1fr var(--tap); align-items: center; gap: var(--s-2); padding-bottom: var(--s-2); }
.stephead h2 { font-size: var(--fs-lg); text-align: center; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }

.results { display: grid; gap: var(--s-5); }
.results section { display: grid; gap: var(--s-2); }
.list { list-style: none; margin: 0; padding: 0; display: grid; }
.hit { display: flex; align-items: center; gap: var(--s-2); border-bottom: 1px solid var(--line); }
.hit:last-child { border-bottom: 0; }
.hit-main { flex: 1; min-width: 0; display: grid; gap: 3px; min-height: 56px; padding: var(--s-2) var(--s-1); border: 0; background: transparent; text-align: left; border-radius: var(--r-sm); }
.hit-main:active { background: var(--surface-2); }
.hn { font-weight: var(--fw-medium); overflow-wrap: anywhere; }
.brand { color: var(--ink-2); font-weight: var(--fw-regular); }
.hm { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 6px; font-size: var(--fs-xs); color: var(--ink-2); }
.quick {
  flex: none; display: inline-flex; align-items: center; gap: 4px; min-height: 40px; min-width: 76px; padding: 0 var(--s-3);
  border: 0; border-radius: var(--r-pill); background: var(--accent-soft); color: var(--accent-soft-ink); font-size: var(--fs-sm); font-weight: var(--fw-bold);
  position: relative;
}
.quick::after { content: ''; position: absolute; inset: -4px 0; } /* 48px hit area */
.quick.ok { background: var(--accent); color: var(--accent-ink); }
.off-title { display: flex; align-items: center; gap: 6px; color: var(--off); }
.online { justify-self: start; background: var(--off-soft); color: var(--off); }
.state { display: flex; align-items: center; gap: var(--s-2); font-size: var(--fs-sm); color: var(--ink-2); }
.state.err { color: var(--danger); }
.spinner { width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--line-strong); border-top-color: var(--off); animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.empty { display: grid; justify-items: center; gap: var(--s-3); padding: var(--s-6) 0; color: var(--ink-2); text-align: center; }

.amount, .manual { display: grid; gap: var(--s-4); padding-top: var(--s-1); }
.pmeta { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 6px; font-size: var(--fs-sm); }

.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-3); }
.grid4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--s-2); }
.grid4 .input { padding: 0 var(--s-2); text-align: center; }
.grid4 .field > span { font-size: var(--fs-xs); display: flex; align-items: center; gap: 4px; white-space: nowrap; overflow: hidden; }
.per100 legend { padding: 0; }
.per100 { border: 0; padding: 0; margin: 0; display: grid; gap: var(--s-2); }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; }
.dot.p { background: var(--protein); } .dot.f { background: var(--fat); } .dot.c { background: var(--carbs); }
.input[aria-invalid='true'] { border-color: var(--danger); }
.ferr { color: var(--danger); font-size: var(--fs-xs); }
.hintbox { padding: var(--s-3); border-radius: var(--r-md); background: var(--estimate-soft); color: var(--ink); font-size: var(--fs-sm); }
.toggle { display: flex; align-items: center; gap: var(--s-3); min-height: var(--tap); cursor: pointer; }
.toggle input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.sw { position: relative; width: 46px; height: 28px; flex: none; border-radius: 14px; background: var(--surface-3); transition: background var(--dur); }
.sw::after { content: ''; position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.25); transition: transform var(--dur) var(--ease); }
.toggle input:checked + .sw { background: var(--accent); }
.toggle input:checked + .sw::after { transform: translateX(18px); }
.toggle input:focus-visible + .sw { outline: 2.5px solid var(--focus); outline-offset: 2px; }

.scan { display: grid; gap: var(--s-4); }
.bc { display: grid; gap: var(--s-2); }
.bcrow { display: flex; gap: var(--s-2); }
.bcrow .input { flex: 1; min-width: 0; }
</style>
