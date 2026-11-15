// /invite (set a password from a one-time link) works logged out too.
const OPEN = ['/login', '/invite']

export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession()
  if (!loggedIn.value && !OPEN.includes(to.path)) return navigateTo('/login')
  if (loggedIn.value && to.path === '/login') {
    const next = String(to.query.next || '')
    return next.startsWith('/oauth/authorize') ? navigateTo(next, { external: true }) : navigateTo('/')
  }
})
