<script setup lang="ts">
import type { Preference, SavedMeal, Settings } from '~/utils/types'
import { errMsg } from '~/utils/format'
import type { LangPref } from '~/composables/useI18n'

const { t, locale } = useT()
const toast = useToast()
const { settings } = useSettings()
const { clear, user } = useUserSession()
const requestFetch = useRequestFetch()
const langPref = useLangPref()

const { data } = await useAsyncData('settings-page', () => requestFetch<Settings>('/api/settings'))
const f = reactive({ kcal: '', p: '', f: '', c: '' })
watch(data, (s) => {
  if (!s) return
  settings.value = s
  Object.assign(f, { kcal: String(s.kcalGoal), p: s.pGoal != null ? String(s.pGoal) : '', f: s.fGoal != null ? String(s.fGoal) : '', c: s.cGoal != null ? String(s.cGoal) : '' })
}, { immediate: true })

const busy = ref(false)
const error = ref('')
const kcalBad = computed(() => { const v = Number(f.kcal); return !Number.isInteger(v) || v < 800 || v > 8000 })
const opt = (s: string) => s.trim() === '' ? null : Math.round(Number(s.replace(',', '.')))

async function save() {
  if (kcalBad.value || busy.value) return
  busy.value = true; error.value = ''
  try {
    await $fetch('/api/settings', { method: 'PATCH', body: { kcal_goal: Number(f.kcal), p_goal: opt(f.p), f_goal: opt(f.f), c_goal: opt(f.c) } })
    settings.value = await $fetch<Settings>('/api/settings')
    useState<Record<string, unknown>>('day-cache').value = {}
    toast.show(t('goalsSaved'))
  }
  catch (e) { error.value = errMsg(e, t('somethingWrong')) }
  finally { busy.value = false }
}

function setLang(p: LangPref) {
  langPref.value = p
  locale.value = resolveLocale(p, navigator.language)
}

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  await navigateTo('/login')
}
// macro → kcal hint so the goals add up
const macroKcal = computed(() => (opt(f.p) ?? 0) * 4 + (opt(f.f) ?? 0) * 9 + (opt(f.c) ?? 0) * 4)
interface Usage { today: { calls: number, tokens: number }, total: { calls: number, tokens: number }, by_tool: { tool: string, calls: number, errors: number, tokens: number, avg_tokens: number, avg_ms: number }[] }
const { data: usage } = await useAsyncData('usage', () => requestFetch<Usage>('/api/usage', { query: { days: 7 } }))
// ---------- memory for Claude ----------
const { data: prefs, refresh: refreshPrefs } = await useAsyncData('prefs', () => requestFetch<Preference[]>('/api/preferences'))
const { data: meals, refresh: refreshMeals } = await useAsyncData('meals-page', () => requestFetch<SavedMeal[]>('/api/meals'))
const usual = useSavedMeals()
const np = reactive({ key: '', text: '' })
const keyBad = computed(() => !/^[a-z0-9_]{1,40}$/.test(np.key))
const memErr = ref('')
async function savePref(key: string, text: string) {
  memErr.value = ''
  try {
    await $fetch(`/api/preferences/${key}`, { method: 'PUT', body: { text } })
    await refreshPrefs()
    toast.show(t('saved'))
    return true
  }
  catch (e) { memErr.value = errMsg(e, t('somethingWrong')) }
}
async function addPref() {
  if (keyBad.value || !np.text.trim()) return
  if (await savePref(np.key, np.text.trim())) Object.assign(np, { key: '', text: '' })
}
async function delPref(key: string) {
  try { await $fetch(`/api/preferences/${key}`, { method: 'DELETE' }); await refreshPrefs() }
  catch (e) { memErr.value = errMsg(e, t('somethingWrong')) }
}
async function delMeal(m: SavedMeal) {
  try { await usual.remove(m.id); await refreshMeals(); toast.show(t('usualDeleted', { name: m.name })) }
  catch (e) { memErr.value = errMsg(e, t('somethingWrong')) }
}

const nf = (n: number) => n.toLocaleString(locale.value === 'ru' ? 'ru-RU' : 'en-US')
useHead({ title: () => `${t('settingsTitle')} · ${t('appName')}` })
</script>

