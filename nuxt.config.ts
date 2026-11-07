// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  devtools: { enabled: true },
  modules: ['nuxt-auth-utils'],
  runtimeConfig: {
    // Overridden at runtime by NUXT_APP_PASSWORD. Single-user login until passkeys land (build step 5).
    appPassword: '',
    // Public origin, e.g. https://food-tracker.onrender.com. Falls back to RENDER_EXTERNAL_URL, then the request.
    siteUrl: '',
    // Comma-separated extra https redirect URIs allowed for OAuth clients (Claude's callbacks are built in).
    oauthExtraRedirects: '',
    // Open Food Facts
    offContact: '',
    offBaseUrl: '',
    offSearchUrl: '',
    offBasicAuth: '', // "off:off" for the staging server
  },
  nitro: {
    preset: 'node-server',
  },
  app: {
    head: {
      title: 'Food Tracker',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' }],
    },
  },
})
