<script setup lang="ts">
/**
 * Water on Today: a row of "glasses" (one per 250 ml of the goal), +250 / +500 in one tap,
 * "…" opens a sheet with other volumes and the day's log (delete a mistaken tap).
 */
import type { Water } from '~/utils/types'
import { errMsg } from '~/utils/format'
import { intlTag } from '~/utils/i18n'

const props = defineProps<{ water: Water, date: string }>()
const emit = defineEmits<{ change: [w: Water] }>()
const { t, n, locale } = useT()
const toast = useToast()

const GLASS = 250
const QUICK = [250, 500]
const MORE = [100, 150, 200, 330, 750, 1000]

const liters = (ml: number) => n(ml / 1000, ml % 100 ? 2 : 1)
const glasses = computed(() => Math.max(4, Math.min(16, Math.ceil(props.water.goal_ml / GLASS))))
// fill of each glass, 0..1; the last glass also takes anything above the goal
const fills = computed(() => Array.from({ length: glasses.value }, (_, i) => Math.max(0, Math.min(1, props.water.ml / GLASS - i))))
const done = computed(() => props.water.ml >= props.water.goal_ml)
const left = computed(() => Math.max(0, props.water.goal_ml - props.water.ml))

const busy = ref(false)
async function add(ml: number) {
  if (busy.value) return
  busy.value = true
  // optimistic: the bar moves on tap, the server answer replaces it
  const before = props.water
  emit('change', { ...before, ml: before.ml + ml })
  try {
    const r = await $fetch<{ created: { id: string }, water: Water }>('/api/water', { method: 'POST', body: { ml, date: props.date } })
    emit('change', r.water)
    toast.show(t('waterAdded', { ml: n(ml) }), { action: { label: t('undo'), run: () => remove(r.created.id, true) } })
  }
  catch (e) {
    emit('change', before)
    toast.show(errMsg(e, t('somethingWrong')))
  }
  finally { busy.value = false }
}
async function remove(id: string, quiet = false) {
  try {
    const r = await $fetch<{ water: Water }>(`/api/water/${id}`, { method: 'DELETE' })
    emit('change', r.water)
    if (!quiet) toast.show(t('waterRemoved'))
  }
  catch (e) { toast.show(errMsg(e, t('somethingWrong'))) }
}

