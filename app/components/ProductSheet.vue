<script setup lang="ts">
import type { Product, ProductSource, SearchResult } from '~/utils/types'
import { errMsg, parseDecimal } from '~/utils/format'

/** Create (product = 'new') or edit a saved product. */
const props = defineProps<{ product: Product | 'new' | null }>()
const emit = defineEmits<{ close: [], saved: [Product, boolean], delete: [Product], log: [Product], open: [Product] }>()
const { t, n } = useT()

const f = reactive({ name: '', brand: '', barcode: '', kcal: '', p: '', f: '', c: '', source: 'label' as ProductSource })
const touched = ref(false)
const busy = ref(false)
const error = ref('')
const isNew = computed(() => props.product === 'new')


// ---------- suggestions while typing the name (new products only) ----------
// My products answer instantly; Open Food Facts allows ~10 searches/min, so it waits for a pause and is cached.
const mine = ref<SearchResult[]>([])
const off = ref<SearchResult[]>([])
const offLoading = ref(false)
const showSuggest = ref(false)
const filledNote = ref('')
const scanning = ref(false)
const offCache = new Map<string, SearchResult[]>()
let skipNext = false
let tLocal: ReturnType<typeof setTimeout> | undefined
let tOff: ReturnType<typeof setTimeout> | undefined
let seq = 0

function resetSuggest() {
  clearTimeout(tLocal); clearTimeout(tOff); seq++
  mine.value = []; off.value = []; offLoading.value = false; showSuggest.value = false; filledNote.value = ''; scanning.value = false
}

watch(() => f.name, (raw) => {
  if (!isNew.value) return
  if (skipNext) { skipNext = false; return }
  clearTimeout(tLocal); clearTimeout(tOff)
  const s = raw.trim(); const my = ++seq
  filledNote.value = ''
  if (s.length < 2) { mine.value = []; off.value = []; offLoading.value = false; return }
  showSuggest.value = true
  tLocal = setTimeout(async () => {
    try {
      const r = await $fetch<{ results: SearchResult[] }>('/api/products', { query: { q: s, off: '0' } })
      if (my === seq) mine.value = r.results.slice(0, 3)
    }
    catch { if (my === seq) mine.value = [] }
  }, 150)
  if (s.length < 3) { off.value = []; return }
  const hit = offCache.get(s.toLowerCase())
  if (hit) { off.value = hit; return }
  off.value = []
  tOff = setTimeout(async () => {
    offLoading.value = true
    try {
      const r = await $fetch<{ results: SearchResult[], off_error: string | null }>('/api/products', { query: { q: s, off: '1' } })
      const list = r.results.filter(x => x.origin === 'open_food_facts').slice(0, 6)
      if (!r.off_error) offCache.set(s.toLowerCase(), list)
      if (my === seq) off.value = list
    }
    catch { if (my === seq) off.value = [] }
    finally { if (my === seq) offLoading.value = false }
  }, 600)
})

const suggestOpen = computed(() => isNew.value && showSuggest.value && f.name.trim().length >= 2)

function asProduct(r: SearchResult): Product {
  return { id: r.id!, name: r.name, brand: r.brand, barcode: r.barcode, per100: r.per100!, source: r.source }
}

function pickSuggestion(r: SearchResult) {
  resetSuggest()
  if (r.origin === 'my_products' && r.id && r.per100) { emit('open', asProduct(r)); return }
  skipNext = true
  f.name = r.name
  f.brand = r.brand ?? f.brand
  f.barcode = r.barcode ?? f.barcode
  if (r.per100) {
    Object.assign(f, { kcal: String(r.per100.kcal), p: String(r.per100.p), f: String(r.per100.f), c: String(r.per100.c), source: 'off' })
    filledNote.value = t('suggestFilled')
  }
  else filledNote.value = t('suggestFilledPartial')
}

function closeSuggest() { showSuggest.value = false }

