// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  devtools: { enabled: true },
  modules: ['nuxt-auth-utils'],
  css: ['@fontsource-variable/onest', '~/assets/css/tokens.css', '~/assets/css/base.css'],
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
    routeRules: {
      '/sw.js': { headers: { 'cache-control': 'no-cache', 'service-worker-allowed': '/' } },
      '/manifest.webmanifest': { headers: { 'content-type': 'application/manifest+json', 'cache-control': 'public, max-age=3600' } },
    },
  },
  app: {
    head: {
      title: 'Food Tracker',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content' },
        { name: 'theme-color', content: '#f4f1e9', media: '(prefers-color-scheme: light)' },
        { name: 'theme-color', content: '#12110f', media: '(prefers-color-scheme: dark)' },
        { name: 'color-scheme', content: 'light dark' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
        { name: 'apple-mobile-web-app-title', content: 'Food' },
        { name: 'format-detection', content: 'telephone=no' },
      ],
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'icon', type: 'image/svg+xml', href: '/icons/icon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/icons/favicon-32.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/icons/apple-touch-icon.png' },
      ],
    },
  },
})
