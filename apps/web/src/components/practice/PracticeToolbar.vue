<script setup lang="ts">
/**
 * 练习工具栏（纯展示）：阶段标题、进度/门槛提示、实时速度、上一阶段/重练/主操作。
 * 主按钮文案只由阶段位置决定（由父级传入），这里只根据 enabled 切换可用状态。
 */
withDefaults(
  defineProps<{
    title: string
    progressLabel: string
    gateHint?: string
    cpm?: number
    primaryLabel: string
    primaryEnabled?: boolean
  }>(),
  {
    gateHint: '',
    cpm: 0,
    primaryEnabled: false,
  },
)

const emit = defineEmits<{
  previous: []
  retry: []
  primary: []
}>()
</script>

<template>
  <div class="practice-toolbar" :class="{ 'is-target-reached': primaryEnabled }">
    <div class="toolbar-left">
      <button class="stage-back" type="button" @click="emit('previous')">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19.5 12h-15" /><path d="m10.5 6-6 6 6 6" />
        </svg>
        上一阶段
        <kbd>Alt+←</kbd>
      </button>
      <span class="toolbar-divider" aria-hidden="true" />
      <strong class="toolbar-title">{{ title }}</strong>
      <span class="toolbar-progress-label">{{ progressLabel }}</span>
      <span v-if="gateHint" class="gate-hint" role="status">{{ gateHint }}</span>
    </div>
    <div class="toolbar-actions">
      <span class="speed-readout">
        <span class="speed-dot" aria-hidden="true" />
        {{ cpm }} 字/分
      </span>
      <span class="toolbar-divider" aria-hidden="true" />
      <button class="stage-back" type="button" @click="emit('retry')">
        重练
        <kbd>Alt+R</kbd>
      </button>
      <button
        class="btn btn--primary toolbar-primary"
        type="button"
        :disabled="!primaryEnabled"
        @click="emit('primary')"
      >
        {{ primaryLabel }}
        <kbd>Enter</kbd>
      </button>
    </div>
  </div>
</template>

<style scoped>
.practice-toolbar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  max-width: 860px;
  width: 100%;
  height: 48px;
  margin: 0 auto 8px;
  padding: 7px 10px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}
.toolbar-left,
.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.toolbar-left {
  flex: 1;
}
.toolbar-actions {
  flex: none;
}
.toolbar-divider {
  width: 1px;
  height: 16px;
  margin: 0 4px;
  flex: none;
  background: var(--line);
}
.toolbar-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 650;
  color: var(--ink-2);
}
.toolbar-progress-label {
  flex: none;
  color: var(--ink);
  font-size: 13px;
  font-weight: 780;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.stage-back {
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
.stage-back:hover {
  color: var(--ink);
  background: var(--surface-2);
}
.stage-back .icon {
  width: 14px;
  height: 14px;
}
.stage-back kbd {
  color: var(--ink-4);
}
.toolbar-primary {
  height: 32px;
  margin-left: 5px;
  padding: 0 12px;
  font-size: 12px;
}
.toolbar-primary:disabled {
  color: var(--ink-4);
  background: var(--surface-3);
  border-color: var(--line);
  box-shadow: none;
  cursor: not-allowed;
}
.toolbar-primary:disabled kbd {
  color: var(--ink-4);
  border-color: var(--line);
  background: var(--surface-2);
}
.speed-readout {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 4px;
  color: var(--ink);
  font-size: 13px;
  font-weight: 780;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.speed-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--success);
}
.gate-hint {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink-3);
  font-size: 10px;
  font-weight: 650;
}
.practice-toolbar.is-target-reached {
  background: var(--state-success-bg);
  border-color: var(--state-success-line);
}
.practice-toolbar.is-target-reached .toolbar-title {
  color: var(--state-success-ink);
}
.practice-toolbar.is-target-reached .toolbar-primary {
  background: var(--state-success-fill);
  border-color: var(--state-success-fill);
  color: #fff;
  box-shadow: 0 2px 0 var(--state-success-fill-hover);
}
.practice-toolbar.is-target-reached .toolbar-primary:hover:not(:disabled) {
  background: var(--state-success-fill-hover);
}
@media (max-width: 640px) {
  .practice-toolbar {
    padding: 0 5px;
    gap: 4px;
  }
  .toolbar-title,
  .gate-hint,
  .stage-back kbd {
    display: none;
  }
  .toolbar-progress-label,
  .speed-readout {
    font-size: 11.5px;
    font-weight: 720;
  }
  .stage-back {
    padding: 0 3px;
    font-size: 10px;
    gap: 3px;
  }
  .toolbar-actions {
    gap: 0;
  }
  .toolbar-primary {
    margin-left: 3px;
    padding: 0 8px;
    font-size: 11px;
  }
  .toolbar-primary kbd {
    display: none;
  }
}
</style>
