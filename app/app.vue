<template>
  <NuxtPage />
</template>

<style>
:root { color-scheme: light dark; --bg: #fff; --fg: #111; --muted: #666; --card: #f4f4f5; --accent: #16a34a; --line: #8883; --warn: #dc2626; }
@media (prefers-color-scheme: dark) { :root { --bg: #0b0b0c; --fg: #f4f4f5; --muted: #9a9aa0; --card: #18181b; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.4 system-ui, -apple-system, sans-serif; }
main { max-width: 480px; margin: 0 auto; padding: max(16px, env(safe-area-inset-top)) 16px 32px; }
.card { background: var(--card); border-radius: 12px; padding: 16px; }
.muted { color: var(--muted); }
button, input { font: inherit; padding: 10px 14px; border-radius: 10px; border: 1px solid #8884; background: var(--card); color: var(--fg); }
button.primary { background: var(--accent); color: #fff; border: 0; }
</style>
