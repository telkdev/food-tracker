<script setup lang="ts">
import type { Product, ProductSource } from '~/utils/types'
import { errMsg, parseDecimal } from '~/utils/format'

/** Create (product = 'new') or edit a saved product. */
const props = defineProps<{ product: Product | 'new' | null }>()
const emit = defineEmits<{ close: [], saved: [Product, boolean], delete: [Product], log: [Product] }>()
const { t } = useT()

const f = reactive({ name: '', brand: '', barcode: '', kcal: '', p: '', f: '', c: '', source: 'label' as ProductSource })
const touched = ref(false)
const busy = ref(false)
const error = ref('')
const isNew = computed(() => props.product === 'new')

watch(() => props.product, (p) => {
  touched.value = false; error.value = ''
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
      <label class="field">
        <span>{{ t('name') }}</span>
        <input v-model="f.name" class="input" :placeholder="t('namePlaceholder')" autocomplete="off" :autofocus="isNew || undefined" :aria-invalid="touched && !!errors.name">
        <small v-if="touched && errors.name" class="ferr">{{ errors.name }}</small>
      </label>
      <div class="grid2">
        <label class="field"><span>{{ t('brand') }}</span><input v-model="f.brand" class="input" autocomplete="off"></label>
        <label class="field">
          <span>{{ t('barcode') }}</span>
          <input v-model="f.barcode" class="input num" inputmode="numeric" autocomplete="off" :aria-invalid="touched && !!errors.barcode">
        </label>
      </div>
      <small v-if="touched && errors.barcode" class="ferr">{{ errors.barcode }}</small>
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

.foot { display: flex; gap: var(--s-2); align-items: center; }
.grow { flex: 1; min-height: 52px; }
.foot .btn:not(.grow) { min-height: 52px; }
.danger { color: var(--danger); width: 52px; height: 52px; border: 1px solid color-mix(in srgb, var(--danger) 35%, transparent); }
</style>