async function onScanned(code: string) {
  scanning.value = false
  f.barcode = code
  try {
    const r = await $fetch<any>(`/api/products/barcode/${code}`)
    // found = already mine, or fetched from OFF and saved to My products by the server
    if (r.found) { emit('open', r.product); return }
    skipNext = true
    if (r.name && !f.name) f.name = r.name
    if (r.brand && !f.brand) f.brand = r.brand
    filledNote.value = t('barcodeNotFound')
  }
  catch (e) { error.value = errMsg(e, t('somethingWrong')) }
}

watch(() => props.product, (p) => {
  touched.value = false; error.value = ''; resetSuggest()
  if (!p) return
  if (p === 'new') Object.assign(f, { name: '', brand: '', barcode: '', kcal: '', p: '', f: '', c: '', source: 'label' })
  else Object.assign(f, { name: p.name, brand: p.brand ?? '', barcode: p.barcode ?? '', kcal: String(p.per100.kcal), p: String(p.per100.p), f: String(p.per100.f), c: String(p.per100.c), source: p.source })
}, { immediate: true })

const vals = computed(() => ({ kcal: parseDecimal(f.kcal), p: parseDecimal(f.p || '0'), f: parseDecimal(f.f || '0'), c: parseDecimal(f.c || '0') }))
const errors = computed(() => {
  const v = vals.value
  const e: Record<string, string> = {}
  if (!f.name.trim()) e.name = t('required')
  if (!Number.isFinite(v.kcal) || v.kcal < 0 || v.kcal > 950) e.kcal = f.kcal === '' ? t('required') : t('kcalRangeError')
  for (const k of ['p', 'f', 'c'] as const) if (!Number.isFinite(v[k]) || v[k] < 0 || v[k] > 100) e[k] = '0–100'
  if (!e.p && !e.f && !e.c && v.p + v.f + v.c > 105) e.sum = t('macroSumError')
  const bc = f.barcode.replace(/\s/g, '')
  if (bc && !/^\d{8,14}$/.test(bc)) e.barcode = t('barcodeInvalid')
  return e
})

async function save() {
  touched.value = true
  if (Object.keys(errors.value).length || busy.value) return
  busy.value = true; error.value = ''
  const body = { name: f.name.trim(), brand: f.brand.trim() || undefined, barcode: f.barcode.replace(/\s/g, '') || undefined, per100: vals.value, source: f.source }
  try {
    const p = props.product
    const saved = p === 'new' || !p
      ? await $fetch<Product>('/api/products', { method: 'POST', body })
      : await $fetch<Product>(`/api/products/${p.id}`, { method: 'PATCH', body })
    emit('saved', saved, isNew.value)
  }
  catch (e) { error.value = errMsg(e, t('somethingWrong')) }
  finally { busy.value = false }
}
const sources: ProductSource[] = ['label', 'off', 'generic', 'estimate']
</script>

