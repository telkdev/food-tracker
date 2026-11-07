<script setup lang="ts">
const MEALS = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner'], ['snack', 'Snack']] as const
const { clear } = useUserSession()

const date = ref<string | undefined>(undefined) // undefined = today on the server (Europe/Warsaw)
const { data: day, refresh, error } = await useFetch('/api/day', { query: { date } })

function shift(days: number) {
  const base = day.value?.date
  if (!base) return
  const d = new Date(`${base}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  date.value = d.toISOString().slice(0, 10)
}

const weekFrom = computed(() => {
  if (!day.value) return ''
  const d = new Date(`${day.value.date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 6)
  return d.toISOString().slice(0, 10)
})
const { data: week, refresh: refreshWeek } = await useFetch('/api/range', {
  query: computed(() => ({ from: weekFrom.value, to: day.value?.date })),
  immediate: false, watch: false,
})
watch(() => day.value?.date, (d) => { if (d) refreshWeek() }, { immediate: true })

const eaten = computed(() => day.value?.totals.kcal ?? 0)
const goal = computed(() => day.value?.goal.kcal ?? 2500)
const C = 2 * Math.PI * 42
const dash = computed(() => `${Math.min(1, eaten.value / goal.value) * C} ${C}`)
const over = computed(() => eaten.value > goal.value)
const fmt = (n: number | null | undefined) => Math.round(n ?? 0).toLocaleString('en-US')
const label = computed(() => day.value ? new Date(`${day.value.date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '')

const deleting = ref<string | null>(null)
async function remove(id: string, name: string) {
  if (deleting.value !== id) { deleting.value = id; return } // second tap confirms
  await $fetch(`/api/entries/${id}`, { method: 'DELETE' })
  deleting.value = null
  await Promise.all([refresh(), refreshWeek()])
}

// entries logged from a Claude chat show up when you come back to the app
onMounted(() => {
  const onVis = () => { if (document.visibilityState === 'visible') { refresh(); refreshWeek() } }
  document.addEventListener('visibilitychange', onVis)
  onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVis))
})

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  await navigateTo('/login')
}

const weekMax = computed(() => Math.max(goal.value * 1.2, ...(week.value?.days ?? []).map(d => d.kcal)))
const weekDays = computed(() => {
  if (!day.value || !weekFrom.value) return []
  const byDate = new Map((week.value?.days ?? []).map(d => [d.date, d]))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${weekFrom.value}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i)
    const iso = d.toISOString().slice(0, 10)
    return { iso, dow: d.toLocaleDateString('en-GB', { weekday: 'narrow', timeZone: 'UTC' }), kcal: byDate.get(iso)?.kcal ?? 0 }
  })
})
</script>

<template>
  <main class="day">
    <header class="bar">
      <button class="icon" aria-label="Previous day" @click="shift(-1)">‹</button>
      <div class="title"><b>{{ label }}</b><button v-if="date" class="link" @click="date = undefined">Today</button></div>
      <button class="icon" aria-label="Next day" @click="shift(1)">›</button>
    </header>

    <p v-if="error" class="err">Couldn't load the day: {{ error.statusMessage || error.message }}</p>

    <template v-if="day">
      <section class="summary">
        <svg viewBox="0 0 100 100" class="ring" role="img" :aria-label="`${fmt(eaten)} of ${fmt(goal)} kcal`">
          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--line)" stroke-width="10" />
          <circle cx="50" cy="50" r="42" fill="none" :stroke="over ? 'var(--warn)' : 'var(--accent)'" stroke-width="10" stroke-linecap="round" transform="rotate(-90 50 50)" :stroke-dasharray="dash" />
        </svg>
        <div>
          <div class="big">{{ fmt(Math.abs(day.remaining_kcal)) }}</div>
          <div class="muted">{{ over ? 'kcal over' : 'kcal left' }} · {{ fmt(eaten) }} / {{ fmt(goal) }}</div>
        </div>
      </section>
      <section class="macros">
        <div>Protein<b>{{ fmt(day.totals.p) }}<small v-if="day.goal.p"> / {{ day.goal.p }}</small> g</b></div>
        <div>Fat<b>{{ fmt(day.totals.f) }}<small v-if="day.goal.f"> / {{ day.goal.f }}</small> g</b></div>
        <div>Carbs<b>{{ fmt(day.totals.c) }}<small v-if="day.goal.c"> / {{ day.goal.c }}</small> g</b></div>
      </section>

      <section v-for="[key, name] in MEALS" :key="key" class="meal">
        <h2><span>{{ name }}</span><span>{{ fmt(day.meals[key].totals.kcal) }} kcal</span></h2>
        <p v-if="!day.meals[key].entries.length" class="muted empty">Nothing logged</p>
        <div v-for="e in day.meals[key].entries" :key="e.id" class="entry">
          <div class="name">{{ e.name }}</div>
          <div class="kcal">{{ fmt(e.kcal) }}</div>
          <div class="meta"><span>{{ e.grams }} g</span><span class="badge" :class="e.source">{{ e.source }}</span><span v-if="e.note" class="note">{{ e.note }}</span></div>
          <button class="del" :class="{ armed: deleting === e.id }" @click="remove(e.id, e.name)">{{ deleting === e.id ? 'Delete?' : '×' }}</button>
        </div>
      </section>

      <section class="week">
        <h2><span>Last 7 days</span><span v-if="week?.avg_kcal_logged_days">avg {{ fmt(week.avg_kcal_logged_days) }}</span></h2>
        <div class="bars">
          <button v-for="d in weekDays" :key="d.iso" class="col" :class="{ cur: d.iso === day.date }" @click="date = d.iso">
            <span class="b" :style="{ height: `${(d.kcal / weekMax) * 100}%` }" :class="{ over: d.kcal > goal, none: !d.kcal }" />
            <span class="goal" :style="{ bottom: `calc(18px + (100% - 18px) * ${goal / weekMax})` }" />
            <small>{{ d.dow }}</small>
          </button>
        </div>
      </section>
    </template>

    <footer class="foot">
      <span class="muted">Product data © Open Food Facts contributors (ODbL)</span>
      <button class="link" @click="logout">Log out</button>
    </footer>
  </main>
</template>

<style scoped>
.day { display: grid; gap: 14px; }
.bar { display: grid; grid-template-columns: 44px 1fr 44px; align-items: center; }
.title { text-align: center; display: grid; justify-items: center; }
.title b { font-size: 1.15rem; }
.icon { font-size: 1.4rem; padding: 4px 0; }
.link { border: 0; background: none; color: var(--accent); padding: 2px 0; font-size: .9rem; cursor: pointer; }
.err { color: var(--warn); }
.summary { display: grid; grid-template-columns: 100px 1fr; gap: 16px; align-items: center; }
.ring { width: 100px; height: 100px; }
.big { font-size: 2.2rem; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; }
.macros { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; color: var(--muted); font-size: .8rem; }
.macros b { display: block; color: var(--fg); font-size: 1rem; font-variant-numeric: tabular-nums; }
.macros small { color: var(--muted); font-weight: 400; }
.meal h2, .week h2 { font-size: .8rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); display: flex; justify-content: space-between; margin: 0 0 6px; }
.meal { display: grid; gap: 6px; }
.empty { margin: 0; font-size: .85rem; }
.entry { display: grid; grid-template-columns: 1fr auto 36px; gap: 2px 10px; align-items: center; background: var(--card); border-radius: 12px; padding: 8px 6px 8px 12px; }
.name { min-width: 0; overflow-wrap: anywhere; }
.kcal { font-weight: 600; font-variant-numeric: tabular-nums; }
.meta { grid-column: 1 / 3; display: flex; gap: 8px; align-items: center; color: var(--muted); font-size: .78rem; flex-wrap: wrap; }
.del { grid-row: 1 / 3; grid-column: 3; padding: 4px; border: 0; background: none; color: var(--muted); font-size: 1.1rem; cursor: pointer; }
.del.armed { color: var(--warn); font-size: .75rem; }
.badge { font-family: ui-monospace, monospace; font-size: .7rem; padding: 1px 6px; border-radius: 6px; background: #16a34a22; color: var(--accent); }
.badge.estimate, .badge.lifesum { background: #d9770622; color: #d97706; }
.note { font-style: italic; }
.bars { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; height: 110px; margin-top: 6px; }
.col { position: relative; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; padding: 0 0 18px; border: 0; background: none; cursor: pointer; }
.col .b { width: 70%; background: var(--accent); border-radius: 6px 6px 2px 2px; min-height: 2px; }
.col .b.over { background: var(--warn); }
.col .b.none { background: var(--line); }
.col .goal { position: absolute; left: 0; right: 0; border-top: 1px dashed var(--muted); }
.col small { position: absolute; bottom: 0; color: var(--muted); }
.col.cur small { color: var(--fg); font-weight: 700; }
.foot .link { white-space: nowrap; }
.foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: .75rem; padding-top: 8px; }
</style>
