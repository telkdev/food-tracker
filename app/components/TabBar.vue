<script setup lang="ts">
const { t } = useT()
const route = useRoute()
const tabs = computed(() => [
  { to: '/', icon: 'today', label: t('tabToday'), active: route.path === '/' },
  { to: '/week', icon: 'week', label: t('tabWeek'), active: route.path.startsWith('/week') },
  { to: '/products', icon: 'products', label: t('tabProducts'), active: route.path.startsWith('/products') },
])
</script>

<template>
  <nav class="tabbar" aria-label="Main">
    <NuxtLink v-for="tab in tabs" :key="tab.to" :to="tab.to" class="tab" :class="{ active: tab.active }" :aria-current="tab.active ? 'page' : undefined">
      <span class="pill"><Icon :name="tab.icon" :size="22" /></span>
      <span class="lbl">{{ tab.label }}</span>
    </NuxtLink>
  </nav>
</template>

<style scoped>
.tabbar {
  position: fixed; z-index: 40; left: 0; right: 0; bottom: 0;
  display: grid; grid-template-columns: repeat(3, 1fr);
  padding: 4px max(var(--s-2), env(safe-area-inset-left)) env(safe-area-inset-bottom) max(var(--s-2), env(safe-area-inset-right));
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  backdrop-filter: saturate(1.4) blur(16px); -webkit-backdrop-filter: saturate(1.4) blur(16px);
  border-top: 1px solid var(--line);
}
.tab {
  display: grid; justify-items: center; align-content: center; gap: 2px; min-height: var(--tabbar-h);
  color: var(--ink-2); text-decoration: none; font-size: var(--fs-2xs); font-weight: var(--fw-medium);
}
.pill { display: grid; place-items: center; width: 56px; height: 30px; border-radius: var(--r-pill); transition: background var(--dur); }
.tab.active { color: var(--ink); font-weight: var(--fw-bold); }
.tab.active .pill { background: var(--accent-soft); color: var(--accent-soft-ink); }
.tab:focus-visible { outline-offset: -4px; border-radius: var(--r-md); }
</style>