<template>
  <BottomSheet :open="!!product" :label="isNew ? t('newProduct') : t('editProduct')" @close="emit('close')">
    <template #header>
      <div class="head">
        <h2>{{ isNew ? t('newProduct') : t('editProduct') }}</h2>
        <button type="button" class="icon-btn" :aria-label="t('close')" @click="emit('close')"><Icon name="close" /></button>
      </div>
    </template>
    <form class="form" novalidate @submit.prevent="save">
      <div class="field namefield">
        <label for="pname">{{ t('name') }}</label>
        <input
          id="pname" v-model="f.name" class="input" :placeholder="t('namePlaceholder')" autocomplete="off" autocapitalize="sentences"
          :autofocus="isNew || undefined" :aria-invalid="touched && !!errors.name"
          role="combobox" :aria-expanded="suggestOpen" aria-controls="psuggest" aria-autocomplete="list"
          @focus="showSuggest = true" @blur="closeSuggest" @keydown.esc="closeSuggest"
        >
        <small v-if="touched && errors.name" class="ferr">{{ errors.name }}</small>
        <div v-if="suggestOpen" id="psuggest" class="suggest" role="listbox" @pointerdown.prevent>
          <template v-if="mine.length">
            <p class="sh">{{ t('suggestMine') }}</p>
            <button v-for="r in mine" :key="`m${r.id}`" type="button" role="option" class="opt" @click="pickSuggestion(r)">
              <span class="on"><b>{{ r.name }}</b><small v-if="r.brand">{{ r.brand }}</small></span>
              <span v-if="r.per100" class="ok num">{{ n(r.per100.kcal) }} <small>kcal</small></span>
            </button>
          </template>
          <p class="sh">{{ t('suggestOff') }}<span v-if="offLoading" class="spinner" /></p>
          <button v-for="(r, i) in off" :key="`o${r.barcode ?? i}`" type="button" role="option" class="opt" @click="pickSuggestion(r)">
            <span class="on"><b>{{ r.name }}</b><small v-if="r.brand">{{ r.brand }}</small></span>
            <span v-if="r.per100" class="ok num">{{ n(r.per100.kcal) }} <small>kcal</small></span>
            <span v-else class="ok none">{{ t('suggestNoNutrition') }}</span>
          </button>
          <button type="button" class="opt manual" @click="closeSuggest"><Icon name="pencil" :size="18" />{{ t('suggestManual') }}</button>
        </div>
        <small v-if="filledNote" class="note">{{ filledNote }}</small>
      </div>
      <div class="grid2">
        <label class="field"><span>{{ t('brand') }}</span><input v-model="f.brand" class="input" autocomplete="off"></label>
        <label class="field">
          <span>{{ t('barcode') }}</span>
          <span class="bcrow">
            <input v-model="f.barcode" class="input num" inputmode="numeric" autocomplete="off" :aria-invalid="touched && !!errors.barcode">
            <button v-if="isNew" type="button" class="icon-btn scanbtn" :aria-label="t('scanBarcode')" :aria-pressed="scanning" @click="scanning = !scanning"><Icon name="barcode" :size="20" /></button>
          </span>
        </label>
      </div>
      <small v-if="touched && errors.barcode" class="ferr">{{ errors.barcode }}</small>
      <div v-if="scanning" class="scanbox"><LazyBarcodeScanner @detected="onScanned" /></div>
      <fieldset class="per100">
        <legend class="label">{{ t('per100Title') }}</legend>
        <div class="grid4">
          <label class="field"><span>{{ t('kcal') }}</span><input v-model="f.kcal" class="input num" inputmode="decimal" placeholder="0" :aria-invalid="touched && !!errors.kcal"></label>
          <label class="field"><span><i class="dot p" />{{ t('protein') }}</span><input v-model="f.p" class="input num" inputmode="decimal" placeholder="0" :aria-invalid="touched && !!errors.p"></label>
          <label class="field"><span><i class="dot f" />{{ t('fat') }}</span><input v-model="f.f" class="input num" inputmode="decimal" placeholder="0" :aria-invalid="touched && !!errors.f"></label>
          <label class="field"><span><i class="dot c" />{{ t('carbs') }}</span><input v-model="f.c" class="input num" inputmode="decimal" placeholder="0" :aria-invalid="touched && !!errors.c"></label>
        </div>
        <small v-if="touched && (errors.kcal || errors.sum || errors.p || errors.f || errors.c)" class="ferr">{{ errors.kcal || errors.sum || `${t('protein')}/${t('fat')}/${t('carbs')}: 0–100` }}</small>
      </fieldset>
      <div class="field">
        <span>{{ t('source') }}</span>
        <div class="seg" role="group" :aria-label="t('source')">
          <button v-for="s in sources" :key="s" type="button" :aria-pressed="f.source === s" @click="f.source = s">{{ t(`srcPick_${s}`) }}</button>
        </div>
      </div>
      <p v-if="f.source === 'off'" class="attribution">{{ t('offAttribution') }}</p>
      <p v-if="error" class="ferr">{{ error }}</p>
      <button type="submit" class="sr-only" tabindex="-1">{{ t('save') }}</button>
    </form>
    <template #footer>
      <div class="foot">
        <template v-if="!isNew && product && product !== 'new'">
          <button type="button" class="icon-btn danger" :aria-label="t('delete')" @click="emit('delete', product)"><Icon name="trash" /></button>
          <button type="button" class="btn" @click="emit('log', product)"><Icon name="plus" :size="20" />{{ t('logThis') }}</button>
        </template>
        <button type="button" class="btn btn-primary grow" :disabled="busy" @click="save"><Icon name="check" />{{ t('save') }}</button>
      </div>
    </template>
  </BottomSheet>
