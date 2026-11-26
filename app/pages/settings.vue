<script setup lang="ts">
import type { Preference, SavedMeal, Settings } from '~/utils/types'
import { errMsg } from '~/utils/format'
import { intlTag, type MsgKey } from '~/utils/i18n'
import type { LangPref } from '~/composables/useI18n'

const { t, locale } = useT()
const toast = useToast()
const { settings } = useSettings()
const { clear, user } = useUserSession()
const requestFetch = useRequestFetch()
const langPref = useLangPref()

const { data } = await useAsyncData('settings-page', () => requestFetch<Settings>('/api/settings'))
const f = reactive({ kcal: '', p: '', f: '', c: '', water: '' })
watch(data, (s) => {
  if (!s) return
  settings.value = s
  Object.assign(f, { kcal: String(s.kcalGoal), p: s.pGoal != null ? String(s.pGoal) : '', f: s.fGoal != null ? String(s.fGoal) : '', c: s.cGoal != null ? String(s.cGoal) : '', water: s.waterGoalMl != null ? String(s.waterGoalMl) : '' })
}, { immediate: true })

const busy = ref(false)
const error = ref('')
const kcalBad = computed(() => { const v = Number(f.kcal); return !Number.isInteger(v) || v < 800 || v > 8000 })
const waterBad = computed(() => { const v = opt(f.water); return v != null && (!Number.isFinite(v) || v < 500 || v > 6000) })
const waterAuto = computed(() => data.value?.water_auto ?? settings.value?.water_auto ?? null)
const opt = (s: string) => s.trim() === '' ? null : Math.round(Number(s.replace(',', '.')))

async function save() {
  if (kcalBad.value || waterBad.value || busy.value) return
  busy.value = true; error.value = ''
  try {
    await $fetch('/api/settings', { method: 'PATCH', body: { kcal_goal: Number(f.kcal), p_goal: opt(f.p), f_goal: opt(f.f), c_goal: opt(f.c), water_goal_ml: opt(f.water) } })
    settings.value = await $fetch<Settings>('/api/settings')
    useState<Record<string, unknown>>('day-cache').value = {}
    toast.show(t('goalsSaved'))
  }
  catch (e) { error.value = errMsg(e, t('somethingWrong')) }
  finally { busy.value = false }
}

// ---------- rating: show me to the others ----------
const showInRating = ref(true)
watch(data, (s) => { if (s) showInRating.value = s.showInRating !== false }, { immediate: true })
const ratingBusy = ref(false)
async function toggleRating() {
  const next = !showInRating.value
  ratingBusy.value = true
  try {
    await $fetch('/api/settings', { method: 'PATCH', body: { show_in_rating: next } })
    showInRating.value = next
    clearNuxtData('rating')
    toast.show(t(next ? 'ratingSettingOn' : 'ratingSettingOff'))
  }
  catch (e) { toast.show(errMsg(e, t('somethingWrong'))) }
  finally { ratingBusy.value = false }
}

// ---------- streak carried over from another app ----------
const sc = reactive({ days: '', until: '' })
watch(data, (s) => { if (s) Object.assign(sc, { days: s.streakCarryDays ? String(s.streakCarryDays) : '', until: s.streakCarryUntil ?? '' }) }, { immediate: true })
const scDays = computed(() => sc.days.trim() === '' ? 0 : Number(sc.days))
const scBad = computed(() => !Number.isInteger(scDays.value) || scDays.value < 0 || scDays.value > 3650 || (scDays.value > 0 && !sc.until) || (!!sc.until && !!settings.value?.today && sc.until > settings.value.today))
const scErr = ref('')
async function saveCarry() {
  if (scBad.value) return
  scErr.value = ''
  try {
    await $fetch('/api/streak-carry', { method: 'PUT', body: { days: scDays.value, until: scDays.value ? sc.until : null } })
    settings.value = await $fetch<Settings>('/api/settings')
    data.value = settings.value
    useState<Record<string, unknown>>('day-cache').value = {}
    toast.show(t('streakCarrySaved'))
  }
  catch (e) { scErr.value = errMsg(e, t('somethingWrong')) }
}

const themePref = useThemePref()
const theme = useTheme()
const snowPref = useSnowPref()

