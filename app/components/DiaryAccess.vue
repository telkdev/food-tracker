<script setup lang="ts">
import { errMsg } from '~/utils/format'

// Settings → Diary access. The diary's owner decides who may keep it and with which rights;
// others can ask, and can leave. Server rules: server/utils/connections.ts.
interface Person { id: string, login: string, name: string }
interface Row extends Person { status: 'active' | 'requested', can_log: boolean, can_edit: boolean }
interface Overview { granted: Row[], mine: Row[], users: Person[] }

const { t } = useT()
const toast = useToast()
const conns = useConnections()
const data = ref<Overview | null>(null)
const busy = ref(false)

async function load() {
  try { data.value = await $fetch<Overview>('/api/access') }
  catch (e) { toast.show(errMsg(e, t('somethingWrong'))) }
}
onMounted(load)

async function run(fn: () => Promise<unknown>, done?: string) {
  if (busy.value) return
  busy.value = true
  try {
    await fn()
    await Promise.all([load(), conns.load(true)])
    if (done) toast.show(done)
  }
  catch (e) { toast.show(errMsg(e, t('somethingWrong'))) }
  finally { busy.value = false }
}

const enc = encodeURIComponent
// typed as plain strings: Nuxt's route typing of template URLs overflows the checker
const url = (s: string): string => s
const put = (id: string, can_log: boolean, can_edit: boolean) => $fetch<{ ok: boolean }>(url(`/api/access/granted/${enc(id)}`), { method: 'PUT', body: { can_log, can_edit } })

// ---- my diary: who keeps it ----
const active = computed(() => data.value?.granted.filter(r => r.status === 'active') ?? [])
const requests = computed(() => data.value?.granted.filter(r => r.status === 'requested') ?? [])
function toggle(r: Row, key: 'can_log' | 'can_edit') {
  const next = { can_log: r.can_log, can_edit: r.can_edit, [key]: !r[key] }
  if (!next.can_log && !next.can_edit) { toast.show(t('accessPickOne')); return }
  run(() => put(r.id, next.can_log, next.can_edit))
}
const approve = (r: Row) => run(() => put(r.id, true, false), t('accessGranted', { name: r.name }))
const revoke = (r: Row) => {
  if (r.status === 'active' && !confirm(t('accessRevokeConfirm', { name: r.name }))) return
  run(() => $fetch<{ ok: boolean }>(url(`/api/access/granted/${enc(r.id)}`), { method: 'DELETE' }))
}
const give = reactive({ id: '', can_log: true, can_edit: false })
const giveOptions = computed(() => data.value?.users.filter(u => !data.value!.granted.some(g => g.id === u.id && g.status === 'active')) ?? [])
const grant = () => run(async () => {
  if (!give.id) return
  const name = data.value?.users.find(u => u.id === give.id)?.name ?? ''
  await put(give.id, give.can_log, give.can_edit)
  Object.assign(give, { id: '', can_log: true, can_edit: false })
  toast.show(t('accessGranted', { name }))
})

// ---- diaries I keep ----
const askId = ref('')
const askOptions = computed(() => data.value?.users.filter(u => !data.value!.mine.some(m => m.id === u.id)) ?? [])
const ask = () => run(async () => {
  if (!askId.value) return
  await $fetch<{ ok: boolean }>(url(`/api/access/requests/${enc(askId.value)}`), { method: 'POST' })
  askId.value = ''
}, t('accessAsked'))
const leave = (r: Row) => {
  if (r.status === 'active' && !confirm(t('accessLeaveConfirm', { name: r.name }))) return
  run(() => $fetch<{ ok: boolean }>(url(`/api/access/mine/${enc(r.id)}`), { method: 'DELETE' }))
}
const rightsText = (r: Row) => [r.can_log ? t('accessLog') : '', r.can_edit ? t('accessEdit') : ''].filter(Boolean).join(', ')
</script>

