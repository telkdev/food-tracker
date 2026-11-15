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
  padding: 2px max(var(--s-2), env(safe-area-inset-left)) env(safe-area-inset-bottom) max(var(--s-2), env(safe-area-inset-right));
  background: var(--tabbar-bg);
  backdrop-filter: saturate(1.6) blur(20px); -webkit-backdrop-filter: saturate(1.6) blur(20px);
  border-top: 1px solid var(--line);
}
.tab {
  display: grid; justify-items: center; align-content: center; gap: 2px; min-height: var(--tabbar-h);
  color: var(--ink-3); text-decoration: none; font-size: var(--fs-2xs); font-weight: var(--fw-medium); letter-spacing: .01em;
  transition: color var(--dur-fast);
}
.pill { display: grid; place-items: center; width: 48px; height: 28px; border-radius: var(--r-pill); background: none; }
.tab.active { color: var(--accent); font-weight: var(--fw-bold); }
.tab.active .pill { background: none; color: var(--accent); }
.tab:focus-visible { outline-offset: -4px; border-radius: var(--r-md); }
</style>
