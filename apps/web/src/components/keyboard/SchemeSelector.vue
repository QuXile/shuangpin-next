<script setup lang="ts">
/** 双拼方案选择：地图 Hero 与练习场品牌卡共用同一套样式与键位提示。 */
interface SchemeChoice {
  id: string
  name: string
}

withDefaults(
  defineProps<{
    options: readonly SchemeChoice[]
    modelValue: string
    busy?: boolean
    /** 是否在每个方案按钮旁显示 Alt+数字 快捷键 */
    showKeys?: boolean
  }>(),
  { busy: false, showKeys: false },
)

const emit = defineEmits<{ select: [id: string] }>()

function shortLabel(name: string): string {
  return name.replace(/双拼$/, '')
}
</script>

<template>
  <div class="scheme-row" role="group" aria-label="选择双拼方案">
    <button
      v-for="(option, index) in options"
      :id="option.id === modelValue ? 'scheme-select' : undefined"
      :key="option.id"
      type="button"
      class="scheme-btn"
      :class="{ active: option.id === modelValue }"
      :disabled="busy"
      :aria-pressed="option.id === modelValue"
      :aria-keyshortcuts="showKeys ? `Alt+${index + 1}` : undefined"
      @click="emit('select', option.id)"
    >
      {{ shortLabel(option.name) }}
      <kbd v-if="showKeys">Alt+{{ index + 1 }}</kbd>
    </button>
  </div>
</template>

<style scoped>
.scheme-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  max-width: 100%;
}
.scheme-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 8px 14px;
  border: 1px solid var(--line);
  border-radius: var(--r-control);
  background: color-mix(in srgb, var(--surface) 80%, transparent);
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 750;
  transition:
    border-color var(--dur-fast),
    color var(--dur-fast),
    background var(--dur-fast),
    transform var(--dur-fast),
    box-shadow var(--dur-fast);
  backdrop-filter: blur(8px);
}
.scheme-btn:hover:not(:disabled) {
  border-color: var(--brand-line);
  color: var(--brand);
  transform: translateY(-1px);
}
.scheme-btn:active:not(:disabled) {
  transform: translateY(0) scale(0.97);
}
.scheme-btn.active {
  background: var(--brand);
  border-color: var(--brand);
  color: var(--on-accent);
  box-shadow: var(--brand-glow-strong);
}
.scheme-btn.active:hover:not(:disabled) {
  background: var(--brand-fill-hover);
  border-color: var(--brand-fill-hover);
  color: var(--on-accent);
}
.scheme-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}
@media (max-width: 560px) {
  .scheme-btn {
    flex: 1 1 auto;
    justify-content: center;
    padding: 7px 10px;
  }
  .scheme-btn kbd {
    display: none;
  }
}
</style>
