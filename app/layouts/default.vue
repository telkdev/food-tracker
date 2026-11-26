<script setup lang="ts">
const newYear = useNewYear()
const snow = useSnowPref()
</script>

<template>
  <div class="shell">
    <main class="page">
      <HolidayGarland v-if="newYear" />
      <slot />
    </main>
    <ClientOnly><HolidaySnow3D v-if="newYear && snow === 'on'" /></ClientOnly>
    <TabBar />
  </div>
</template>

<style scoped>
.shell { min-height: 100dvh; }
.page {
  max-width: var(--page-max); margin: 0 auto;
  padding: max(var(--s-4), env(safe-area-inset-top)) max(var(--gutter), env(safe-area-inset-right)) calc(var(--tabbar-h) + env(safe-area-inset-bottom) + var(--s-8)) max(var(--gutter), env(safe-area-inset-left));
}
</style>
