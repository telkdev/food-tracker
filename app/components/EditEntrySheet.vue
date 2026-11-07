<script setup lang="ts">
import type { Entry, Meal } from '~/utils/types'
import { errMsg } from '~/utils/format'

const props = defineProps<{ entry: Entry | null, meal: Meal | null }>()
const emit = defineEmits<{ close: [], saved: [Entry], delete: [Entry] }>()
const { t, n } = useT()

const grams = ref(0)
const meal = ref<Meal>('breakfast')
const note = ref('')
const busy = ref(false)
const error = ref('')

watch(() => props.entry, (e) => {
  if (!e) return
  grams.value = e.grams
  meal.value = props.meal ?? e.meal ?? 'breakfast'
  note.value = e.note ?? ''
  error.value = ''
}, { immediate: true })

const changed = computed(() => !!props.entry && (grams.value !== props.entry.grams || meal.value !== (props.meal ?? props.entry.meal) || note.value !== (props.entry.note ?? '')))

async function save() {
  const e = props.entry
  if (!e || busy.value || !(grams.value > 0)) return
  if (!changed.value) return emit('close')
  busy.value = true; error.value = ''
  try {
    const body: Record<string, unknown> = {}
    if (grams.value !== e.grams) body.grams = grams.value
    if (meal.value !== (props.meal ?? e.meal)) body.meal = meal.value
    if (note.value !== (e.note ?? '')) body.note = note.value.trim() || null
    const updated = await $fetch<Entry>(`/api/entries/${e.id}`, { method: 'PATCH', body })
    emit('saved', updated)
  }
  catch (err) { error.value = errMsg(err, t('somethingWrong')) }
  finally { busy.value = false }
}
const chips = computed(() => {
  const g = props.entry?.grams
  const base = [50, 100, 150, 200]
  return g && !base.includes(g) ? [...base.slice(0, 3), g] : base
})
</script>

<template>
  <BottomSheet :open="!!entry" :label="t('editEntry')" @close="emit('close')">
    <template #header>
      <div class="head">
        <div class="ttl">
          <h2>{{ entry?.name }}</h2>
          <div v-if="entry" class="sub">
            <SourceBadge :source="entry.source" />
            <span class="muted num">{{ n(entry.per100.kcal) }} {{ t('kcal') }} {{ t('per100') }}</span>
          </div>
        </div>
        <button type="button" class="icon-btn" :aria-label="t('close')" @click="emit('close')"><Icon name="close" /></button>
      </div>
    </template>

    <form v-if="entry" class="form" @submit.prevent="save">
      <GramsInput v-model="grams" :chips="chips" @submit="save" />
      <NutritionPreview :per100="entry.per100" :grams="grams" :source="entry.source" />
      <div class="field">
        <span>{{ t('meal') }}</span>
        <MealPicker v-model="meal" />
      </div>
      <label class="field">
        <span>{{ t('note') }}</span>
        <input v-model="note" class="input" maxlength="500" autocomplete="off">
      </label>
      <p v-if="error" class="err">{{ error }}</p>
    </form>

    <template #footer>
      <div class="foot">
        <button type="button" class="btn btn-danger" :disabled="busy" @click="entry && emit('delete', entry)"><Icon name="trash" :size="20" />{{ t('delete') }}</button>
        <button type="button" class="btn btn-primary btn-lg grow" :disabled="busy || !(grams > 0)" @click="save"><Icon name="check" />{{ t('save') }}</button>
      </div>
    </template>
  </BottomSheet>
</template>

<style scoped>
.head { display: flex; align-items: flex-start; gap: var(--s-2); padding-bottom: var(--s-2); }
.ttl { flex: 1; min-width: 0; display: grid; gap: 6px; padding-top: 6px; }
.ttl h2 { font-size: var(--fs-xl); overflow-wrap: anywhere; }
.sub { display: flex; align-items: center; gap: var(--s-2); font-size: var(--fs-sm); }
.form { display: grid; gap: var(--s-4); }
.err { color: var(--danger); font-size: var(--fs-sm); }
.foot { display: flex; gap: var(--s-3); }
.foot .btn-danger { min-height: 52px; }
.grow { flex: 1; }
</style>
