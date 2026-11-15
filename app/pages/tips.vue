<script setup lang="ts">
import type { MsgKey } from '~/utils/i18n'
import type { InsightsData, WeighIn } from '~/utils/insights'
import { errMsg, fmtDate, parseDecimal } from '~/utils/format'

// Rule-based advice from the last 14 days (server/utils/insights.ts). Read-only, except logging weight.
const { t, n, locale } = useT()
const toast = useToast()
const requestFetch = useRequestFetch()
const { data, error, refresh, pending } = await useAsyncData('insights', () => requestFetch<InsightsData>('/api/insights'))

const s = computed(() => data.value?.stats)
const rings = computed(() => {
  const d = data.value
  if (!d || !d.stats.complete_days) return []
  const st = d.stats
  return [
    { k: 'kcal', label: t('tipsAvgKcal'), v: st.avg_kcal ?? 0, max: d.goal.kcal, text: n(st.avg_kcal), sub: t('tipsGoalOf', { n: n(d.goal.kcal) }) },
    { k: 'p', label: t('tipsAvgP'), v: st.avg_p ?? 0, max: st.p_target ?? 0, text: n(st.avg_p), sub: st.p_target != null ? t('tipsGoalOf', { n: n(st.p_target) }) : t('tipsNoGoal') },
    { k: 'days', label: t('tipsDaysOn'), v: st.kcal_ok_days, max: st.complete_days, text: `${st.kcal_ok_days}/${st.complete_days}`, sub: t('tipsDaysOnHint', { n: st.complete_days }) },
  ]
})

const kg = ref('')
const saving = ref(false)
async function logWeight() {
  const v = parseDecimal(kg.value)
  if (!Number.isFinite(v) || v < 30 || v > 300) return
  saving.value = true
  try {
    await $fetch<WeighIn>('/api/weights', { method: 'POST', body: { kg: v } })
    kg.value = ''
    toast.show(t('profileSaved'))
    await refresh()
  }
  catch (e) { toast.show(errMsg(e, t('somethingWrong'))) }
  finally { saving.value = false }
}
const weightDate = (iso: string) => fmtDate(locale.value, iso, { day: 'numeric', month: 'short' })

useHead({ title: () => `${t('tipsTitle')} · ${t('appName')}` })
</script>

<template>
  <div class="tips">
    <header class="top">
      <div>
        <h1>{{ t('tipsTitle') }}</h1>
        <p v-if="data" class="sub">{{ t('tipsWindow', { days: data.stats.window_days, goal: t(`goal_${data.goal_type}` as MsgKey) }) }}</p>
      </div>
      <NuxtLink to="/profile" class="me" :aria-label="t('profileEdit')"><Icon name="person" :size="20" /><span>{{ t('profileEdit') }}</span></NuxtLink>
    </header>

    <div v-if="error" class="card pad">
      <p>{{ t('loadFailed', { msg: error.statusMessage || error.message }) }}</p>
      <button class="btn" @click="refresh()">{{ t('retry') }}</button>
    </div>

    <template v-else-if="data">
      <NuxtLink v-if="!data.profile_done" to="/profile" class="cta card">
        <span class="cta-ic"><Icon name="sparkle" :size="22" /></span>
        <span class="cta-tx">
          <strong>{{ t('profileCta_t') }}</strong>
          <span>{{ t('profileCta_b') }}</span>
        </span>
        <Icon name="right" :size="20" class="chev" />
      </NuxtLink>

      <section v-if="rings.length" class="score card" :class="{ pending }" :aria-label="t('tipsScore')">
        <div v-for="r in rings" :key="r.k" class="sc">
          <ProgressRing :value="r.v" :max="r.max || 1" :size="84" :stroke="6" :label="r.label">
            <span class="rv num">{{ r.text }}</span>
          </ProgressRing>
          <span class="rl">{{ r.label }}</span>
          <span class="rs num">{{ r.sub }}</span>
        </div>
      </section>

      <section class="wt card">
        <div class="wh">
          <span class="wic"><Icon name="scale" :size="20" /></span>
          <div class="wtx">
            <span class="wl">{{ t('weightTitle') }}</span>
            <span v-if="data.weight" class="wv num">{{ n(data.weight.kg, 1) }} <small>{{ t('weightPh') }} · {{ weightDate(data.weight.date) }}</small></span>
            <span v-else class="wv muted">{{ t('weightNone') }}</span>
          </div>
        </div>
        <VizSparkline v-if="data.weights.length > 1" :points="data.weights" :height="48" />
        <form class="wf" @submit.prevent="logWeight">
          <input v-model="kg" class="input num" inputmode="decimal" :placeholder="t('weightPh')" :aria-label="t('weightTitle')">
          <button class="btn btn-primary" :disabled="saving || !kg">{{ t('weightLog') }}</button>
        </form>
      </section>

      <section class="list">
        <InsightCard v-for="i in data.insights" :key="i.id" :i="i" :data="data" />
      </section>

      <p class="muted foot">{{ t('tipsRules') }}</p>
    </template>
  </div>
