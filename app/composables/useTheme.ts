// Look of the app, kept per device in cookies (no DB): the server renders the right theme on first paint.
export type ThemePref = 'classic' | 'newyear'

const year = 60 * 60 * 24 * 400

export function useThemePref() {
  return useCookie<ThemePref>('theme', { default: () => 'classic', maxAge: year, sameSite: 'lax' })
}

/** Falling snow in the New Year theme. Off also when the system asks for reduced motion. */
export function useSnowPref() {
  return useCookie<'on' | 'off'>('snow', { default: () => 'on', maxAge: year, sameSite: 'lax' })
}

export function useNewYear() {
  const pref = useThemePref()
  return computed(() => pref.value === 'newyear')
}

/** 'eve' in November and December, 'new' from 1 to 14 January, otherwise null (keep the usual greeting). */
export function holidayGreeting(d = new Date()): 'eve' | 'new' | null {
  const m = d.getMonth()
  if (m === 10 || m === 11) return 'eve'
  if (m === 0 && d.getDate() <= 14) return 'new'
  return null
}
