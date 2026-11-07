<script setup lang="ts">
import { parseDecimal } from '~/utils/format'
const props = withDefaults(defineProps<{ chips?: number[], autofocus?: boolean }>(), { chips: () => [50, 100, 150, 200], autofocus: false })
const grams = defineModel<number>({ required: true })
const emit = defineEmits<{ submit: [] }>()
const { t, n } = useT()

const text = ref(String(grams.value || ''))
watch(grams, (g) => { if (parseDecimal(text.value) !== g) text.value = g ? String(g) : '' })
function onInput(e: Event) {
  text.value = (e.target as HTMLInputElement).value
  const v = parseDecimal(text.value)
  grams.value = Number.isFinite(v) ? v : 0
}
function step(d: number) {
  const base = grams.value || 0
  const next = Math.max(0, Math.round((base + d) / Math.abs(d)) * Math.abs(d))
  grams.value = next
}
const input = ref<HTMLInputElement>()
function focus(select = true) {
  input.value?.focus({ preventScroll: true })
  if (select) input.value?.select()
}
defineExpose({ focus })
const chipList = computed(() => [...new Set(props.chips)].filter(c => c > 0).sort((a, b) => a - b))
</script>

<template>
  <div class="grams">
    <div class="row">
      <button type="button" class="step" :aria-label="`−10 ${t('g')}`" @click="step(-10)"><Icon name="minus" /></button>
      <label class="box">
        <span class="sr-only">{{ t('grams') }}</span>
        <input
          ref="input" class="val num" :value="text" inputmode="decimal" enterkeyhint="done" autocomplete="off"
          :autofocus="autofocus || undefined" @input="onInput" @focus="($event.target as HTMLInputElement).select()" @keydown.enter.prevent="emit('submit')"
        >
        <span class="unit">{{ t('g') }}</span>
      </label>
      <button type="button" class="step" :aria-label="`+10 ${t('g')}`" @click="step(10)"><Icon name="plus" /></button>
    </div>
    <div class="chips">
      <button v-for="c in chipList" :key="c" type="button" class="chip" :aria-pressed="grams === c" @click="grams = c">{{ n(c) }}</button>
    </div>
  </div>
</template>

<style scoped>
.grams { display: grid; gap: var(--s-3); }
.row { display: grid; grid-template-columns: 52px 1fr 52px; gap: var(--s-2); align-items: center; }
.step { height: 52px; border: 0; border-radius: var(--r-md); background: var(--surface-2); color: var(--ink); display: grid; place-items: center; }
.step:active { background: var(--surface-3); }
.box {
  display: flex; align-items: baseline; justify-content: center; gap: 6px; height: 64px; padding: 0 var(--s-3);
  border: 1.5px solid var(--line-strong); border-radius: var(--r-md); background: var(--surface); cursor: text;
}
.box:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent); }
.val { width: 0; flex: 1; min-width: 0; height: 100%; border: 0; background: transparent; text-align: right; font-size: var(--fs-2xl); font-weight: var(--fw-bold); }
.unit { flex: 1; color: var(--ink-2); font-size: var(--fs-lg); }
.chips { justify-content: center; }
.chip { flex: 1; }
</style>
