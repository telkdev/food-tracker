<script setup lang="ts">
definePageMeta({ layout: false })
const { t } = useT()
const password = ref('')
const error = ref('')
const busy = ref(false)
const show = ref(false)
const { fetch: refreshSession } = useUserSession()

async function login() {
  error.value = ''
  busy.value = true
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: { password: password.value } })
    await refreshSession()
    // back to the OAuth consent screen when Claude sent us here
    const next = String(useRoute().query.next || '')
    if (next.startsWith('/oauth/authorize')) return navigateTo(next, { external: true })
    await navigateTo('/')
  }
  catch (e: any) {
    error.value = e?.data?.statusMessage || t('loginFailed')
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
      <form class="card form" @submit.prevent="login">
        <label class="field">
          <span>{{ t('password') }}</span>
          <span class="pw">
            <input
              v-model="password" class="input" :type="show ? 'text' : 'password'" autocomplete="current-password" autofocus required
              :aria-invalid="!!error" aria-describedby="login-err" enterkeyhint="go"
            >
            <button type="button" class="icon-btn eye" :aria-label="show ? t('hidePassword') : t('showPassword')" :aria-pressed="show" @click="show = !show"><Icon :name="show ? 'eyeOff' : 'eye'" /></button>
          </span>
        </label>
        <p id="login-err" class="err" role="alert">{{ error }}</p>
        <button class="btn btn-primary btn-block btn-lg" type="submit" :disabled="busy || !password">{{ t('login') }}</button>
      </form>
    </div>
  </main>
</template>

<style scoped>
.login {
  min-height: 100dvh; display: grid; place-items: center;
  padding: max(var(--s-6), env(safe-area-inset-top)) var(--s-4) max(var(--s-6), env(safe-area-inset-bottom));
  background:
    radial-gradient(120% 60% at 50% -10%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 70%),
    var(--bg);
}
.wrap { width: 100%; max-width: 380px; display: grid; gap: var(--s-6); }
.brand { display: grid; justify-items: center; gap: var(--s-2); text-align: center; }
.logo { border-radius: 20px; box-shadow: var(--shadow-2); margin-bottom: var(--s-2); }
.brand h1 { font-size: var(--fs-2xl); font-weight: var(--fw-black); letter-spacing: -0.02em; }
.form { padding: var(--s-5); display: grid; gap: var(--s-3); }
.pw { position: relative; display: block; }
.pw .input { padding-right: 52px; }
.eye { position: absolute; right: 2px; top: 2px; }
.input[aria-invalid='true'] { border-color: var(--danger); }
.err { color: var(--danger); font-size: var(--fs-sm); min-height: 1.2em; margin: 0; }
.err:empty { display: none; }
</style>
