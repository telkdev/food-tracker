<script setup lang="ts">
// Skeleton day view. Entries, totals and meal groups arrive in build step 2.
const { data: settings } = await useFetch('/api/settings')
const { clear } = useUserSession()

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  await navigateTo('/login')
}
</script>

<template>
  <main>
    <header style="display:flex;justify-content:space-between;align-items:center">
      <h1 style="margin:0">Today</h1>
      <button @click="logout">Log out</button>
    </header>
    <p class="muted">{{ settings?.today }} · {{ settings?.timezone }}</p>
    <section class="card">
      <div class="muted">Goal</div>
      <div style="font-size:2rem;font-weight:700">{{ settings?.kcalGoal }} kcal</div>
    </section>
  </main>
</template>
