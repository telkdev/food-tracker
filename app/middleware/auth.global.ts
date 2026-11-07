export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession()
  if (!loggedIn.value && to.path !== '/login') return navigateTo('/login')
  if (loggedIn.value && to.path === '/login') {
    const next = String(to.query.next || '')
    return next.startsWith('/oauth/authorize') ? navigateTo(next, { external: true }) : navigateTo('/')
  }
})
