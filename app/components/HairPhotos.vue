<script setup lang="ts">
/**
 * Hair progress photos («Волосы»): add a photo with the day it shows, a grid (newest first),
 * a viewer to change the date/note or delete, and a before/after comparison (side by side or a slider).
 * The browser shrinks each photo first (utils/photo.ts); the server keeps it in Postgres, visible only to its owner.
 */
import { intlTag } from '~/utils/i18n'
import { errMsg } from '~/utils/format'
import { preparePhoto } from '~/utils/photo'
import { daysBetween } from '~~/shared/hair'

const props = defineProps<{ today: string }>()

interface Photo { id: string, taken_on: string, note: string | null, width: number, height: number, bytes: number, created_at: string }

const { t, locale } = useT()
const toast = useToast()
const requestFetch = useRequestFetch()
const { data, refresh } = await useAsyncData('hair-photos', () => requestFetch<{ photos: Photo[], limit: number }>('/api/hair/photos'))
const photos = computed(() => data.value?.photos ?? [])
const newestFirst = computed(() => [...photos.value].reverse())

const src = (p: Photo, thumb = false) => `/api/hair/photos/${p.id}${thumb ? '?size=thumb' : ''}`
const fmt = (d: string, year = false) => new Date(`${d}T12:00:00Z`).toLocaleDateString(intlTag[locale.value], {
  day: 'numeric', month: 'short', ...(year || d.slice(0, 4) !== props.today.slice(0, 4) ? { year: 'numeric' } : {}),
})

// ---------- add ----------
const fileInput = ref<HTMLInputElement>()
const preparing = ref(false)
const uploading = ref(false)
const draft = reactive({ open: false, url: '', image: null as Blob | null, thumb: null as Blob | null, width: 0, height: 0, date: '', note: '' })

/** The day the picture was taken, from the file (gallery photos keep it), if it isn't in the future. */
function fileDay(f: File) {
  if (!f.lastModified) return props.today
  const d = new Date(f.lastModified)
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return iso <= props.today ? iso : props.today
}

async function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (!f) return
  preparing.value = true
  try {
    const r = await preparePhoto(f)
    if (draft.url) URL.revokeObjectURL(draft.url)
    Object.assign(draft, { open: true, url: URL.createObjectURL(r.image), image: r.image, thumb: r.thumb, width: r.width, height: r.height, date: fileDay(f), note: '' })
  }
  catch { toast.show(t('hairPhotoBadFile')) }
  finally { preparing.value = false }
}
function closeDraft() {
  draft.open = false
  if (draft.url) URL.revokeObjectURL(draft.url)
  Object.assign(draft, { url: '', image: null, thumb: null })
}
async function upload() {
  if (!draft.image || !draft.thumb || uploading.value) return
  uploading.value = true
  const fd = new FormData()
  fd.append('image', draft.image, 'photo.jpg')
  fd.append('thumb', draft.thumb, 'thumb.jpg')
  fd.append('taken_on', draft.date || props.today)
  fd.append('note', draft.note.trim())
  fd.append('width', String(draft.width))
  fd.append('height', String(draft.height))
  try {
    await $fetch('/api/hair/photos', { method: 'POST', body: fd })
    closeDraft()
    toast.show(t('hairPhotoSaved'))
    await refresh()
    pickDefaults(true)
  }
  catch (e) { toast.show(errMsg(e, t('somethingWrong'))) }
  finally { uploading.value = false }
}

// ---------- view / edit ----------
const viewing = ref<Photo | null>(null)
const vform = reactive({ date: '', note: '' })
const vsaving = ref(false)
function openPhoto(p: Photo) {
  viewing.value = p
  Object.assign(vform, { date: p.taken_on, note: p.note ?? '' })
}
const vdirty = computed(() => !!viewing.value && (vform.date !== viewing.value.taken_on || vform.note.trim() !== (viewing.value.note ?? '')))
async function saveView() {
  const p = viewing.value
  if (!p || vsaving.value || !vform.date) return
  vsaving.value = true
  try {
    await $fetch(`/api/hair/photos/${p.id}`, { method: 'PATCH', body: { taken_on: vform.date, note: vform.note.trim() || null } })
    viewing.value = null
    toast.show(t('hairSaved'))
    await refresh()
  }
  catch (e) { toast.show(errMsg(e, t('somethingWrong'))) }
  finally { vsaving.value = false }
}
async function removeView() {
  const p = viewing.value
  if (!p || !confirm(t('hairPhotoDeleteConfirm'))) return
  try {
    await $fetch(`/api/hair/photos/${p.id}`, { method: 'DELETE' })
    viewing.value = null
    toast.show(t('hairPhotoDeleted'))
    await refresh()
    pickDefaults()
  }
  catch (e) { toast.show(errMsg(e, t('somethingWrong'))) }
}

