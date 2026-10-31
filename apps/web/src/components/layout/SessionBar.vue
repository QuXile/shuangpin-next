<script setup lang="ts">
/**
 * 统一会话顶栏（50px 平铺操作条）：课程练习、入门课、练习场共用。
 * 左/右插槽放操作按钮，中间直接平铺当前场景的数据/文案，不再套「卡中卡」胶囊。
 */
withDefaults(
  defineProps<{
    success?: boolean
  }>(),
  { success: false },
)
</script>

<template>
  <div class="session-bar" :class="{ 'is-success': success }">
    <div class="session-side session-side--left">
      <slot name="left" />
    </div>
    <div class="session-center">
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
  max-width: 1080px;
  width: 100%;
  height: 50px;
  margin: 0 auto 10px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
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
/* 统计直接平铺：与操作条同底色，不再有第二层背景 / 边框 */
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
.session-side :slotted(.session-btn) {
  flex: none;
  height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 9px;
  border-radius: var(--r-control);
  color: var(--ink-3);
  font-size: var(--text-sm);
  font-weight: 600;
  transition: background var(--dur-fast), color var(--dur-fast), transform var(--dur-fast);
}
.session-side :slotted(.session-btn:hover:not(:disabled)) {
  color: var(--ink);
  background: var(--surface-2);
}
.session-side :slotted(.session-btn:active:not(:disabled)) {
  transform: scale(0.96);
}
.session-side :slotted(.session-btn:disabled) {
  opacity: 0.42;
  cursor: not-allowed;
}
.session-side :slotted(.session-icon) {
  width: 14px;
  height: 14px;
}
.session-side :slotted(.session-primary) {
  flex: none;
  height: 34px;
  margin-left: 4px;
  padding: 0 13px;
  font-size: var(--text-sm);
  background: var(--brand-fill);
}
.session-side :slotted(.session-primary:disabled) {
  color: var(--ink-4);
  background: var(--surface-3);
  border-color: var(--line);
  box-shadow: none;
  cursor: not-allowed;
}
.session-side :slotted(.session-primary:disabled kbd) {
  color: var(--ink-4);
  border-color: var(--line);
  background: var(--surface-2);
}
.session-center :slotted(.session-item) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.session-center :slotted(.session-sep) {
  flex: none;
  color: var(--ink-4);
}
.session-center :slotted(.session-danger) {
  color: var(--danger);
}
.session-center :slotted(.session-speed) {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
/* 成功态：绿色渐变操作条 + 绿色主按钮（入门课试打完成 / 阶段达标） */
.session-bar.is-success {
  background: var(--state-success-bg);
  border-color: var(--state-success-line);
  animation: ui-fade-in 240ms var(--ease);
}
.session-bar.is-success .session-center {
  color: var(--state-success-ink);
}
.session-bar.is-success .session-center :slotted(.session-sep) {
  color: color-mix(in srgb, var(--state-success-ink) 52%, transparent);
}
/* 成功条上的次级操作也走通过态浅色悬停，避免深蓝块压在绿底上 */
.session-bar.is-success .session-side :slotted(.session-btn) {
  color: var(--state-success-ink);
}
.session-bar.is-success .session-side :slotted(.session-btn:hover:not(:disabled)) {
  color: var(--state-success-ink);
  background: color-mix(in srgb, var(--state-success-ink) 13%, transparent);
}
.session-bar.is-success .session-side :slotted(.session-primary) {
  background: var(--state-success-fill);
  border-color: transparent;
  color: var(--on-accent);
  box-shadow: 0 2px 0 var(--state-success-fill-hover);
}
.session-bar.is-success .session-side :slotted(.session-primary:hover:not(:disabled)) {
  background: var(--state-success-fill-hover);
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
    font-size: 11.5px;
    line-height: 1.5;
    white-space: normal;
  }
  .session-side :slotted(.session-btn) {
    padding: 0 5px;
    gap: 4px;
    font-size: 11px;
  }
  .session-side :slotted(.session-primary) {
    height: 32px;
    margin-left: 2px;
    padding: 0 10px;
    font-size: 11.5px;
  }
}
</style>
