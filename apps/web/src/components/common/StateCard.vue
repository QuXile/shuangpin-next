<script setup lang="ts">
import Spinner from './Spinner.vue'

withDefaults(
  defineProps<{
    loading?: boolean
    title?: string
    message?: string
  }>(),
  { loading: false, title: '', message: '' },
)
</script>

<template>
  <div class="state-card" role="status" :aria-live="loading ? 'polite' : undefined">
    <Spinner v-if="loading" />
    <h2 v-if="title">{{ title }}</h2>
    <p v-if="message">{{ message }}</p>
    <slot />
  </div>
</template>
