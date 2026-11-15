<script setup lang="ts">
import { errMsg } from '~/utils/format'

// One-time link from the admin: set a first password, or a new one after a reset.
definePageMeta({ layout: false })
const { t } = useT()
const route = useRoute()
const token = String(route.query.token || '')
const { fetch: refreshSession } = useUserSession()

const { data: info, error: loadErr } = await useAsyncData('invite', () => $fetch<{ login: string, greeting: string, reset: boolean }>('/api/invite', { query: { token } }))
const password = ref('')
const show = ref(false)
const busy = ref(false)
const error = ref('')
const tooShort = computed(() => password.value.trim().length < 8)

async function submit() {
  if (tooShort.value) return
  busy.value = true; error.value = ''
  try {
    await $fetch('/api/invite', { method: 'POST', body: { token, password: password.value } })
    try { localStorage.setItem('ft-last-login', info.value!.login) } catch {}
    await refreshSession()
    await navigateTo('/settings#signin')
  }
  catch (e) { error.value = errMsg(e, t('somethingWrong')) }
  finally { busy.value = false }
}
useHead({ title: () => `${t('inviteTitle')} · ${t('appName')}` })
</script>

<template>
  <main class="login">
    <div class="wrap">
      <div class="brand">
        <img src="/icons/icon.svg" alt="" width="72" height="72" class="logo">
        <h1>{{ info ? t('helloName', { name: info.greeting }) : t('inviteTitle') }}</h1>
        <p v-if="info" class="muted">{{ info.reset ? t('inviteReset') : t('inviteNew') }}</p>
      </div>
      <p v-if="loadErr || !info" class="card form err">{{ errMsg(loadErr, t('inviteExpired')) }}</p>
      <form v-else class="card form" @submit.prevent="submit">
        <p class="hint">{{ t('yourLogin') }}: <b>{{ info.login }}</b></p>
        <input type="text" name="username" autocomplete="username" :value="info.login" hidden>
        <label class="field">
          <span>{{ t('newPassword') }}</span>
          <span class="pw">
            <input v-model="password" class="input" :type="show ? 'text' : 'password'" autocomplete="new-password" required minlength="8" autofocus>
            <button type="button" class="icon-btn eye" :aria-label="show ? t('hidePassword') : t('showPassword')" :aria-pressed="show" @click="show = !show"><Icon :name="show ? 'eyeOff' : 'eye'" /></button>
          </span>
        </label>
        <p class="hint">{{ t('passwordMin') }}</p>
        <p v-if="error" class="err" role="alert">{{ error }}</p>
        <button class="btn btn-primary btn-block btn-lg" type="submit" :disabled="busy || tooShort">{{ t('savePassword') }}</button>
      </form>
    </div>
  </main>
</template>

<style scoped>
.login {
  min-height: 100dvh; display: grid; place-items: center;
  padding: max(var(--s-6), env(safe-area-inset-top)) var(--s-4) max(var(--s-6), env(safe-area-inset-bottom));
  background: radial-gradient(120% 60% at 50% -10%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 70%), var(--bg);
}
.wrap { width: 100%; max-width: 380px; display: grid; gap: var(--s-6); }
.brand { display: grid; justify-items: center; gap: var(--s-2); text-align: center; }
.logo { border-radius: 20px; box-shadow: var(--shadow-2); margin-bottom: var(--s-2); }
.brand h1 { font-size: var(--fs-2xl); font-weight: var(--fw-black); letter-spacing: -0.02em; }
.form { padding: var(--s-5); display: grid; gap: var(--s-3); }
.pw { position: relative; display: block; }
.pw .input { padding-right: 52px; }
.eye { position: absolute; right: 2px; top: 2px; }
.hint { font-size: var(--fs-xs); color: var(--ink-2); margin: 0; }
.err { color: var(--danger); font-size: var(--fs-sm); margin: 0; }
</style>
