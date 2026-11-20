export interface Connection { id: string, login: string, name: string, can_log: boolean, can_edit: boolean }

/** Diaries shared with me (I may open them on Today). Cached for the session. */
export function useConnections() {
  const items = useState<Connection[]>('connections', () => [])
  const loaded = useState<boolean>('connections-loaded', () => false)
  async function load(force = false) {
    if (loaded.value && !force) return items.value
    try {
      items.value = await $fetch<Connection[]>('/api/connections')
      loaded.value = true
    }
    catch { /* the switcher just stays hidden */ }
    return items.value
  }
  const nameOf = (id: string | null | undefined) => (id ? items.value.find(c => c.id === id)?.name ?? id : '')
  return { items, loaded, load, nameOf }
}

/** Whose diary the Today screen shows: `/?for=<user id>`; null = my own. */
export function useDiaryFor() {
  const route = useRoute()
  return computed(() => (route.path === '/' && typeof route.query.for === 'string' && /^[a-z0-9_]{1,30}$/.test(route.query.for) ? route.query.for : null))
}
