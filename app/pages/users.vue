<script setup lang="ts">
import { errMsg } from '~/utils/format'

// Admin only: add people, send a link to set/reset a password, rename, disable. Never deletes a diary.
interface Row { id: string, login: string, name: string | null, isAdmin: boolean, disabled: boolean, hasPassword: boolean, passkeys: number, invitePending: boolean }
const { t } = useT()
const toast = useToast()
const requestFetch = useRequestFetch()
const { data: rows, refresh, error: loadErr } = await useAsyncData('admin-users', () => requestFetch<Row[]>('/api/admin/users'))

const err = ref('')
const link = ref<{ login: string, url: string } | null>(null)
const nu = reactive({ login: '', name: '' })
const loginBad = computed(() => !/^[a-z0-9_]{1,30}$/.test(nu.login.trim().toLowerCase()))

async function run(fn: () => Promise<unknown>) {
  err.value = ''
  try { await fn(); await refresh() }
  catch (e) { err.value = errMsg(e, t('somethingWrong')) }
}
function showLink(login: string, url: string) {
  link.value = { login, url }
}
async function copyLink() {
  if (!link.value) return
  try {
    if (navigator.share) await navigator.share({ title: t('appName'), text: t('inviteShareText'), url: link.value.url })
    else { await navigator.clipboard.writeText(link.value.url); toast.show(t('copied')) }
  }
  catch {}
}
const add = () => run(async () => {
  if (loginBad.value) return
  const login = nu.login.trim().toLowerCase()
  const r = await $fetch<{ invite: { url: string } }>('/api/admin/users', { method: 'POST', body: { login, name: nu.name.trim() || undefined } })
  Object.assign(nu, { login: '', name: '' })
  showLink(login, r.invite.url)
})
const invite = (u: Row) => run(async () => {
  const url: string = `/api/admin/users/${u.id}/invite`
  const r = await $fetch<{ invite: { url: string } }>(url, { method: 'POST' })
  showLink(u.login, r.invite.url)
})
const patch = (u: Row, body: Record<string, unknown>) => run(() => { const url: string = `/api/admin/users/${u.id}`; return $fetch<{ ok: boolean }>(url, { method: 'PATCH', body }) })
function rename(u: Row) {
  const login = prompt(t('loginName'), u.login)?.trim().toLowerCase()
  if (login && login !== u.login) patch(u, { login })
}
function setName(u: Row) {
  const name = prompt(t('greetingName'), u.name ?? '')
  if (name !== null) patch(u, { name: name.trim() || null })
}
// ---------- connections: pairs who can log into each other's diary ----------
const { data: pairs, refresh: refreshPairs } = await useAsyncData('admin-connections', () => requestFetch<[string, string][]>('/api/admin/connections'))
const cp = reactive({ a: '', b: '' })
const label = (id: string) => { const u = rows.value?.find(r => r.id === id); return u ? (u.name ? `${u.name} (${u.login})` : u.login) : id }
const connectPair = () => run(async () => {
  if (!cp.a || !cp.b || cp.a === cp.b) return
  await $fetch('/api/admin/connections', { method: 'POST', body: { a: cp.a, b: cp.b } })
  Object.assign(cp, { a: '', b: '' })
  await refreshPairs()
})
const disconnectPair = (a: string, b: string) => run(async () => {
  if (!confirm(t('disconnectConfirm', { name: `${label(a)} ↔ ${label(b)}` }))) return
  await $fetch('/api/admin/connections', { method: 'DELETE', query: { a, b } })
  await refreshPairs()
})
useHead({ title: () => `${t('usersTitle')} · ${t('appName')}` })
</script>

