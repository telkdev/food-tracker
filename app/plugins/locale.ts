import { pickLocale } from '~/utils/i18n'

// Server: best guess from Accept-Language (so the first paint is in the right language).
// Client: navigator.language decides once mounted (they almost always agree).
export default defineNuxtPlugin((nuxtApp) => {
  const locale = useLocale()
  const pref = useLangPref()
  if (import.meta.server) {
    const header = useRequestHeaders(['accept-language'])['accept-language']
    locale.value = pref.value === 'auto' ? pickLocale(header) : pref.value
  }
  else {
    nuxtApp.hook('app:mounted', () => {
      const want = resolveLocale(pref.value, navigator.language)
      if (want !== locale.value) locale.value = want
    })
  }
  useHead({ htmlAttrs: { lang: () => locale.value } })
})
