<script setup lang="ts">
definePageMeta({ layout: false })
const { t } = useT()
const login = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)
const show = ref(false)
const { fetch: refreshSession } = useUserSession()
const { authenticate, isSupported } = useWebAuthn({ authenticateEndpoint: '/api/webauthn/authenticate' })

const LAST_LOGIN = 'ft-last-login'
onMounted(() => { try { login.value = localStorage.getItem(LAST_LOGIN) ?? '' } catch {} })

async function done() {
  await refreshSession()
  // back to the OAuth consent screen when Claude sent us here
  const next = String(useRoute().query.next || '')
  if (next.startsWith('/oauth/authorize')) return navigateTo(next, { external: true })
  await navigateTo('/')
}

async function submit() {
  error.value = ''
  busy.value = true
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: { login: login.value, password: password.value } })
    try { localStorage.setItem(LAST_LOGIN, login.value.trim().toLowerCase()) } catch {}
    await done()
  }
  catch (e: any) {
    error.value = e?.data?.statusMessage || t('loginFailed')
  }
  finally { busy.value = false }
}

async function withPasskey() {
  error.value = ''
  busy.value = true
  try {
    await authenticate()
    await done()
  }
  catch (e: any) {
    // the user closed the browser's passkey dialog: not an error worth showing
    if (e?.name !== 'NotAllowedError' && e?.name !== 'AbortError') error.value = e?.data?.statusMessage || t('passkeyFailed')
  }
  finally { busy.value = false }
}
useHead({ title: () => `${t('login')} · ${t('appName')}` })
</script>

<template>
  <main class="login">
    <div class="wrap">
      <div class="brand">
        <img src="/icons/icon.svg" alt="" width="72" height="72" class="logo">
        <h1>{{ t('loginTitle') }}</h1>
        <p class="muted">{{ t('loginSub') }}</p>
      </div>
      <div class="card form">
        <template v-if="isSupported">
          <button class="btn btn-primary btn-block btn-lg" type="button" :disabled="busy" @click="withPasskey">{{ t('passkeyLogin') }}</button>
          <p class="or">{{ t('orPassword') }}</p>
        </template>
        <form class="pwform" @submit.prevent="submit">
          <label class="field">
            <span>{{ t('loginName') }}</span>
            <input
              v-model="login" class="input" autocomplete="username" autocapitalize="off" spellcheck="false" required
              :aria-invalid="!!error" aria-describedby="login-err" enterkeyhint="next"
            >
          </label>
          <label class="field">
            <span>{{ t('password') }}</span>
            <span class="pw">
              <input
                v-model="password" class="input" :type="show ? 'text' : 'password'" autocomplete="current-password" required
                :aria-invalid="!!error" aria-describedby="login-err" enterkeyhint="go"
              >
              <button type="button" class="icon-btn eye" :aria-label="show ? t('hidePassword') : t('showPassword')" :aria-pressed="show" @click="show = !show"><Icon :name="show ? 'eyeOff' : 'eye'" /></button>
            </span>
          </label>
          <p id="login-err" class="err" role="alert">{{ error }}</p>
          <button class="btn btn-block btn-lg" :class="{ 'btn-primary': !isSupported }" type="submit" :disabled="busy || !login.trim() || !password">{{ t('login') }}</button>
        </form>
      </div>
    </div>
  </main>
</template>

<style scoped>
.login {
  min-height: 100dvh; display: grid; place-items: center;
  padding: max(var(--s-6), env(safe-area-inset-top)) var(--s-4) max(var(--s-6), env(safe-area-inset-bottom));
  background: var(--bg);
}
.wrap { width: 100%; max-width: 380px; display: grid; gap: var(--s-6); }
.brand { display: grid; justify-items: center; gap: var(--s-2); text-align: center; }
.logo { border-radius: 20px; box-shadow: none; margin-bottom: var(--s-2); }
.brand h1 { font-size: var(--fs-2xl); font-weight: var(--fw-black); letter-spacing: -0.025em; }
.form { padding: var(--s-6) var(--s-5); display: grid; gap: var(--s-3); }
.pwform { display: grid; gap: var(--s-3); }
.or { text-align: center; color: var(--ink-3); font-size: var(--fs-sm); margin: 0; }
.pw { position: relative; display: block; }
.pw .input { padding-right: 52px; }
.eye { position: absolute; right: 2px; top: 2px; }
.input[aria-invalid='true'] { border-color: var(--danger); }
.err { color: var(--danger); font-size: var(--fs-sm); min-height: 1.2em; margin: 0; }
.err:empty { display: none; }
</style>
