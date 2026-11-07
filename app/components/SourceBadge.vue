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
  display: inline-flex; align-items: center; height: 20px; padding: 0 7px; border-radius: var(--r-pill);
  font-size: var(--fs-2xs); font-weight: var(--fw-bold); letter-spacing: .02em; white-space: nowrap;
  background: var(--surface-2); color: var(--ink-2); border: 1px solid transparent;
}
.label { background: var(--accent-soft); color: var(--accent-soft-ink); }
.off { background: var(--off-soft); color: var(--off); }
.generic { background: var(--surface-2); color: var(--ink-2); }
.estimate { background: transparent; color: var(--estimate); border: 1.5px dashed color-mix(in srgb, var(--estimate) 70%, transparent); }
.lifesum { background: transparent; color: var(--ink-2); border: 1px solid var(--line-strong); }
</style>
