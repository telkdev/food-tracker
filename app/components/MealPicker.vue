<script setup lang="ts">
import { MEALS, type Meal } from '~/utils/types'
const meal = defineModel<Meal>({ required: true })
const { t } = useT()
</script>

<template>
  <div class="seg" role="group" :aria-label="t('meal')">
    <button v-for="m in MEALS" :key="m" type="button" :aria-pressed="meal === m" @click="meal = m">{{ t(m) }}</button>
  </div>
</template>