// ---------- compare ----------
const beforeId = ref('')
const afterId = ref('')
const mode = useCookie<'side' | 'slide'>('hair-compare', { default: () => 'side', sameSite: 'lax' })
const pos = ref(50)
/** First vs latest by default; after an upload the new photo becomes "after". */
function pickDefaults(newAfter = false) {
  const list = photos.value
  const ids = new Set(list.map(p => p.id))
  if (!ids.has(beforeId.value)) beforeId.value = list[0]?.id ?? ''
  if (newAfter || !ids.has(afterId.value)) afterId.value = list[list.length - 1]?.id ?? ''
}
pickDefaults()
const before = computed(() => photos.value.find(p => p.id === beforeId.value))
const after = computed(() => photos.value.find(p => p.id === afterId.value))
const gap = computed(() => (before.value && after.value ? Math.abs(daysBetween(before.value.taken_on, after.value.taken_on)) : 0))
const label = (p: Photo) => `${fmt(p.taken_on)}${p.note ? ` · ${p.note}` : ''}`
</script>

<template>
  <section class="ph card" :aria-label="t('hairPhotos')">
    <div class="ph-h">
      <h2>{{ t('hairPhotos') }}</h2>
      <button type="button" class="add" :disabled="preparing" @click="fileInput?.click()">
        <Icon name="plus" :size="16" /><span>{{ preparing ? t('hairPhotoPreparing') : t('hairPhotoAdd') }}</span>
      </button>
      <input ref="fileInput" type="file" accept="image/*" hidden @change="onPick">
    </div>

    <p v-if="!photos.length" class="muted hint">{{ t('hairPhotosEmpty') }}</p>

    <template v-else>
      <!-- compare -->
      <div v-if="photos.length >= 2 && before && after" class="cmp">
        <div class="cmp-h">
          <h3>{{ t('hairCompare') }}</h3>
          <div class="seg" role="group" :aria-label="t('hairCompare')">
            <button type="button" :aria-pressed="mode === 'side'" @click="mode = 'side'">{{ t('hairCompareSide') }}</button>
            <button type="button" :aria-pressed="mode === 'slide'" @click="mode = 'slide'">{{ t('hairCompareSlide') }}</button>
          </div>
        </div>
        <div class="pick">
          <label class="field"><span>{{ t('hairCompareBefore') }}</span>
            <select v-model="beforeId" class="input"><option v-for="p in photos" :key="p.id" :value="p.id">{{ label(p) }}</option></select>
          </label>
          <label class="field"><span>{{ t('hairCompareAfter') }}</span>
            <select v-model="afterId" class="input"><option v-for="p in photos" :key="p.id" :value="p.id">{{ label(p) }}</option></select>
          </label>
        </div>

        <div v-if="mode === 'side'" class="side">
          <figure v-for="(p, i) in [before, after]" :key="i">
            <button type="button" class="img-btn" :aria-label="t('hairPhotoOpen', { date: fmt(p.taken_on, true) })" @click="openPhoto(p)">
              <img :src="src(p)" :alt="fmt(p.taken_on, true)" loading="lazy" decoding="async">
            </button>
            <figcaption><b>{{ i ? t('hairCompareAfter') : t('hairCompareBefore') }}</b> {{ fmt(p.taken_on) }}</figcaption>
          </figure>
        </div>
        <div v-else class="slide" :style="{ aspectRatio: `${after.width} / ${after.height}` }">
          <img :src="src(before)" :alt="fmt(before.taken_on, true)" decoding="async">
          <img class="top" :src="src(after)" :alt="fmt(after.taken_on, true)" decoding="async" :style="{ clipPath: `inset(0 0 0 ${pos}%)` }">
          <span class="line" :style="{ left: `${pos}%` }" aria-hidden="true" />
          <span class="tag l">{{ t('hairCompareBefore') }} · {{ fmt(before.taken_on) }}</span>
          <span class="tag r">{{ t('hairCompareAfter') }} · {{ fmt(after.taken_on) }}</span>
          <input v-model.number="pos" type="range" min="0" max="100" step="1" :aria-label="t('hairCompareSlider')">
        </div>
        <p class="gap num">{{ t('hairCompareGap', { n: gap }) }}</p>
      </div>

      <!-- all photos, newest first -->
      <ul class="grid">
        <li v-for="p in newestFirst" :key="p.id">
          <button type="button" class="img-btn" :aria-label="t('hairPhotoOpen', { date: fmt(p.taken_on, true) })" @click="openPhoto(p)">
            <img :src="src(p, true)" :alt="fmt(p.taken_on, true)" loading="lazy" decoding="async">
            <span class="d num">{{ fmt(p.taken_on) }}</span>
          </button>
        </li>
      </ul>
      <p class="muted priv"><Icon name="eyeOff" :size="13" />{{ t('hairPhotoPrivate') }}</p>
    </template>

    <!-- new photo -->
    <BottomSheet :open="draft.open" :label="t('hairPhotoNew')" tall @close="closeDraft">
      <template #header>
        <div class="head">
          <h2>{{ t('hairPhotoNew') }}</h2>
          <button type="button" class="icon-btn" :aria-label="t('close')" @click="closeDraft"><Icon name="close" /></button>
        </div>
      </template>
      <form class="form" @submit.prevent="upload">
        <img v-if="draft.url" class="preview" :src="draft.url" alt="">
        <label class="field"><span>{{ t('hairPhotoDate') }}</span>
          <input v-model="draft.date" class="input num" type="date" :max="today" required>
        </label>
        <label class="field"><span>{{ t('hairNote') }}</span>
          <input v-model="draft.note" class="input" maxlength="300" :placeholder="t('hairPhotoNotePh')">
        </label>
        <button type="submit" class="btn btn-primary btn-lg btn-block" :disabled="uploading || !draft.date">{{ t('save') }}</button>
      </form>
    </BottomSheet>

    <!-- view / edit -->
    <BottomSheet :open="!!viewing" :label="t('hairPhotoView')" tall @close="viewing = null">
      <template #header>
        <div class="head">
          <h2>{{ viewing ? fmt(viewing.taken_on, true) : '' }}</h2>
          <button type="button" class="icon-btn" :aria-label="t('close')" @click="viewing = null"><Icon name="close" /></button>
        </div>
      </template>
      <form v-if="viewing" class="form" @submit.prevent="saveView">
        <img class="preview" :src="src(viewing)" :alt="fmt(viewing.taken_on, true)">
        <label class="field"><span>{{ t('hairPhotoDate') }}</span>
          <input v-model="vform.date" class="input num" type="date" :max="today" required>
        </label>
        <label class="field"><span>{{ t('hairNote') }}</span>
          <input v-model="vform.note" class="input" maxlength="300" :placeholder="t('hairPhotoNotePh')">
        </label>
        <button v-if="vdirty" type="submit" class="btn btn-primary btn-lg btn-block" :disabled="vsaving || !vform.date">{{ t('save') }}</button>
        <button type="button" class="btn btn-danger btn-block" @click="removeView"><Icon name="trash" :size="18" />{{ t('hairPhotoDelete') }}</button>
      </form>
    </BottomSheet>
  </section>
