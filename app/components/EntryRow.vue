<script setup lang="ts">
import type { Entry } from '~/utils/types'
const props = defineProps<{ entry: Entry }>()
defineEmits<{ open: [Entry] }>()
const { t, n } = useT()
const approx = computed(() => props.entry.source === 'estimate')
</script>

<template>
  <button class="entry" type="button" @click="$emit('open', entry)">
    <span class="main">
      <span class="name">{{ entry.name }}</span>
      <span class="meta">
        <span class="num grams">{{ n(entry.grams, 1) }} {{ t('g') }}</span>
        <SourceBadge :source="entry.source" />
        <span v-if="entry.note" class="note">{{ entry.note }}</span>
      </span>
      <MacroSplit :p="entry.p" :f="entry.f" :c="entry.c" />
    </span>
    <span class="kcal num" :class="{ approx }"><span v-if="approx" aria-hidden="true">≈</span>{{ n(entry.kcal) }}<small>{{ t('kcal') }}</small></span>
  </button>
</template>

<style scoped>
.entry {
  display: flex; align-items: center; gap: var(--s-3); width: 100%; min-height: 56px;
  padding: var(--s-2) var(--s-4); border: 0; background: transparent; text-align: left; border-radius: 0;
  transition: background var(--dur-fast);
}
.entry:hover { background: color-mix(in srgb, var(--surface-2) 55%, transparent); }
.entry:active { background: var(--surface-2); }
.entry:focus-visible { outline-offset: -2px; border-radius: var(--r-md); }
.main { flex: 1; min-width: 0; display: grid; gap: 3px; }
.name { font-weight: var(--fw-medium); overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.meta { display: flex; align-items: center; gap: var(--s-2); color: var(--ink-2); font-size: var(--fs-xs); min-width: 0; }
.grams { white-space: nowrap; flex: none; }
.note { font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.kcal { flex: none; font-weight: var(--fw-bold); font-size: var(--fs-md); display: flex; align-items: baseline; gap: 2px; }
.kcal small { font-size: var(--fs-2xs); font-weight: var(--fw-medium); color: var(--ink-2); margin-left: 3px; }
.kcal.approx { color: var(--estimate); }
</style>