</template>

<style scoped>
.tips { display: grid; gap: var(--s-4); }
.top { padding-top: var(--s-2); min-height: 56px; display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); }
.top h1 { font-size: var(--fs-2xl); font-weight: var(--fw-black); letter-spacing: -0.025em; }
.sub { font-size: var(--fs-xs); color: var(--ink-2); }
.me { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 12px 0 10px; border-radius: var(--r-pill); background: var(--accent-soft); color: var(--accent-soft-ink); text-decoration: none; font-size: var(--fs-sm); font-weight: var(--fw-medium); white-space: nowrap; }
.pad { padding: var(--s-4); display: grid; gap: var(--s-3); justify-items: start; }

.cta { display: flex; align-items: center; gap: var(--s-3); padding: var(--s-4); text-decoration: none; color: var(--ink); background: var(--accent-soft); border-color: transparent; }
.cta-ic { flex: none; width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; background: var(--accent); color: var(--accent-ink); }
.cta-tx { flex: 1; min-width: 0; display: grid; gap: 2px; }
.cta-tx strong { font-weight: var(--fw-bold); font-size: var(--fs-md); color: var(--accent-soft-ink); }
.cta-tx span { font-size: var(--fs-xs); color: var(--ink-2); }
.chev { color: var(--accent-soft-ink); }

.score { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s-2); padding: var(--s-4) var(--s-2); transition: opacity var(--dur); }
.score.pending { opacity: .6; }
.sc { display: grid; justify-items: center; gap: 4px; text-align: center; min-width: 0; }
.rv { font-size: var(--fs-md); font-weight: var(--fw-medium); letter-spacing: -0.02em; }
.rl { font-size: var(--fs-xs); color: var(--ink); margin-top: 4px; }
.rs { font-size: var(--fs-2xs); color: var(--ink-3); }

.wt { padding: var(--s-3) var(--s-4); display: grid; gap: var(--s-3); }
.wh { display: flex; align-items: center; gap: var(--s-3); }
.wic { flex: none; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; background: var(--surface-2); color: var(--ink-2); }
.wtx { flex: 1; min-width: 0; display: grid; }
.wl { font-size: var(--fs-xs); color: var(--ink-3); }
.wv { font-size: var(--fs-xl); font-weight: var(--fw-regular); letter-spacing: -0.02em; white-space: nowrap; }
.wv small { font-size: var(--fs-xs); color: var(--ink-3); letter-spacing: 0; }
.wf { display: flex; gap: var(--s-2); }
.wf .input { flex: 1; min-width: 0; min-height: 40px; text-align: center; }
.wf .btn { white-space: nowrap; min-height: 40px; padding: 0 14px; }

.list { display: grid; gap: var(--s-3); }
.foot { text-align: center; font-size: var(--fs-xs); padding-bottom: var(--s-4); }
</style>
