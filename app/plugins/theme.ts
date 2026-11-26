export default defineNuxtPlugin(() => {
  const pref = useThemePref()
  useHead({ htmlAttrs: { 'data-theme': () => (pref.value === 'newyear' ? 'newyear' : undefined) } })
})
