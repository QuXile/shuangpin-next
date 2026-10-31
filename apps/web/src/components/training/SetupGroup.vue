<script setup lang="ts">
/**
 * 训练场统一分组：名称 + 计数 + 全选勾选框 + chips。
 */
withDefaults(
  defineProps<{
    title: string
    group: 'initial' | 'final'
    allChecked?: boolean
    allDisabled?: boolean
  }>(),
  {
    allChecked: false,
    allDisabled: false,
  },
)

const emit = defineEmits<{ toggleAll: [] }>()

function onToggle(event: Event): void {
  const target = event.target as HTMLInputElement
  target.checked = !target.checked
  emit('toggleAll')
}
</script>

<template>
  <section class="setup-group" :class="`is-${group}`">
    <div class="setup-group-head">
      <strong>{{ title }}</strong>
      <span class="setup-count"><slot name="count" /></span>
      <label class="setup-select-all" :class="{ 'is-disabled': allDisabled }">
        <input
          type="checkbox"
          :checked="allChecked"
          :disabled="allDisabled"
          :aria-label="`${title}全选`"
          @change="onToggle"
        />
        <span>全选</span>
      </label>
    </div>
    <div class="chip-list"><slot /></div>
  </section>
</template>

<style scoped>
.setup-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.setup-group-head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 28px;
}
.setup-group-head strong {
  flex: none;
  color: var(--ink-2);
  font-size: 12.5px;
  font-weight: 700;
}
.setup-count {
  min-width: 0;
  color: var(--ink-3);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.setup-select-all {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: none;
  margin-left: auto;
  color: var(--ink-3);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  user-select: none;
}
.setup-select-all input {
  width: 13px;
  height: 13px;
  margin: 0;
  accent-color: var(--brand);
  cursor: pointer;
}
.setup-select-all:hover {
  color: var(--brand-ink);
}
.setup-select-all.is-disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.setup-select-all.is-disabled input {
  cursor: not-allowed;
}
.chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
