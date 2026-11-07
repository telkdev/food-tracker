<script setup lang="ts">
/**
 * Modal bottom sheet. Teleported to body, Esc / backdrop / drag-down closes,
 * focus moves in on open and back on close, follows the on-screen keyboard via visualViewport.
 */
const props = withDefaults(defineProps<{ open: boolean, label: string, tall?: boolean }>(), { tall: false })
const emit = defineEmits<{ close: [] }>()

const panel = ref<HTMLElement>()
const kb = ref(0)
const dragY = ref(0)
let returnFocus: HTMLElement | null = null

function onViewport() {
  const vv = window.visualViewport
  if (!vv) return
  kb.value = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.stopPropagation(); emit('close') }
  if (e.key === 'Tab' && panel.value) {
    const f = [...panel.value.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select, textarea, a[href], [tabindex]:not([tabindex="-1"])')].filter(el => el.offsetParent !== null)
    if (!f.length) return
    const first = f[0]!, last = f[f.length - 1]!
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }
}

watch(() => props.open, async (open) => {
  if (!import.meta.client) return
  if (open) {
    returnFocus = document.activeElement as HTMLElement | null
    document.documentElement.classList.add('sheet-open')
    window.visualViewport?.addEventListener('resize', onViewport)
    window.visualViewport?.addEventListener('scroll', onViewport)
    onViewport()
    await nextTick()
    const target = panel.value?.querySelector<HTMLElement>('[autofocus]') ?? panel.value
    target?.focus({ preventScroll: true })
  }
  else {
    document.documentElement.classList.remove('sheet-open')
    window.visualViewport?.removeEventListener('resize', onViewport)
    window.visualViewport?.removeEventListener('scroll', onViewport)
    kb.value = 0
    dragY.value = 0
    returnFocus?.focus?.({ preventScroll: true })
  }
}, { immediate: true })

onBeforeUnmount(() => {
  if (!import.meta.client) return
  document.documentElement.classList.remove('sheet-open')
  window.visualViewport?.removeEventListener('resize', onViewport)
  window.visualViewport?.removeEventListener('scroll', onViewport)
})

// drag the grab handle / header down to dismiss
let startY = 0
let dragging = false
function down(e: PointerEvent) {
  if ((e.target as HTMLElement).closest('button, input, select, textarea, a')) return
  dragging = true; startY = e.clientY
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function move(e: PointerEvent) { if (dragging) dragY.value = Math.max(0, e.clientY - startY) }
function up() {
  if (!dragging) return
  dragging = false
  if (dragY.value > 90) emit('close')
  dragY.value = 0
}
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div v-if="open" class="sheet-root" @keydown="onKey">
        <div class="scrim" @click="emit('close')" />
        <div
          ref="panel" class="panel" :class="{ tall, kbopen: kb > 0 }" role="dialog" aria-modal="true" :aria-label="label" tabindex="-1"
          :style="{ '--kb': `${kb}px`, transform: dragY ? `translateY(${dragY}px)` : undefined, transition: dragY ? 'none' : undefined }"
        >
          <div class="grab" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up">
            <span class="handle" />
            <slot name="header" />
          </div>
          <div class="body">
            <slot />
          </div>
          <div v-if="$slots.footer" class="footer">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sheet-root { position: fixed; inset: 0; z-index: 60; }
.scrim { position: absolute; inset: 0; background: var(--scrim); }
.panel {
  position: absolute; left: 0; right: 0; bottom: var(--kb, 0px);
  margin: 0 auto; width: 100%; max-width: var(--page-max);
  max-height: calc(100dvh - var(--kb, 0px) - max(env(safe-area-inset-top), 12px) - 12px);
  display: flex; flex-direction: column;
  background: var(--surface); border-radius: var(--r-xl) var(--r-xl) 0 0; box-shadow: var(--shadow-sheet);
  transition: transform var(--dur-slow) var(--ease), bottom var(--dur-fast);
  outline: none;
}
.panel.tall { height: calc(100dvh - var(--kb, 0px) - max(env(safe-area-inset-top), 12px) - 12px); }
.grab { flex: none; padding: 8px var(--s-4) 0; touch-action: none; }
.handle { display: block; width: 40px; height: 5px; margin: 0 auto 6px; border-radius: 3px; background: var(--line-strong); }
.body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: var(--s-2) var(--s-4) var(--s-4); -webkit-overflow-scrolling: touch; }
.footer {
  flex: none; padding: var(--s-3) var(--s-4) calc(var(--s-3) + env(safe-area-inset-bottom));
  border-top: 1px solid var(--line); background: var(--surface);
}
.body:last-child { padding-bottom: calc(var(--s-4) + env(safe-area-inset-bottom)); }
.kbopen .footer, .kbopen .body:last-child { padding-bottom: var(--s-3); }

.sheet-enter-active, .sheet-leave-active { transition: opacity var(--dur); }
.sheet-enter-active .panel, .sheet-leave-active .panel { transition: transform var(--dur-slow) var(--ease); }
.sheet-enter-from, .sheet-leave-to { opacity: 0; }
.sheet-enter-from .panel, .sheet-leave-to .panel { transform: translateY(100%); }
</style>

<style>
html.sheet-open, html.sheet-open body { overflow: hidden; }
</style>
