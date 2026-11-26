export default defineNuxtPlugin(() => {
  const newYear = useNewYear()
  useHead({ htmlAttrs: { 'data-theme': () => (newYear.value ? 'newyear' : undefined) } })
})
