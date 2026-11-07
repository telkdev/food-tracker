<script setup lang="ts">
const password = ref('')
const error = ref('')
const { fetch: refreshSession } = useUserSession()

async function login() {
  error.value = ''
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: { password: password.value } })
    await refreshSession()
    await navigateTo('/')
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Login failed'
  }
}
</script>

<template>
  <main>
    <h1>Food Tracker</h1>
    <form class="card" style="display:grid;gap:12px" @submit.prevent="login">
      <input v-model="password" type="password" autocomplete="current-password" placeholder="Password">
      <button class="primary" type="submit">Log in</button>
      <p v-if="error" style="color:#dc2626;margin:0">{{ error }}</p>
    </form>
  </main>
</template>