<template>
  <div class="settings">
    <header class="top">
      <NuxtLink to="/" class="icon-btn" :aria-label="t('back')"><Icon name="back" /></NuxtLink>
      <h1>{{ t('settingsTitle') }}</h1>
    </header>

    <form class="card group" @submit.prevent="save">
      <h2 class="section-title">{{ t('goals') }}</h2>
      <label class="line">
        <span class="ll">{{ t('kcalGoal') }}</span>
        <span class="iv"><input v-model="f.kcal" class="input num" inputmode="numeric" :aria-invalid="kcalBad"><span class="u">{{ t('kcal') }}</span></span>
      </label>
      <label class="line">
        <span class="ll"><i class="dot p" />{{ t('proteinGoal') }} <small>{{ t('optional') }}</small></span>
        <span class="iv"><input v-model="f.p" class="input num" inputmode="numeric" placeholder="—"><span class="u">{{ t('g') }}</span></span>
      </label>
      <label class="line">
        <span class="ll"><i class="dot f" />{{ t('fatGoal') }} <small>{{ t('optional') }}</small></span>
        <span class="iv"><input v-model="f.f" class="input num" inputmode="numeric" placeholder="—"><span class="u">{{ t('g') }}</span></span>
      </label>
      <label class="line">
        <span class="ll"><i class="dot c" />{{ t('carbsGoal') }} <small>{{ t('optional') }}</small></span>
        <span class="iv"><input v-model="f.c" class="input num" inputmode="numeric" placeholder="—"><span class="u">{{ t('g') }}</span></span>
      </label>
      <p v-if="macroKcal" class="hint num">{{ t('protein') }} + {{ t('fat') }} + {{ t('carbs') }} ≈ {{ macroKcal }} {{ t('kcal') }}</p>
      <p v-if="error" class="err">{{ error }}</p>
      <button type="submit" class="btn btn-primary btn-block" :disabled="busy || kcalBad">{{ t('save') }}</button>
    </form>

    <section class="card group">
      <h2 class="section-title">{{ t('language') }}</h2>
      <div class="seg" role="group" :aria-label="t('language')">
        <button type="button" :aria-pressed="langPref === 'auto'" @click="setLang('auto')">{{ t('langAuto') }}</button>
        <button type="button" :aria-pressed="langPref === 'ru'" lang="ru" @click="setLang('ru')">Русский</button>
        <button type="button" :aria-pressed="langPref === 'en'" lang="en" @click="setLang('en')">English</button>
      </div>
    </section>

    <section class="card group">
      <h2 class="section-title">{{ t('memoryTitle') }}</h2>
      <p class="hint">{{ t('memoryNote') }}</p>
      <div v-for="p in prefs ?? []" :key="p.key" class="pref">
        <div class="ph"><code>{{ p.key }}</code><button type="button" class="icon-btn" :aria-label="`${t('delete')} ${p.key}`" @click="delPref(p.key)"><Icon name="trash" :size="18" /></button></div>
        <textarea class="input ta" :value="p.text" rows="3" :aria-label="p.key" @change="savePref(p.key, ($event.target as HTMLTextAreaElement).value.trim())" />
      </div>
      <form class="pref" @submit.prevent="addPref">
        <input v-model="np.key" class="input" :placeholder="t('memoryKey')" autocapitalize="off" autocomplete="off" spellcheck="false">
        <textarea v-model="np.text" class="input ta" rows="2" :placeholder="t('memoryText')" />
        <button type="submit" class="btn" :disabled="keyBad || !np.text.trim()">{{ t('memoryAdd') }}</button>
      </form>
      <p v-if="memErr" class="err">{{ memErr }}</p>
    </section>

    <section class="card group">
      <h2 class="section-title">{{ t('usualMeals') }}</h2>
      <p v-if="!meals?.length" class="hint">{{ t('usualNone') }}</p>
      <div v-for="m in meals ?? []" :key="m.id" class="line">
        <span class="ml"><b>{{ m.name }}</b><small>{{ m.items.map(i => `${i.name} ${i.grams} ${t('g')}`).join(' · ') }}</small></span>
        <span class="num">{{ Math.round(m.kcal) }} {{ t('kcal') }}</span>
        <button type="button" class="icon-btn" :aria-label="`${t('delete')} ${m.name}`" @click="delMeal(m)"><Icon name="trash" :size="18" /></button>
      </div>
    </section>

    <section class="card group">
      <h2 class="section-title">{{ t('usageTitle') }}</h2>
      <p v-if="!usage || !usage.total.calls" class="hint">{{ t('usageNone') }}</p>
      <template v-else>
        <div class="line"><span class="ll">{{ t('usageToday') }}</span><span class="num">{{ t('usageCalls', { n: usage.today.calls }) }} · {{ t('usageTokens', { n: nf(usage.today.tokens) }) }}</span></div>
        <div class="line"><span class="ll">{{ t('usageWeek') }}</span><span class="num">{{ t('usageCalls', { n: usage.total.calls }) }} · {{ t('usageTokens', { n: nf(usage.total.tokens) }) }}</span></div>
        <div v-for="r in usage.by_tool" :key="r.tool" class="line tool"><code>{{ r.tool }}</code><span class="num">{{ r.calls }}× · {{ t('usageAvg', { n: nf(r.avg_tokens) }) }}<template v-if="r.errors"> · <span class="err">{{ r.errors }}✗</span></template></span></div>
      </template>
      <p class="hint">{{ t('usageNote') }}</p>
    </section>

    <button type="button" class="btn btn-block logout" @click="logout"><Icon name="logout" :size="20" />{{ t('logout') }}</button>

    <p class="attribution about">{{ t('appName') }} · {{ t('signedInAs', { name: (user as any)?.id ?? '' }) }} · {{ locale }} · {{ t('offAttribution') }}</p>
  </div>