</template>

<style scoped>
.ph { padding: var(--s-4); display: grid; gap: var(--s-3); }
.ph-h { display: flex; align-items: center; justify-content: space-between; gap: var(--s-2); }
h2 { font-size: var(--fs-lg); font-weight: var(--fw-bold); letter-spacing: -0.01em; }
h3 { font-size: var(--fs-md); font-weight: var(--fw-medium); }
.add {
  display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 12px 0 10px; border: 0; border-radius: var(--r-pill);
  background: var(--accent-soft); color: var(--accent-soft-ink); font: inherit; font-size: var(--fs-sm); font-weight: var(--fw-medium); white-space: nowrap; cursor: pointer;
}
.add:disabled { opacity: .6; cursor: progress; }
.hint { font-size: var(--fs-sm); }

.cmp { display: grid; gap: var(--s-3); padding-bottom: var(--s-3); border-bottom: 1px solid var(--line); }
.cmp-h { display: flex; align-items: center; justify-content: space-between; gap: var(--s-2); flex-wrap: wrap; }
.cmp-h .seg { min-width: 190px; }
.pick { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-2); }
.pick .field span { font-size: var(--fs-xs); color: var(--ink-2); }
.pick select { width: 100%; min-width: 0; text-overflow: ellipsis; }
.side { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-2); }
.side figure { margin: 0; display: grid; gap: 4px; }
.side img { width: 100%; aspect-ratio: 3 / 4; object-fit: cover; border-radius: var(--r-md, 10px); display: block; background: var(--surface-2); }
.side figcaption { font-size: var(--fs-xs); color: var(--ink-2); }
.side figcaption b { color: var(--ink); font-weight: var(--fw-medium); }
.slide { position: relative; width: 100%; max-height: 70vh; border-radius: var(--r-md, 10px); overflow: hidden; background: var(--surface-2); touch-action: pan-y; }
.slide img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.slide .line { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.25); pointer-events: none; }
.slide .tag { position: absolute; top: 8px; padding: 2px 8px; border-radius: var(--r-pill); background: rgba(0,0,0,.55); color: #fff; font-size: var(--fs-2xs); pointer-events: none; }
.slide .tag.l { left: 8px; }
.slide .tag.r { right: 8px; }
.slide input[type='range'] { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: ew-resize; }
.gap { font-size: var(--fs-xs); color: var(--ink-2); text-align: center; }

.grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.img-btn { position: relative; display: block; width: 100%; padding: 0; border: 0; background: none; cursor: pointer; border-radius: var(--r-md, 10px); overflow: hidden; }
.grid img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; background: var(--surface-2); }
.grid .d { position: absolute; left: 4px; bottom: 4px; padding: 1px 6px; border-radius: var(--r-pill); background: rgba(0,0,0,.55); color: #fff; font-size: var(--fs-2xs); }
.priv { display: flex; align-items: center; gap: 4px; font-size: var(--fs-2xs); }

.head { display: flex; align-items: center; gap: var(--s-2); padding: 6px 0 var(--s-2); }
.head h2 { flex: 1; font-size: var(--fs-xl); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.form { display: grid; gap: var(--s-4); padding-bottom: var(--s-4); }
.preview { width: 100%; max-height: 55vh; object-fit: contain; border-radius: var(--r-md, 10px); background: var(--surface-2); }
.btn-danger { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
</style>
