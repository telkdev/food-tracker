<template>
  <div class="shell">
    <main class="page">
      <slot />
    </main>
    <TabBar />
  </div>
</template>

<style scoped>
.shell { min-height: 100dvh; }
.page {
  max-width: var(--page-max); margin: 0 auto;
  padding: max(var(--s-3), env(safe-area-inset-top)) max(var(--s-4), env(safe-area-inset-right)) calc(var(--tabbar-h) + env(safe-area-inset-bottom) + var(--s-8)) max(var(--s-4), env(safe-area-inset-left));
}
</style>
