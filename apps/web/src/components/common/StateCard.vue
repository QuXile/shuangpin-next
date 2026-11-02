<script setup lang="ts">
/** 统一状态卡：加载 / 错误 / 空态，inline 变体供页面局部使用。 */
withDefaults(
  defineProps<{
    loading?: boolean
    title?: string
    message?: string
    variant?: 'page' | 'inline' | 'error'
  }>(),
  { loading: false, title: '', message: '', variant: 'page' },
)
</script>

<template>
  <div
    :class="variant === 'page' ? 'state-card' : ['inline-state', `is-${variant}`]"
    role="status"
    :aria-live="loading ? 'polite' : undefined"
  >
    <div v-if="loading" class="spinner" aria-hidden="true" />
    <h2 v-if="title">{{ title }}</h2>
    <p v-if="message">{{ message }}</p>
    <slot />
  </div>
</template>

<style scoped>
.inline-state {
  padding: 16px 18px;
  border: 1px solid var(--line);
  border-radius: var(--r-card);
  background: var(--surface-2);
  color: var(--ink-3);
  font-size: var(--text-sm);
  line-height: 1.6;
}
.inline-state h2 {
  margin-bottom: 4px;
  color: var(--ink);
  font-size: var(--text-md);
  font-weight: 750;
}
.inline-state.is-error {
  border-color: var(--danger-line);
  border-radius: var(--r-panel);
  background: var(--danger-soft);
  color: var(--danger);
}
.inline-state.is-error h2 {
  color: var(--danger);
}
</style>