// ---------- sheet ----------
const open = ref(false)
const custom = ref('')
const customMl = computed(() => Math.round(Number(custom.value.replace(',', '.'))))
const customOk = computed(() => Number.isInteger(customMl.value) && customMl.value >= 1 && customMl.value <= 3000)
async function addCustom(ml: number) {
  await add(ml)
  custom.value = ''
}
const time = (iso: string) => new Date(iso).toLocaleTimeString(intlTag[locale.value], { hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <section class="water card" :aria-label="t('water')">
    <div class="wt">
      <Icon name="drop" :size="18" class="ic" />
      <h2>{{ t('water') }}</h2>
      <p class="amt num" :class="{ done }">
        <b>{{ liters(water.ml) }}</b><span class="of"> / {{ liters(water.goal_ml) }} {{ t('liter') }}</span>
      </p>
    </div>
    <div class="glasses" role="meter" :aria-valuemin="0" :aria-valuemax="water.goal_ml" :aria-valuenow="water.ml" :aria-label="t('water')">
      <span v-for="(f, i) in fills" :key="i" class="glass"><i :style="{ transform: `scaleY(${f})` }" /></span>
    </div>
    <div class="acts">
      <button v-for="q in QUICK" :key="q" type="button" class="chip add num" :disabled="busy" @click="add(q)">+{{ n(q) }} {{ t('ml') }}</button>
      <button type="button" class="chip more" :aria-label="t('waterMore')" @click="open = true">···</button>
      <span class="left">{{ done ? t('waterDone') : t('waterLeft', { v: liters(left) }) }}</span>
    </div>

    <BottomSheet :open="open" :label="t('water')" @close="open = false">
      <template #header>
        <div class="head">
          <h2>{{ t('water') }} <span class="num muted">{{ liters(water.ml) }} / {{ liters(water.goal_ml) }} {{ t('liter') }}</span></h2>
          <button type="button" class="icon-btn" :aria-label="t('close')" @click="open = false"><Icon name="close" /></button>
        </div>
      </template>
      <div class="sheet">
        <div class="chips">
          <button v-for="q in [...QUICK, ...MORE].sort((a, b) => a - b)" :key="q" type="button" class="chip num" :disabled="busy" @click="add(q)">+{{ n(q) }}</button>
        </div>
        <form class="custom" @submit.prevent="customOk && addCustom(customMl)">
          <input v-model="custom" class="input num" inputmode="numeric" :placeholder="t('waterCustom')" :aria-label="t('waterCustom')">
          <span class="u">{{ t('ml') }}</span>
          <button type="submit" class="btn btn-primary" :disabled="!customOk || busy">{{ t('add') }}</button>
        </form>
        <ul v-if="water.logs.length" class="logs">
          <li v-for="l in [...water.logs].reverse()" :key="l.id">
            <span class="num">{{ time(l.logged_at) }}</span>
            <b class="num">{{ n(l.ml) }} {{ t('ml') }}</b>
            <button type="button" class="icon-btn" :aria-label="t('delete')" @click="remove(l.id)"><Icon name="trash" :size="18" /></button>
          </li>
        </ul>
        <p class="hint">
          {{ water.goal_manual ? t('waterGoalManual') : t('waterGoalAutoHint') }}
          <NuxtLink to="/settings">{{ t('waterChangeGoal') }}</NuxtLink>
        </p>
      </div>
    </BottomSheet>
  </section>
</template>

<style scoped>
.water { padding: var(--s-4); display: grid; gap: var(--s-3); }
.wt { display: flex; align-items: center; gap: var(--s-2); }
.ic { color: var(--water); }
.wt h2 { flex: 1; font-size: var(--fs-lg); font-weight: var(--fw-bold); }
.amt { margin: 0; font-size: var(--fs-sm); white-space: nowrap; }
.amt b { font-size: var(--fs-lg); font-weight: var(--fw-medium); letter-spacing: -0.01em; }
.amt.done b { color: var(--water); }
.of { color: var(--ink-3); }
.glasses { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 3px; height: 18px; }
.glass { position: relative; border-radius: 3px 3px 5px 5px; background: var(--track); overflow: hidden; }
.glass i {
  position: absolute; inset: 0; background: var(--water); transform-origin: bottom;
  transition: transform var(--dur-slow) var(--ease);
}
.acts { display: flex; align-items: center; gap: var(--s-2); }
.acts .chip { min-height: 36px; min-width: 0; padding: 0 var(--s-3); font-size: var(--fs-sm); }
.add { color: var(--water-ink); border-color: color-mix(in srgb, var(--water) 45%, transparent); }
.add:active:not(:disabled) { background: var(--water-soft); }
.more { letter-spacing: .08em; color: var(--ink-2); }
.left { flex: 1; min-width: 0; text-align: right; font-size: var(--fs-xs); color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.head { display: flex; align-items: center; gap: var(--s-2); padding: 6px 0 var(--s-2); }
.head h2 { flex: 1; font-size: var(--fs-xl); font-weight: var(--fw-bold); letter-spacing: -0.015em; }
.head h2 span { font-size: var(--fs-sm); font-weight: var(--fw-regular); }
.sheet { display: grid; gap: var(--s-4); padding-bottom: var(--s-4); }
.custom { display: flex; align-items: center; gap: var(--s-2); }
.custom .input { flex: 1; min-width: 0; }
.u { color: var(--ink-3); font-size: var(--fs-sm); }
.logs { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
.logs li { display: flex; align-items: center; gap: var(--s-3); min-height: 48px; border-bottom: 1px solid var(--line); }
.logs li span { color: var(--ink-3); font-size: var(--fs-sm); width: 3.5em; }
.logs li b { flex: 1; font-weight: var(--fw-book); }
.hint { font-size: var(--fs-xs); color: var(--ink-2); }
.hint a { color: var(--accent); }
@media (max-width: 359px) { .left { display: none; } }
</style>
