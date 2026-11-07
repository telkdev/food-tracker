export interface Toast { id: number, message: string, action?: { label: string, run: () => unknown }, timeout: number }

let seq = 0
const timers = new Map<number, ReturnType<typeof setTimeout>>()

export function useToast() {
  const toasts = useState<Toast[]>('toasts', () => [])
  function dismiss(id: number) {
    clearTimeout(timers.get(id))
    timers.delete(id)
    toasts.value = toasts.value.filter(t => t.id !== id)
  }
  function show(message: string, opts: { action?: Toast['action'], timeout?: number } = {}) {
    const t: Toast = { id: ++seq, message, action: opts.action, timeout: opts.timeout ?? (opts.action ? 6000 : 2600) }
    // one at a time keeps the bottom of the screen calm
    for (const old of toasts.value) dismiss(old.id)
    toasts.value = [...toasts.value, t]
    if (import.meta.client) timers.set(t.id, setTimeout(() => dismiss(t.id), t.timeout))
    return t.id
  }
  return { toasts, show, dismiss }
}