<template>
  <section id="access" class="card group access">
    <h2 class="section-title">{{ t('accessTitle') }}</h2>
    <p class="hint">{{ t('accessHint') }}</p>

    <template v-if="data">
      <h3 class="sub">{{ t('accessMyDiary') }}</h3>
      <div v-for="r in requests" :key="`q-${r.id}`" class="row req">
        <span class="who"><b>{{ r.name }}</b> {{ t('accessAsks') }}</span>
        <span class="acts">
          <button type="button" class="btn sm btn-primary" :disabled="busy" @click="approve(r)">{{ t('accessAllow') }}</button>
          <button type="button" class="btn sm" :disabled="busy" @click="revoke(r)">{{ t('accessDecline') }}</button>
        </span>
      </div>
      <div v-for="r in active" :key="`g-${r.id}`" class="row">
        <span class="who"><b>{{ r.name }}</b></span>
        <span class="checks">
          <label><input type="checkbox" :checked="r.can_log" :disabled="busy" @change="toggle(r, 'can_log')"> {{ t('accessLog') }}</label>
          <label><input type="checkbox" :checked="r.can_edit" :disabled="busy" @change="toggle(r, 'can_edit')"> {{ t('accessEdit') }}</label>
        </span>
        <button type="button" class="btn sm" :disabled="busy" @click="revoke(r)">{{ t('accessRevoke') }}</button>
      </div>
      <p v-if="!active.length && !requests.length" class="hint">{{ t('accessNobody') }}</p>

      <form v-if="giveOptions.length" class="add" @submit.prevent="grant">
        <select v-model="give.id" class="input" :aria-label="t('accessGive')">
          <option value="" disabled>{{ t('accessGivePick') }}</option>
          <option v-for="u in giveOptions" :key="u.id" :value="u.id">{{ u.name }}</option>
        </select>
        <span class="checks">
          <label><input v-model="give.can_log" type="checkbox"> {{ t('accessLog') }}</label>
          <label><input v-model="give.can_edit" type="checkbox"> {{ t('accessEdit') }}</label>
        </span>
        <button type="submit" class="btn" :disabled="busy || !give.id || (!give.can_log && !give.can_edit)">{{ t('accessGive') }}</button>
      </form>

      <h3 class="sub">{{ t('accessOthers') }}</h3>
      <div v-for="r in data.mine" :key="`m-${r.id}`" class="row">
        <span class="who"><b>{{ r.name }}</b> <span class="hint">· {{ r.status === 'active' ? rightsText(r) : t('accessPending') }}</span></span>
        <button type="button" class="btn sm" :disabled="busy" @click="leave(r)">{{ r.status === 'active' ? t('accessLeave') : t('accessCancel') }}</button>
      </div>
      <p v-if="!data.mine.length" class="hint">{{ t('accessNone') }}</p>
      <form v-if="askOptions.length" class="add" @submit.prevent="ask">
        <select v-model="askId" class="input" :aria-label="t('accessAsk')">
          <option value="" disabled>{{ t('accessAskPick') }}</option>
          <option v-for="u in askOptions" :key="u.id" :value="u.id">{{ u.name }}</option>
        </select>
        <button type="submit" class="btn" :disabled="busy || !askId">{{ t('accessAsk') }}</button>
      </form>
    </template>
  </section>
</template>

<style scoped>
.sub { margin: var(--s-3) 0 0; font-size: var(--fs-sm); font-weight: var(--fw-medium); color: var(--ink-2); }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-2) var(--s-3); padding: var(--s-2) 0; border-top: var(--hair) solid var(--line); }
.row .who { flex: 1 1 100%; min-width: 0; }
.row.req .who { flex: 1 1 auto; }
.acts { display: flex; gap: var(--s-2); }
.checks { flex: 1; display: flex; flex-wrap: wrap; gap: var(--s-1) var(--s-4); font-size: var(--fs-sm); }
.checks label { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; }
.checks input { width: 18px; height: 18px; accent-color: var(--accent); }
.add { display: grid; gap: var(--s-2); padding-top: var(--s-2); border-top: var(--hair) solid var(--line); }
</style>
