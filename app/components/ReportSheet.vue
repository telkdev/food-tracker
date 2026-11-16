<script setup lang="ts">
/**
 * Coach report: pick a period, preview the key numbers, then share (phone share sheet → Telegram, mail…)
 * or download the PDF made by GET /api/report.pdf.
 */
import { addDays, diffDays, errMsg } from '~/utils/format'

const props = defineProps<{ open: boolean, today: string }>()
const emit = defineEmits<{ close: [] }>()
const { t, n, locale } = useT()
const toast = useToast()

type Preset = 'last7' | 'prevWeek' | 'last30' | 'thisMonth' | 'prevMonth' | 'custom'
const PRESETS: { id: Preset, key: Parameters<typeof t>[0] }[] = [
  { id: 'last7', key: 'reportLast7' },
  { id: 'prevWeek', key: 'reportPrevWeek' },
  { id: 'last30', key: 'reportLast30' },
  { id: 'thisMonth', key: 'reportThisMonth' },
  { id: 'prevMonth', key: 'reportPrevMonth' },
  { id: 'custom', key: 'reportCustom' },
]

const preset = useCookie<Preset>('report-preset', { default: () => 'last7', sameSite: 'lax', maxAge: 60 * 60 * 24 * 400 })
const details = useCookie<boolean>('report-details', { default: () => true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 400 })
const customFrom = ref(addDays(props.today, -6))
const customTo = ref(props.today)

/** Monday-based week; month bounds from the ISO date string, no time zones involved. */
function range(p: Preset): { from: string, to: string } {
  const today = props.today
  const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7
  const month = today.slice(0, 7)
  switch (p) {
    case 'last7': return { from: addDays(today, -6), to: today }
    case 'prevWeek': return { from: addDays(today, -dow - 7), to: addDays(today, -dow - 1) }
    case 'last30': return { from: addDays(today, -29), to: today }
    case 'thisMonth': return { from: `${month}-01`, to: today }
    case 'prevMonth': {
      const last = addDays(`${month}-01`, -1)
      return { from: `${last.slice(0, 7)}-01`, to: last }
    }
    default: return { from: customFrom.value, to: customTo.value }
  }
}

const period = computed(() => range(preset.value))
const valid = computed(() => {
  const { from, to } = period.value
  return /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to && from <= props.today && diffDays(to, from) < 366
})

interface Preview { period_days: number, full_days: number, logged_days: number, avg: { kcal: number | null, p: number | null } }
const preview = ref<Preview | null>(null)
const previewFor = ref('')
async function loadPreview() {
  if (!props.open || !valid.value) return
  const key = `${period.value.from}|${period.value.to}`
  try {
    const r = await $fetch<Preview>('/api/report', { query: period.value })
    if (key === `${period.value.from}|${period.value.to}`) { preview.value = r; previewFor.value = key }
  }
  catch { preview.value = null }
}
watch([() => props.open, period], loadPreview, { immediate: true })

const canShare = ref(false)
onMounted(() => {
  try { canShare.value = !!navigator.canShare?.({ files: [new File([''], 'x.pdf', { type: 'application/pdf' })] }) }
  catch { canShare.value = false }
})

const busy = ref(false)
async function make(mode: 'share' | 'download') {
  if (!valid.value || busy.value) return
  busy.value = true
  try {
    const { from, to } = period.value
    const blob = await $fetch<Blob>('/api/report.pdf', {
      query: { from, to, lang: locale.value, details: details.value ? '1' : '0' },
      responseType: 'blob',
    })
    const name = `food-report_${from}_${to}.pdf`
    const file = new File([blob], name, { type: 'application/pdf' })
    if (mode === 'share' && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: t('reportTitle') }) }
      catch (e: any) { if (e?.name !== 'AbortError') throw e }
    }
    else {
      const url = URL.createObjectURL(file)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    }
  }
  catch (e) { toast.show(t('loadFailed', { msg: errMsg(e) })) }
  finally { busy.value = false }
}
</script>

<template>
  <BottomSheet :open="open" :label="t('reportTitle')" @close="emit('close')">
    <template #header>
      <div class="head">
        <h2>{{ t('reportTitle') }}</h2>
        <button type="button" class="icon-btn" :aria-label="t('close')" @click="emit('close')"><Icon name="close" /></button>
      </div>
    </template>
    <div class="sheet">
      <div class="chips" role="group" :aria-label="t('reportTitle')">
        <button v-for="p in PRESETS" :key="p.id" type="button" class="chip" :aria-pressed="preset === p.id" @click="preset = p.id">{{ t(p.key) }}</button>
      </div>

      <div v-if="preset === 'custom'" class="dates">
        <label class="field"><span>{{ t('reportFrom') }}</span><input v-model="customFrom" class="input num" type="date" :max="today"></label>
        <label class="field"><span>{{ t('reportTo') }}</span><input v-model="customTo" class="input num" type="date" :max="today"></label>
      </div>

      <p v-if="!valid" class="warn">{{ t('reportBadRange') }}</p>
      <p v-else-if="preview && previewFor === `${period.from}|${period.to}`" class="preview num">
        {{ preview.logged_days
          ? t('reportPreview', { full: preview.full_days, days: preview.period_days, kcal: n(preview.avg.kcal), p: n(preview.avg.p) })
          : t('reportEmpty') }}
      </p>
      <p v-else class="preview muted">…</p>

      <label class="check">
        <input v-model="details" type="checkbox">
        <span>{{ t('reportDetails') }}</span>
      </label>

      <div class="actions">
        <button v-if="canShare" type="button" class="btn btn-primary btn-lg btn-block" :disabled="!valid || busy" @click="make('share')">
          <Icon name="share" :size="20" /> {{ busy ? t('reportMaking') : t('reportShare') }}
        </button>
        <button type="button" class="btn btn-lg btn-block" :class="canShare ? 'btn-ghost' : 'btn-primary'" :disabled="!valid || busy" @click="make('download')">
          <Icon name="download" :size="20" /> {{ busy && !canShare ? t('reportMaking') : t('reportDownload') }}
        </button>
      </div>
      <p class="hint">{{ t('reportHint') }}</p>
    </div>
  </BottomSheet>
</template>

<style scoped>
.head { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); }
.head h2 { font-size: var(--fs-lg); font-weight: var(--fw-bold); }
.sheet { display: grid; gap: var(--s-4); padding-bottom: var(--s-2); }
.dates { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-3); }
.preview { font-size: var(--fs-sm); color: var(--ink-2); min-height: 1.4em; }
.warn { font-size: var(--fs-sm); color: var(--over); }
.check { display: flex; align-items: center; gap: var(--s-3); font-size: var(--fs-sm); color: var(--ink); cursor: pointer; }
.check input { width: 20px; height: 20px; accent-color: var(--accent); flex: none; }
.actions { display: grid; gap: var(--s-2); }
.actions .btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--s-2); }
.hint { font-size: var(--fs-xs); color: var(--ink-3); }
</style>