function setLang(p: LangPref) {
  langPref.value = p
  locale.value = resolveLocale(p, navigator.language)
}

// ---------- sign-in: passkeys, password, sessions ----------
interface Account { id: string, login: string, name: string | null, greeting: string, isAdmin: boolean, hasPassword: boolean, passkeys: { id: string, name: string | null, backedUp: boolean, createdAt: string, lastUsedAt: string | null }[] }
const { data: account, refresh: refreshAccount } = await useAsyncData('account', () => requestFetch<Account>('/api/account'))
const { register: registerPasskey, isSupported: passkeysSupported } = useWebAuthn({ registerEndpoint: '/api/webauthn/register' })
const signErr = ref('')
const pkBusy = ref(false)
function deviceName() {
  const ua = navigator.userAgent
  const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : ''
  return os || t('passkey')
}
async function addPasskey() {
  signErr.value = ''; pkBusy.value = true
  try {
    // the server takes the user from the session; userName is only required by the protocol helper
    await registerPasskey({ userName: account.value?.login ?? 'me', name: deviceName() } as any)
    await refreshAccount()
    toast.show(t('passkeyAdded'))
  }
  catch (e: any) {
    if (e?.name === 'InvalidStateError') signErr.value = t('passkeyExists')
    else if (e?.name !== 'NotAllowedError' && e?.name !== 'AbortError') signErr.value = errMsg(e, t('somethingWrong'))
  }
  finally { pkBusy.value = false }
}
async function delPasskey(id: string) {
  signErr.value = ''
  try { await $fetch(`/api/account/passkeys/${encodeURIComponent(id)}`, { method: 'DELETE' }); await refreshAccount() }
  catch (e) { signErr.value = errMsg(e, t('somethingWrong')) }
}
const pw = reactive({ current: '', next: '' })
const pwBad = computed(() => pw.next.trim().length < 8 || (!!account.value?.hasPassword && !pw.current))
async function changePassword() {
  if (pwBad.value) return
  signErr.value = ''
  try {
    await $fetch('/api/account/password', { method: 'POST', body: { current: pw.current || undefined, next: pw.next } })
    Object.assign(pw, { current: '', next: '' })
    await refreshAccount()
    toast.show(t('passwordChanged'))
  }
  catch (e) { signErr.value = errMsg(e, t('somethingWrong')) }
}
async function logoutOthers() {
  signErr.value = ''
  try { await $fetch('/api/account/logout-others', { method: 'POST' }); toast.show(t('loggedOutOthers')) }
  catch (e) { signErr.value = errMsg(e, t('somethingWrong')) }
}
const shortDate = (d: string | null) => d ? new Date(d).toLocaleDateString(intlTag[locale.value], { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

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

const nf = (n: number) => n.toLocaleString(intlTag[locale.value])
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
      <label class="line">
        <span class="ll"><i class="dot w" />{{ t('waterGoal') }} <small>{{ t('waterGoalEmpty') }}</small></span>
        <span class="iv"><input v-model="f.water" class="input num" inputmode="numeric" :placeholder="waterAuto ? String(waterAuto.ml) : '—'" :aria-invalid="waterBad"><span class="u">{{ t('ml') }}</span></span>
      </label>
      <p v-if="waterAuto" class="hint">{{ t(`waterBasis_${waterAuto.basis}` as MsgKey, { ml: waterAuto.ml }) }} {{ t('waterTrainingDay', { ml: waterAuto.training_day_extra_ml }) }}</p>
      <p v-if="error" class="err">{{ error }}</p>
      <button type="submit" class="btn btn-primary btn-block" :disabled="busy || kcalBad || waterBad">{{ t('save') }}</button>
    </form>

    <section id="rating" class="card group">
      <h2 class="section-title">{{ t('ratingSettingTitle') }}</h2>
      <div class="line">
        <span id="rating-label" class="ll">{{ t('ratingSettingLabel') }}</span>
        <button type="button" role="switch" class="switch" :aria-checked="showInRating" aria-labelledby="rating-label" :disabled="ratingBusy" @click="toggleRating"><span /></button>
      </div>
      <p class="hint">{{ t('ratingSettingHint') }}</p>
    </section>

    <DiaryAccess />

    <form class="card group" @submit.prevent="saveCarry">
      <h2 class="section-title">{{ t('streakTitle') }}</h2>
      <p class="hint">{{ t('streakNote') }}</p>
      <p class="ll">{{ t('streakCarry') }}</p>
      <label class="line">
        <span class="ll">{{ t('streakCarryDays') }}</span>
        <span class="iv"><input v-model="sc.days" class="input num" inputmode="numeric" placeholder="0" :aria-invalid="scBad && sc.days !== ''"></span>
      </label>
      <label class="line">
        <span class="ll">{{ t('streakCarryUntil') }}</span>
        <span class="iv"><input v-model="sc.until" class="input date" type="date" :max="settings?.today"></span>
      </label>
      <p class="hint">{{ t('streakCarryHint') }}</p>
      <p v-if="scErr" class="err">{{ scErr }}</p>
      <button type="submit" class="btn btn-block" :disabled="scBad">{{ t('save') }}</button>
    </form>

    <section id="signin" class="card group">
      <h2 class="section-title">{{ t('signInTitle') }}</h2>
      <p class="hint">{{ t('yourLogin') }}: <b>{{ account?.login }}</b></p>
      <p class="ll">{{ t('passkeys') }}</p>
      <p class="hint">{{ passkeysSupported ? t('passkeysNote') : t('passkeysUnsupported') }}</p>
      <div v-for="k in account?.passkeys ?? []" :key="k.id" class="line">
        <span class="ml"><b>{{ k.name || t('passkey') }}</b><small>{{ t('passkeyAddedOn', { date: shortDate(k.createdAt) }) }} · {{ t('passkeyUsedOn', { date: shortDate(k.lastUsedAt) }) }}</small></span>
        <button type="button" class="icon-btn" :aria-label="`${t('delete')} ${k.name || t('passkey')}`" @click="delPasskey(k.id)"><Icon name="trash" :size="18" /></button>
      </div>
      <button v-if="passkeysSupported" type="button" class="btn btn-block" :disabled="pkBusy" @click="addPasskey">{{ t('passkeyAdd') }}</button>
      <form class="pref" @submit.prevent="changePassword">
        <p class="ll">{{ account?.hasPassword ? t('changePassword') : t('setPassword') }}</p>
        <input type="text" name="username" autocomplete="username" :value="account?.login" hidden>
        <input v-if="account?.hasPassword" v-model="pw.current" class="input" type="password" autocomplete="current-password" :placeholder="t('currentPassword')">
        <input v-model="pw.next" class="input" type="password" autocomplete="new-password" :placeholder="t('newPassword')">
        <p class="hint">{{ t('passwordMin') }} {{ t('passwordOthersOut') }}</p>
        <button type="submit" class="btn" :disabled="pwBad">{{ t('savePassword') }}</button>
      </form>
      <button type="button" class="btn btn-block" @click="logoutOthers">{{ t('logoutOthers') }}</button>
      <NuxtLink v-if="account?.isAdmin" to="/users" class="btn btn-block plain">{{ t('usersTitle') }}</NuxtLink>
      <p v-if="signErr" class="err" role="alert">{{ signErr }}</p>
    </section>

    <section class="card group">
      <h2 class="section-title">{{ t('appearance') }}</h2>
      <div class="seg" role="group" :aria-label="t('appearance')">
        <button type="button" :aria-pressed="theme === 'classic'" @click="themePref = 'classic'">{{ t('themeClassic') }}</button>
        <button type="button" :aria-pressed="theme === 'newyear'" @click="themePref = 'newyear'">🎄 {{ t('themeNewYear') }}</button>
      </div>
      <template v-if="theme === 'newyear'">
        <div class="line">
          <span id="snow-label" class="ll">{{ t('snowLabel') }}</span>
          <button type="button" role="switch" class="switch" :aria-checked="snowPref === 'on'" aria-labelledby="snow-label" @click="snowPref = snowPref === 'on' ? 'off' : 'on'"><span /></button>
        </div>
        <p class="hint">{{ t('snowHint') }}</p>
      </template>
    </section>

    <section class="card group">
      <h2 class="section-title">{{ t('language') }}</h2>
      <div class="seg" role="group" :aria-label="t('language')">
        <button type="button" :aria-pressed="langPref === 'auto'" @click="setLang('auto')">{{ t('langAuto') }}</button>
        <button type="button" :aria-pressed="langPref === 'ru'" lang="ru" aria-label="Русский" title="Русский" @click="setLang('ru')">Рус</button>
        <button type="button" :aria-pressed="langPref === 'uk'" lang="uk" aria-label="Українська" title="Українська" @click="setLang('uk')">Укр</button>
        <button type="button" :aria-pressed="langPref === 'en'" lang="en" aria-label="English" title="English" @click="setLang('en')">Eng</button>
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

    <p class="attribution about">{{ t('appName') }} · {{ t('signedInAs', { name: account?.login ?? (user as any)?.id ?? '' }) }} · {{ locale }} · {{ t('offAttribution') }}</p>
  </div>
</template>

<style scoped>
.settings { display: grid; gap: var(--s-4); }
.top { display: flex; align-items: center; gap: var(--s-2); padding-top: var(--s-2); min-height: 56px; margin-left: calc(-1 * var(--s-2)); }
.top h1 { font-size: var(--fs-2xl); font-weight: var(--fw-black); letter-spacing: -0.025em; }
.group { padding: var(--s-4) var(--s-4) var(--s-5); display: grid; gap: var(--s-3); }
.line { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); min-height: 52px; }
.line + .line { border-top: 1px solid var(--line); padding-top: var(--s-2); }
.ll { display: flex; align-items: center; gap: 6px; font-weight: var(--fw-regular); flex-wrap: wrap; }
.ll small { color: var(--ink-3); font-weight: var(--fw-regular); font-size: var(--fs-xs); width: 100%; padding-left: 14px; }
.iv { display: flex; align-items: center; gap: 6px; }
.iv .input { width: 88px; text-align: right; min-height: 44px; }
.iv .input.date { width: auto; text-align: left; }
.input[aria-invalid='true'] { border-color: var(--danger); }
.u { width: 2.2em; color: var(--ink-3); font-size: var(--fs-sm); }
.dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.dot.w { background: var(--water); }
.dot.p { background: var(--protein); } .dot.f { background: var(--fat); } .dot.c { background: var(--carbs); }
.hint { font-size: var(--fs-xs); color: var(--ink-2); }
.err { color: var(--danger); font-size: var(--fs-sm); }
.logout { color: var(--danger); background: var(--surface); box-shadow: var(--shadow-1); }
.plain { text-decoration: none; }
.about { text-align: center; }
/* value text only: goal inputs (.input.num) keep --ink and --fs-input */
.line > .num, p.num { font-variant-numeric: tabular-nums; color: var(--ink-2); font-size: var(--fs-sm); text-align: right; }
.tool { min-height: 40px; }
.switch { flex: none; position: relative; width: 48px; height: 28px; border-radius: var(--r-pill); border: 0; padding: 0; background: var(--surface-3); transition: background var(--dur-fast); }
.switch span { position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%; background: var(--surface); box-shadow: 0 1px 3px rgba(0, 0, 0, .25); transition: transform var(--dur-fast) var(--ease); }
.switch[aria-checked='true'] { background: var(--accent); }
.switch[aria-checked='true'] span { transform: translateX(20px); }
.switch:disabled { opacity: .6; }
.pref { display: grid; gap: var(--s-2); }
.pref + .pref { border-top: 1px solid var(--line); padding-top: var(--s-3); }
.ph { display: flex; align-items: center; justify-content: space-between; }
.ph code { font-size: var(--fs-sm); color: var(--ink-2); }
.ta { min-height: 0; height: auto; padding: var(--s-2) var(--s-3); resize: vertical; font: inherit; font-size: var(--fs-input); line-height: 1.4; }
.ml { flex: 1; min-width: 0; display: grid; gap: 2px; }
.ml b { font-weight: var(--fw-book); }
.ml small { color: var(--ink-2); font-size: var(--fs-xs); overflow-wrap: anywhere; }
.tool code { font-size: var(--fs-sm); }
</style>
