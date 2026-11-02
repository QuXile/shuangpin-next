<script setup lang="ts">
/** 键位图图例：主界面面板与底栏键位图共用的唯一实现（声母蓝 / 韵母橙）。 */
</script>

<template>
  <div class="keymap-legend" aria-hidden="true">
    <span class="legend-item"><i class="legend-dot is-initial" />声母</span>
    <span class="legend-item"><i class="legend-dot is-final" />韵母</span>
  </div>
</template>

<style scoped>
.keymap-legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px 15px;
  color: var(--ink-3);
  font-size: var(--text-xs);
  line-height: 1.4;
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}
.legend-dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: var(--r-xs);
}
.legend-dot.is-initial {
  background: var(--ini);
}
.legend-dot.is-final {
  background: var(--fin);
}
@media (max-width: 640px) {
  .keymap-legend {
    gap: 4px 10px;
    font-size: var(--text-2xs);
  }
}
</style>
