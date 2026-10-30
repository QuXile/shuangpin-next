<script setup lang="ts">
/**
 * 训练场统一分组：名称 + 计数 + 全选/反选/全不选 + chips。
 * 三张选择卡片的声母/韵母分组共用此结构，保证排版与测量一致。
 */
defineProps<{
  title: string
  group: 'initial' | 'final'
}>()
</script>

<template>
  <section class="setup-group" :class="`is-${group}`">
    <div class="setup-group-head">
      <strong>{{ title }}</strong>
      <span class="setup-count"><slot name="count" /></span>
      <div class="setup-group-actions"><slot name="actions" /></div>
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
  flex-wrap: wrap;
  gap: 4px 12px;
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
.setup-group-actions {
  display: flex;
  gap: 3px;
  margin-left: auto;
}
.setup-group-actions :slotted(button) {
  padding: 4px 9px;
  border-radius: var(--r-sm);
  color: var(--ink-3);
  font-size: 11px;
  line-height: 1.2;
}
.setup-group-actions :slotted(button:hover) {
  color: var(--brand-ink);
  background: var(--brand-soft);
}
.chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
