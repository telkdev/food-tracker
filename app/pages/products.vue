<script setup lang="ts">
import type { Pickable, Product } from '~/utils/types'
import { errMsg, matchesWords } from '~/utils/format'

const { t, n } = useT()
const toast = useToast()
const requestFetch = useRequestFetch()
const { data, error, refresh } = await useAsyncData('my-products', () => requestFetch<{ results: Product[] }>('/api/products/mine'))

const q = ref('')
const list = computed(() => {
  const all = data.value?.results ?? []
  const s = q.value.trim().toLowerCase()
  if (!s) return all
  return all.filter(p => matchesWords(`${p.name} ${p.brand ?? ''}`, s) || (p.barcode ?? '').includes(s))
})
const anyOff = computed(() => list.value.some(p => p.source === 'off'))

const editing = ref<Product | 'new' | null>(null)

function onSaved(p: Product, created: boolean) {
  editing.value = null
  const all = data.value?.results ?? []
  const rest = all.filter(x => x.id !== p.id)
  data.value = { results: [...rest, p].sort((a, b) => a.name.localeCompare(b.name)) }
  toast.show(created ? t('saved') : t('saved'))
}

/** From the New product sheet: the name or barcode matched a product already in My products. */
function onOpenExisting(p: Product) {
  const all = data.value?.results ?? []
  if (!all.some(x => x.id === p.id)) data.value = { results: [...all, p].sort((a, b) => a.name.localeCompare(b.name)) }
  editing.value = p
}

async function onDelete(p: Product) {
  editing.value = null
  try {
    await $fetch(`/api/products/${p.id}`, { method: 'DELETE' })
    if (data.value) data.value = { results: data.value.results.filter(x => x.id !== p.id) }
    toast.show(t('productDeleted', { name: p.name }), {
      action: {
        label: t('undo'),
        run: async () => {
          await $fetch('/api/products', { method: 'POST', body: { name: p.name, brand: p.brand || undefined, barcode: p.barcode || undefined, per100: p.per100, source: p.source, note: p.note || undefined } })
          await refresh()
        },
      },
    })
  }
  catch (e) { toast.show(errMsg(e, t('somethingWrong'))) }
}

const pending = useState<Pickable | null>('pending-pick', () => null)
function onLog(p: Product) {
  editing.value = null
  pending.value = { key: `p:${p.id}`, name: p.name, brand: p.brand, barcode: p.barcode, per100: p.per100, source: p.source, product_id: p.id, origin: 'my_products' }
  navigateTo('/')
}

useHead({ title: () => `${t('productsTitle')} · ${t('appName')}` })
</script>

<template>
  <div class="products">
    <header class="top">
      <h1>{{ t('productsTitle') }}</h1>
      <button type="button" class="btn btn-primary add" @click="editing = 'new'"><Icon name="plus" :size="20" />{{ t('newProduct') }}</button>
    </header>

    <label class="sbox">
      <Icon name="search" class="sicon" />
      <span class="sr-only">{{ t('productsSearch') }}</span>
      <input v-model="q" type="search" :placeholder="t('productsSearch')" autocomplete="off" enterkeyhint="search">
    </label>

    <div v-if="error" class="card pad">
      <p>{{ t('loadFailed', { msg: error.statusMessage || error.message }) }}</p>
      <button class="btn" @click="refresh()">{{ t('retry') }}</button>
    </div>

    <template v-else-if="data">
      <p v-if="!data.results.length" class="empty muted">{{ t('noProducts') }}</p>
      <p v-else-if="!list.length" class="empty muted">{{ t('noProductsMatch', { q }) }}</p>
      <template v-else>
        <p class="count">{{ t('productCount', { n: list.length }) }}</p>
        <ul class="list card">
          <li v-for="p in list" :key="p.id">
            <button type="button" class="row" @click="editing = p">
              <span class="main">
                <span class="name">{{ p.name }}<span v-if="p.brand" class="brand"> · {{ p.brand }}</span></span>
                <span class="macros num">
                  <span><i class="dot p" />{{ t('proteinShort') }} {{ n(p.per100.p, 1) }}</span>
                  <span><i class="dot f" />{{ t('fatShort') }} {{ n(p.per100.f, 1) }}</span>
                  <span><i class="dot c" />{{ t('carbsShort') }} {{ n(p.per100.c, 1) }}</span>
                  <SourceBadge :source="p.source" />
                </span>
              </span>
              <span class="kcal num">{{ n(p.per100.kcal) }}<small>{{ t('kcal') }}/100 {{ t('g') }}</small></span>
            </button>
          </li>
        </ul>
        <p v-if="anyOff" class="attribution foot">{{ t('offAttribution') }}</p>
      </template>
    </template>

    <ProductSheet :product="editing" @close="editing = null" @saved="onSaved" @delete="onDelete" @log="onLog" @open="onOpenExisting" />
  </div>
</template>

<style scoped>
.products { display: grid; gap: var(--s-4); }
.top { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); padding-top: var(--s-2); min-height: 56px; }
.top h1 { font-size: var(--fs-2xl); font-weight: var(--fw-black); letter-spacing: -0.02em; }
.add { padding: 0 var(--s-4) 0 var(--s-3); }
.sbox { display: flex; align-items: center; gap: var(--s-2); height: 48px; padding: 0 var(--s-4); border-radius: var(--r-pill); background: var(--surface-2); border: 1.5px solid transparent; }
.sbox:focus-within { border-color: var(--accent); background: var(--surface); }
.sicon { color: var(--ink-2); flex: none; }
.sbox input { flex: 1; min-width: 0; height: 100%; border: 0; background: transparent; }
.sbox input::placeholder { color: var(--ink-3); }
.pad { padding: var(--s-4); display: grid; gap: var(--s-3); justify-items: start; }
.empty { text-align: center; padding: var(--s-8) var(--s-4); }
.count { font-size: var(--fs-xs); color: var(--ink-2); margin-bottom: calc(-1 * var(--s-2)); }
.list { list-style: none; margin: 0; padding: 0; overflow: hidden; }
.list li + li { border-top: 1px solid var(--line); }
.row { display: flex; align-items: center; gap: var(--s-3); width: 100%; min-height: 60px; padding: var(--s-2) var(--s-4); border: 0; background: transparent; text-align: left; }
.row:active { background: var(--surface-2); }
.row:focus-visible { outline-offset: -2px; }
.main { flex: 1; min-width: 0; display: grid; gap: 4px; }
.name { font-weight: var(--fw-medium); overflow-wrap: anywhere; }
.brand { color: var(--ink-2); font-weight: var(--fw-regular); }
.macros { display: flex; align-items: center; gap: var(--s-3); font-size: var(--fs-xs); color: var(--ink-2); flex-wrap: wrap; }
.macros > span:not(.badge) { display: inline-flex; align-items: center; gap: 4px; }
.dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
.dot.p { background: var(--protein); } .dot.f { background: var(--fat); } .dot.c { background: var(--carbs); }
.kcal { flex: none; display: grid; justify-items: end; font-weight: var(--fw-bold); font-size: var(--fs-lg); line-height: 1.1; }
.kcal small { font-size: var(--fs-2xs); color: var(--ink-2); font-weight: var(--fw-medium); }
.foot { text-align: center; }
</style>