</template>

<style scoped>
.head { display: flex; align-items: center; justify-content: space-between; padding-bottom: var(--s-2); }
.head h2 { font-size: var(--fs-xl); }
.form { display: grid; gap: var(--s-4); }
.grid2 { display: grid; grid-template-columns: 1fr; gap: var(--s-4); }
.grid4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--s-2); }
.grid4 .input { padding: 0 var(--s-2); text-align: center; }
.grid4 .field > span { font-size: var(--fs-xs); display: flex; align-items: center; gap: 4px; white-space: nowrap; overflow: hidden; }
.per100 legend { padding: 0; }
.per100 { border: 0; padding: 0; margin: 0; display: grid; gap: var(--s-2); }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; }
.dot.p { background: var(--protein); } .dot.f { background: var(--fat); } .dot.c { background: var(--carbs); }
.input[aria-invalid='true'] { border-color: var(--danger); }
.ferr { color: var(--danger); font-size: var(--fs-xs); }
.namefield > label { font-size: var(--fs-sm); color: var(--ink-2); font-weight: var(--fw-medium); }
.note { color: var(--ink-2); font-size: var(--fs-xs); }
.suggest {
  max-height: min(48dvh, 400px); overflow-y: auto; overscroll-behavior: contain;
  background: var(--surface); border: 1px solid var(--line-strong); border-radius: var(--r-lg);
  box-shadow: var(--shadow-2); padding: var(--s-1) 0;
}
.sh { display: flex; align-items: center; gap: var(--s-2); margin: 0; padding: var(--s-2) var(--s-4) var(--s-1); font-size: var(--fs-xs); color: var(--ink-2); font-weight: var(--fw-medium); }
.opt {
  display: flex; align-items: center; gap: var(--s-3); width: 100%; min-height: var(--tap); padding: var(--s-2) var(--s-4);
  border: 0; background: none; color: inherit; text-align: left; font: inherit; cursor: pointer;
}
.opt:hover, .opt:focus-visible { background: color-mix(in srgb, var(--accent) 10%, transparent); }
.on { flex: 1; min-width: 0; display: grid; }
.on b { font-weight: var(--fw-medium); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.on small, .ok small { color: var(--ink-2); font-size: var(--fs-xs); }
.ok { flex: none; font-weight: var(--fw-bold); }
.ok.none { font-weight: normal; color: var(--ink-3); font-size: var(--fs-xs); }
.manual { color: var(--accent); border-top: 1px solid var(--line); margin-top: var(--s-1); }
.bcrow { display: flex; gap: var(--s-2); }
.bcrow .input { flex: 1; min-width: 0; }
.scanbtn { flex: none; width: 48px; border: 1px solid var(--line); border-radius: var(--r-md); }
.scanbtn[aria-pressed='true'] { background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); }
.scanbox { border-radius: var(--r-lg); overflow: hidden; }

.foot { display: flex; gap: var(--s-2); align-items: center; }
.grow { flex: 1; min-height: 52px; }
.foot .btn:not(.grow) { min-height: 52px; }
.danger { color: var(--danger); width: 52px; height: 52px; border: 1px solid color-mix(in srgb, var(--danger) 35%, transparent); }
</style>
