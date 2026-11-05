<script setup lang="ts">
/**
 * 统一会话顶栏（50px 平铺操作条）：课程练习、入门课、练习场共用。
 * 左/右插槽放操作按钮，中间平铺当前场景的数据/文案。
 * 插槽内按钮直接使用 base.css 的 .session-btn / .session-primary 等全局类，
 * 本组件只负责布局与通过态上下文。
 */
withDefaults(
  defineProps<{
    success?: boolean
    pausable?: boolean
    paused?: boolean
  }>(),
  { success: false, pausable: false, paused: false },
)

const emit = defineEmits<{ togglePause: [] }>()
</script>

<template>
  <div class="session-bar" :class="{ 'is-success': success }">
    <div class="session-side session-side--left">
      <slot name="left" />
    </div>
    <button
      v-if="pausable"
      class="session-center session-capsule"
      :class="{ 'is-paused': paused }"
      type="button"
      :aria-label="paused ? '继续练习' : '暂停练习'"
      :aria-pressed="paused"
      :title="paused ? '继续练习 Shift+Space' : '暂停练习 Shift+Space'"
      @click="emit('togglePause')"
    >
      <span class="session-pause-icon" aria-hidden="true">{{ paused ? '▶' : '⏸' }}</span>
      <slot />
      <kbd class="session-capsule-kbd">Shift+Space</kbd>
    </button>
    <div v-else class="session-center">
      <slot />
    </div>
    <div class="session-side session-side--right">
      <slot name="right" />
    </div>
  </div>
</template>

<style scoped>
.session-bar {
  flex: none;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  max-width: var(--content-narrow);
  width: 100%;
  height: 50px;
  margin: 0 auto 10px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: var(--r-card);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  transition: background var(--dur-mid), border-color var(--dur-mid);
}
.session-side {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.session-side--left {
  justify-self: start;
}
.session-side--right {
  justify-self: end;
}
/* 统计直接平铺：与操作条同底色，无第二层背景 / 边框 */
.session-center {
  justify-self: center;
  min-width: 0;
  max-width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  overflow: hidden;
  color: var(--ink-2);
  font-size: var(--text-sm);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.session-capsule {
  padding: 3px 10px 3px 8px;
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  background: var(--surface-2);
  font: inherit;
  cursor: pointer;
  transition: background var(--dur-fast), border-color var(--dur-fast), color var(--dur-fast),
    transform var(--dur-fast);
}
.session-capsule:hover {
  background: var(--surface-3);
}
.session-capsule:active:not(:disabled) {
  transform: scale(0.96);
}
.session-capsule.is-paused {
  border-color: var(--mapping-focus-line);
  background: var(--mapping-focus-soft);
  color: var(--mapping-focus-ink);
}
.session-pause-icon {
  flex: none;
  color: var(--ink-3);
  font-size: var(--text-sm);
  line-height: 1;
}
.session-capsule.is-paused .session-pause-icon {
  color: var(--mapping-focus-ink);
}
.session-capsule-kbd {
  flex: none;
  padding: 0 5px;
  border: 1px solid var(--line);
  border-radius: var(--r-xs);
  background: var(--surface);
  color: var(--ink-4);
  font-size: var(--text-2xs);
  font-weight: 700;
  line-height: 1.6;
}
.session-capsule.is-paused .session-capsule-kbd {
  border-color: var(--mapping-focus-line);
  color: var(--mapping-focus-ink);
}

/* 成功态：绿色渐变操作条 + 绿色主按钮（入门课试打完成 / 阶段达标） */
.session-bar.is-success {
  background: linear-gradient(100deg, var(--success-soft), var(--success-surface));
  border-color: var(--success-line);
  animation: ui-fade-in var(--dur-mid) var(--ease);
}
.session-bar.is-success .session-center {
  color: var(--success-ink);
}
.session-bar.is-success .session-center :slotted(.session-sep) {
  color: color-mix(in srgb, var(--success-ink) 52%, transparent);
}
/* 成功条上的次级操作也走通过态浅色悬停，避免深蓝块压在绿底上 */
.session-bar.is-success .session-side :slotted(.session-btn) {
  color: var(--success-ink);
}
.session-bar.is-success .session-side :slotted(.session-btn:hover:not(:disabled)) {
  color: var(--success-ink);
  background: color-mix(in srgb, var(--success-ink) 13%, transparent);
}
.session-bar.is-success .session-side :slotted(.session-primary) {
  background: var(--success);
  border-color: transparent;
  color: var(--on-accent);
  box-shadow: 0 2px 0 var(--success-strong);
}
.session-bar.is-success .session-side :slotted(.session-primary:hover:not(:disabled)) {
  background: var(--success-strong);
}

@media (max-width: 640px) {
  .session-bar {
    height: auto;
    display: flex;
    flex-wrap: wrap;
    padding: 6px 8px;
    row-gap: 4px;
    column-gap: 6px;
  }
  .session-side--left {
    order: 1;
    flex: 0 0 auto;
  }
  .session-side--right {
    order: 2;
    flex: 0 0 auto;
    margin-left: auto;
  }
  .session-center {
    order: 3;
    flex: 1 1 100%;
    justify-content: center;
    flex-wrap: wrap;
    row-gap: 2px;
    gap: 6px;
    font-size: var(--text-xs);
    line-height: 1.5;
    white-space: normal;
  }
}
</style>
