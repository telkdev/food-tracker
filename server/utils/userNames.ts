/**
 * Display names for the greeting ("Привет, Надя"). Not used for auth.
 * NUXT_USER_NAMES = "owner:Василь,nadia:Надя,dima:Діма" (owner is the NUXT_APP_PASSWORD user).
 * Without an entry a login name is just capitalised (nadia → Nadia); owner (Vasyl) defaults to "Вася".
 */
export function parseUserNames(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of String(raw ?? '').split(',')) {
    const i = part.indexOf(':')
    if (i < 1) continue
    const id = part.slice(0, i).trim().toLowerCase()
    const name = part.slice(i + 1).normalize('NFC').trim().slice(0, 40)
    if (id && name) out[id] = name
  }
  return out
}

export function displayName(uid: string, raw = process.env.NUXT_USER_NAMES): string | null {
  const named = parseUserNames(raw)[uid]
  if (named) return named
  if (uid === 'owner') return 'Вася'
  return uid.charAt(0).toUpperCase() + uid.slice(1)
}
