<script setup lang="ts">
import type { EntrySource } from '~/utils/types'
const props = defineProps<{ source: EntrySource }>()
const { t } = useT()
const short = computed(() => t(`src_${props.source}` as any))
const long = computed(() => t(`srcLong_${props.source}` as any))
</script>

<template>
  <span class="badge" :class="source" :title="long"><span class="sr-only">{{ long }}</span><span aria-hidden="true">{{ short }}</span></span>
</template>

<style scoped>
.badge {
  display: inline-flex; align-items: center; height: 18px; padding: 0; border: 0; border-radius: var(--r-pill);
  font-size: var(--fs-2xs); font-weight: var(--fw-regular); letter-spacing: 0; white-space: nowrap;
  background: transparent; color: var(--ink-3);
}
/* only the estimate badge gets a shape; the others are quiet metadata text */
.label, .generic, .lifesum { background: transparent; color: var(--ink-3); border: 0; }
.label { color: var(--accent); }
.off { background: transparent; color: var(--off); }
.estimate { padding: 0 6px; background: transparent; color: var(--estimate); border: 1px dashed color-mix(in srgb, var(--estimate) 60%, transparent); font-weight: var(--fw-medium); }
</style>
