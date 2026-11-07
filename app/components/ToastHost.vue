<script setup lang="ts">
const { toasts, dismiss } = useToast()
// an Undo only makes sense on the screen where the action happened
const route = useRoute()
watch(() => route.path, () => { for (const t of toasts.value) if (t.action) dismiss(t.id) })
async function act(id: number, run: () => unknown) {
  dismiss(id)
  await run()
}
</script>

<template>
  <div class="toasts" role="status" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="t in toasts" :key="t.id" class="toast">
        <span class="msg">{{ t.message }}</span>
        <button v-if="t.action" class="act" @click="act(t.id, t.action.run)">{{ t.action.label }}</button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed; z-index: 80; left: 0; right: 0;
  bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom) + var(--s-3));
  display: grid; justify-items: center; gap: var(--s-2); padding: 0 var(--s-4); pointer-events: none;
}
.toast {
  pointer-events: auto; display: flex; align-items: center; gap: var(--s-3);
  width: min(100%, 440px); min-height: 52px; padding: var(--s-2) var(--s-2) var(--s-2) var(--s-4);
  border-radius: var(--r-lg); background: var(--ink); color: var(--bg); box-shadow: var(--shadow-2);
  font-size: var(--fs-sm); font-weight: var(--fw-medium);
}
.msg { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.act {
  min-height: var(--tap); padding: 0 var(--s-4); border: 0; border-radius: var(--r-pill);
  background: transparent; color: var(--accent-soft); font-weight: var(--fw-bold); text-transform: uppercase; letter-spacing: .04em; font-size: var(--fs-xs);
}
@media (prefers-color-scheme: dark) { .act { color: var(--accent-ink); } .toast { background: var(--accent); color: var(--accent-ink); } }
.toast-enter-active, .toast-leave-active { transition: transform var(--dur) var(--ease), opacity var(--dur); }
.toast-enter-from, .toast-leave-to { transform: translateY(12px); opacity: 0; }
</style>

<style>
/* with a sheet open the bottom belongs to its buttons: show the toast at the top */
html.sheet-open .toasts { bottom: auto; top: calc(env(safe-area-inset-top) + var(--s-3)); }
</style>
