<script setup lang="ts">
/**
 * 统一会话顶栏：课程练习、入门课、训练场共用。
 * 左/右插槽放操作按钮，中间胶囊放当前场景的数据/文案。
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
      <div class="session-pill"><slot /></div>
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
  gap: 10px;
  max-width: 960px;
  width: 100%;
  height: 48px;
  margin: 0 auto 8px;
  padding: 7px 10px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
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
.session-center {
  justify-self: center;
  min-width: 0;
  max-width: 100%;
}
.session-pill {
  min-width: 0;
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 13px;
  border: 1px solid var(--line-faint);
  border-radius: var(--r-pill);
  background: var(--surface-2);
  color: var(--ink);
  font-size: 12.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.session-side :slotted(.session-btn) {
  flex: none;
  height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 8px 0 5px;
  border-radius: var(--r-sm);
  color: var(--ink-3);
  font-size: 11px;
  font-weight: 600;
}
.session-side :slotted(.session-btn:hover:not(:disabled)) {
  color: var(--ink);
  background: var(--surface-2);
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
  height: 32px;
  margin-left: 4px;
  padding: 0 12px;
  font-size: 12px;
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
.session-pill :slotted(.session-item) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.session-pill :slotted(.session-sep) {
  flex: none;
  color: var(--ink-4);
}
.session-pill :slotted(.session-danger) {
  color: var(--danger);
}
.session-pill :slotted(.session-speed) {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.session-bar.is-success {
  background: var(--state-success-bg);
  border-color: var(--state-success-line);
}
.session-bar.is-success .session-pill {
  background: var(--surface);
  border-color: var(--state-success-line);
}
.session-side :slotted(.session-primary) {
  background: var(--brand);
}
.session-bar.is-success .session-side :slotted(.session-primary) {
  background: var(--state-success-fill);
  border-color: var(--state-success-fill);
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
    padding: 7px 8px;
    row-gap: 6px;
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
    display: flex;
    justify-content: center;
  }
  .session-pill {
    justify-content: center;
    padding: 5px 10px;
    font-size: 12px;
  }
  .session-side :slotted(.session-btn) {
    padding: 0 4px;
    font-size: 11px;
    gap: 3px;
  }
  .session-side :slotted(.session-primary) {
    margin-left: 2px;
    padding: 0 9px;
    font-size: 11.5px;
  }
}
</style>