<template>
  <div class="users">
    <header class="top">
      <NuxtLink to="/settings" class="icon-btn" :aria-label="t('back')"><Icon name="back" /></NuxtLink>
      <h1>{{ t('usersTitle') }}</h1>
    </header>
    <p v-if="loadErr" class="err">{{ errMsg(loadErr, t('somethingWrong')) }}</p>

    <section v-if="link" class="card group linkbox">
      <h2 class="section-title">{{ t('inviteLinkFor', { name: link.login }) }}</h2>
      <p class="hint">{{ t('inviteLinkNote') }}</p>
      <input class="input" readonly :value="link.url" @focus="($event.target as HTMLInputElement).select()">
      <button type="button" class="btn btn-primary btn-block" @click="copyLink">{{ t('inviteSend') }}</button>
    </section>

    <section class="card group">
      <div v-for="u in rows ?? []" :key="u.id" class="user" :class="{ off: u.disabled }">
        <div class="uh">
          <b>{{ u.login }}</b>
          <span class="hint">{{ u.name || '' }}<template v-if="u.isAdmin"> · {{ t('admin') }}</template><template v-if="u.disabled"> · {{ t('userDisabled') }}</template></span>
        </div>
        <p class="hint">
          {{ u.hasPassword ? t('hasPassword') : t('noPassword') }} · {{ t('passkeysCount', { n: u.passkeys }) }}<template v-if="u.invitePending"> · {{ t('invitePending') }}</template>
        </p>
        <div class="actions">
          <button type="button" class="btn sm" @click="invite(u)">{{ u.hasPassword ? t('resetLink') : t('inviteLink') }}</button>
          <button type="button" class="btn sm" @click="rename(u)">{{ t('renameLogin') }}</button>
          <button type="button" class="btn sm" @click="setName(u)">{{ t('greetingName') }}</button>
          <button type="button" class="btn sm" @click="patch(u, { logoutEverywhere: true })">{{ t('logoutEverywhere') }}</button>
          <button v-if="!u.isAdmin" type="button" class="btn sm" @click="patch(u, { disabled: !u.disabled })">{{ u.disabled ? t('enableUser') : t('disableUser') }}</button>
        </div>
      </div>
    </section>

    <section class="card group">
      <h2 class="section-title">{{ t('connectedPairs') }}</h2>
      <div v-for="[a, b] in pairs ?? []" :key="`${a}|${b}`" class="pair">
        <span>{{ label(a) }} ↔ {{ label(b) }}</span>
        <button type="button" class="btn sm" @click="disconnectPair(a, b)">{{ t('disconnect') }}</button>
      </div>
      <div class="pick">
        <select v-model="cp.a" class="input"><option value="" disabled>—</option><option v-for="u in rows ?? []" :key="u.id" :value="u.id">{{ label(u.id) }}</option></select>
        <select v-model="cp.b" class="input"><option value="" disabled>—</option><option v-for="u in rows ?? []" :key="u.id" :value="u.id" :disabled="u.id === cp.a">{{ label(u.id) }}</option></select>
      </div>
      <p class="hint">{{ t('connectionsHint') }}</p>
      <button type="button" class="btn" :disabled="!cp.a || !cp.b || cp.a === cp.b" @click="connectPair">{{ t('connectUsers') }}</button>
    </section>

    <form class="card group" @submit.prevent="add">
      <h2 class="section-title">{{ t('addUser') }}</h2>
      <input v-model="nu.login" class="input" :placeholder="t('loginName')" autocapitalize="off" autocomplete="off" spellcheck="false">
      <input v-model="nu.name" class="input" :placeholder="t('greetingName')" autocomplete="off">
      <p class="hint">{{ t('addUserNote') }}</p>
      <button type="submit" class="btn btn-primary" :disabled="loginBad">{{ t('addUser') }}</button>
    </form>
    <p v-if="err" class="err" role="alert">{{ err }}</p>
  </div>
</template>

<style scoped>
.users { display: grid; gap: var(--s-4); }
.top { display: flex; align-items: center; gap: var(--s-2); padding-top: var(--s-2); min-height: 56px; margin-left: calc(-1 * var(--s-2)); }
.top h1 { font-size: var(--fs-2xl); font-weight: var(--fw-black); letter-spacing: -0.02em; }
.group { padding: var(--s-4); display: grid; gap: var(--s-3); }
.user { display: grid; gap: var(--s-1); }
.user + .user { border-top: 1px solid var(--line); padding-top: var(--s-3); }
.user.off { opacity: .6; }
.uh { display: flex; align-items: baseline; gap: var(--s-2); flex-wrap: wrap; }
.actions { display: flex; flex-wrap: wrap; gap: var(--s-2); }
.btn.sm { min-height: 36px; padding: 6px 12px; font-size: var(--fs-sm); }
.hint { font-size: var(--fs-xs); color: var(--ink-2); margin: 0; }
.err { color: var(--danger); font-size: var(--fs-sm); }
.linkbox { border: 1px solid var(--accent); }
.pair { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); }
.pick { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-2); }
</style>
