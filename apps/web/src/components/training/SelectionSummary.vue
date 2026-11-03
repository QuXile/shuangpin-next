<script setup lang="ts">
/** 练习场选择卡右上角的统一摘要：已选数量 + 清空。 */
withDefaults(
  defineProps<{
    count: number
    clearTitle?: string
    disabled?: boolean
  }>(),
  { clearTitle: '清空当前选择', disabled: false },
)

const emit = defineEmits<{ clear: [] }>()
</script>

<template>
  <div class="selection-summary">
    <span class="selection-count">已选 {{ count }}</span>
    <button
      class="meta-btn selection-clear"
      type="button"
      :disabled="disabled"
      :title="clearTitle"
      @click="emit('clear')"
    >
      清空
    </button>
  </div>
</template>

<style scoped>
.selection-summary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  min-width: 0;
}
.selection-count {
  color: var(--setup-accent-ink, var(--ink-3));
  font-size: var(--text-xs);
  font-weight: 750;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.selection-clear {
  background: var(--setup-accent-soft, var(--brand-soft));
  color: var(--setup-accent-ink, var(--brand-ink));
}
.selection-clear:hover:not(:disabled) {
  background: var(--setup-accent-line, var(--brand-soft-2));
}
</style>
