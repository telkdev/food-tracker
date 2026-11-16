<script setup lang="ts">
/**
 * Coach report: pick a period, preview the key numbers, then share (phone share sheet → Telegram, mail…)
 * or download the PDF made by GET /api/report.pdf.
 */
import { addDays, diffDays, errMsg } from '~/utils/format'

const props = defineProps<{ open: boolean, today: string }>()
const emit = defineEmits<{ close: [] }>()
const { t, n, locale } = useT()

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

/*
 * iOS Safari only opens the share sheet if navigator.share() runs right inside the tap. Fetching the PDF
 * first (0.5–60 s with a cold server) uses that up and share() fails with NotAllowedError ("cannot share").
 * So the PDF is made as soon as the sheet opens or the period changes, and the tap shares a ready file.
 */
const ready = ref<File | null>(null)
const preparing = ref(false)
const prepError = ref('')
const wantKey = computed(() => `${period.value.from}|${period.value.to}|${details.value ? 1 : 0}|${locale.value}`)
let readyKey = ''
let timer: ReturnType<typeof setTimeout> | undefined

async function prepare() {
  if (!props.open || !valid.value) return
  const key = wantKey.value
  if (readyKey === key && ready.value) return
  ready.value = null
  preparing.value = true
  prepError.value = ''
  try {
    const { from, to } = period.value
    const blob = await $fetch<Blob>('/api/report.pdf', {
      query: { from, to, lang: locale.value, details: details.value ? '1' : '0' },
      responseType: 'blob',
    })
    if (key !== wantKey.value) return
    ready.value = new File([blob], `food-report_${from}_${to}.pdf`, { type: 'application/pdf' })
    readyKey = key
  }
  catch (e) { if (key === wantKey.value) prepError.value = errMsg(e) }
  finally { if (key === wantKey.value) preparing.value = false }
}
watch([() => props.open, wantKey], () => {
  clearTimeout(timer)
  // custom dates fire on every keystroke of the date field: wait for it to settle
  timer = setTimeout(prepare, preset.value === 'custom' ? 600 : 0)
}, { immediate: true })

function download(file: File) {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function share() {
  const file = ready.value
  if (!file) return
  if (!navigator.canShare?.({ files: [file] })) return download(file)
  // no await before this call: it must stay inside the tap
  navigator.share({ files: [file], title: t('reportTitle') }).catch((e: any) => {
    if (e?.name === 'AbortError') return
    download(file)
  })
}

function onDownload() {
  if (ready.value) download(ready.value)
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
        <button v-if="canShare" type="button" class="btn btn-primary btn-lg btn-block" :disabled="!ready" @click="share">
          <Icon name="share" :size="20" /> {{ preparing ? t('reportMaking') : t('reportShare') }}
        </button>
        <button type="button" class="btn btn-lg btn-block" :class="canShare ? 'btn-ghost' : 'btn-primary'" :disabled="!ready" @click="onDownload">
          <Icon name="download" :size="20" /> {{ preparing && !canShare ? t('reportMaking') : t('reportDownload') }}
        </button>
        <p v-if="prepError" class="warn">
          {{ t('loadFailed', { msg: prepError }) }}
          <button type="button" class="link" @click="prepare">{{ t('retry') }}</button>
        </p>
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
.link { border: 0; background: none; padding: 0; color: var(--accent); font: inherit; text-decoration: underline; }
</style>