</template>

<style scoped>
.settings { display: grid; gap: var(--s-4); }
.top { display: flex; align-items: center; gap: var(--s-2); padding-top: var(--s-2); min-height: 56px; margin-left: calc(-1 * var(--s-2)); }
.top h1 { font-size: var(--fs-2xl); font-weight: var(--fw-black); letter-spacing: -0.02em; }
.group { padding: var(--s-4); display: grid; gap: var(--s-3); }
.line { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); min-height: 52px; }
.line + .line { border-top: 1px solid var(--line); padding-top: var(--s-2); }
.ll { display: flex; align-items: center; gap: 6px; font-weight: var(--fw-medium); flex-wrap: wrap; }
.ll small { color: var(--ink-3); font-weight: var(--fw-regular); font-size: var(--fs-xs); width: 100%; padding-left: 14px; }
.iv { display: flex; align-items: center; gap: 6px; }
.iv .input { width: 96px; text-align: right; min-height: 44px; }
.input[aria-invalid='true'] { border-color: var(--danger); }
.u { width: 2.2em; color: var(--ink-2); font-size: var(--fs-sm); }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot.p { background: var(--protein); } .dot.f { background: var(--fat); } .dot.c { background: var(--carbs); }
.hint { font-size: var(--fs-xs); color: var(--ink-2); }
.err { color: var(--danger); font-size: var(--fs-sm); }
.logout { color: var(--danger); background: var(--surface); }
.about { text-align: center; }
.num { font-variant-numeric: tabular-nums; color: var(--ink-2); font-size: var(--fs-sm); text-align: right; }
.tool { min-height: 40px; }
.pref { display: grid; gap: var(--s-2); }
.pref + .pref { border-top: 1px solid var(--line); padding-top: var(--s-3); }
.ph { display: flex; align-items: center; justify-content: space-between; }
.ph code { font-size: var(--fs-sm); color: var(--ink-2); }
.ta { min-height: 0; height: auto; padding: var(--s-2) var(--s-3); resize: vertical; font: inherit; font-size: var(--fs-sm); line-height: 1.4; }
.ml { flex: 1; min-width: 0; display: grid; gap: 2px; }
.ml small { color: var(--ink-2); font-size: var(--fs-xs); overflow-wrap: anywhere; }
.tool code { font-size: var(--fs-sm); }
</style>
