<script setup lang="ts">
/** 双拼方案选择：地图 Hero 与练习场品牌卡共用同一套样式与键位提示。 */
import { computed, ref } from 'vue'

interface SchemeChoice {
  id: string
  name: string
}

const props = withDefaults(
  defineProps<{
    options: readonly SchemeChoice[]
    modelValue: string
    busy?: boolean
    /** 是否在每个方案按钮旁显示 Alt+数字 快捷键 */
    showKeys?: boolean
    /** 主要方案 id；其余方案收进「其他方案」内部选择器 */
    primaryIds?: readonly string[]
  }>(),
  { busy: false, showKeys: false, primaryIds: () => [] },
)

const emit = defineEmits<{ select: [id: string] }>()

const primaryOptions = computed(() =>
  props.primaryIds.length > 0
    ? props.options.filter((option) => props.primaryIds.includes(option.id))
    : props.options,
)
const otherOptions = computed(() => {
  if (props.primaryIds.length === 0) return []
  return props.options.filter((option) => !props.primaryIds.includes(option.id))
})
const selectedOther = computed(() =>
  otherOptions.value.find((option) => option.id === props.modelValue) ?? null,
)

const root = ref<HTMLElement | null>(null)

function stepOther(delta: 1 | -1): void {
  if (otherOptions.value.length === 0) return
  const current = selectedOther.value
    ? otherOptions.value.findIndex((option) => option.id === selectedOther.value?.id)
    : -1
  const next =
    current < 0
      ? delta > 0
        ? 0
        : otherOptions.value.length - 1
      : (current + delta + otherOptions.value.length) % otherOptions.value.length
  const option = otherOptions.value[next]
  if (option) emit('select', option.id)
}

/** 左右方向键在方案按钮与「其他方案」选择器之间移动；下拉内部交给原生控件。 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  // 选择器展开时 ↑↓/Enter 交给原生 select；←→ 在外层控件之间移动焦点。
  const items = Array.from(
    root.value?.querySelectorAll<HTMLElement>('.scheme-btn, .scheme-more select') ?? [],
  )
  const current = items.findIndex((item) => item === event.target)
  if (current < 0) return
  const delta = event.key === 'ArrowRight' ? 1 : -1
  const next = items[(current + delta + items.length) % items.length]
  event.preventDefault()
  next?.focus()
}

function shortLabel(name: string): string {
  return name.replace(/双拼$/, '')
}
</script>

<template>
  <div ref="root" class="scheme-row" role="group" aria-label="选择双拼方案" @keydown="onKeydown">
    <button
      v-for="(option, index) in primaryOptions"
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
    <label v-if="otherOptions.length > 0" class="scheme-more" :class="{ active: Boolean(selectedOther) }">
      <span>{{ selectedOther ? shortLabel(selectedOther.name) : '其他方案' }}</span>
      <kbd v-if="showKeys">Alt+6</kbd>
      <select
        :id="selectedOther ? 'scheme-select' : undefined"
        :value="selectedOther?.id ?? ''"
        aria-keyshortcuts="Alt+6"
        :disabled="busy"
        aria-label="其他双拼方案"
        @change="emit('select', ($event.target as HTMLSelectElement).value)"
        @keydown.down.prevent="stepOther(1)"
        @keydown.up.prevent="stepOther(-1)"
      >
        <option value="" disabled>选择</option>
        <option v-for="option in otherOptions" :key="option.id" :value="option.id">
          {{ shortLabel(option.name) }}
        </option>
      </select>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </label>
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
.scheme-more {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--r-control);
  background: color-mix(in srgb, var(--surface) 72%, transparent);
  color: var(--ink-3);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  backdrop-filter: blur(8px);
  transition:
    border-color var(--dur-fast),
    color var(--dur-fast),
    background var(--dur-fast),
    transform var(--dur-fast),
    box-shadow var(--dur-fast);
}
.scheme-more:hover,
.scheme-more:focus-within {
  border-color: var(--brand-line);
  color: var(--brand);
  background: color-mix(in srgb, var(--surface) 90%, transparent);
  transform: translateY(-1px);
}
.scheme-more:active {
  transform: translateY(0) scale(0.97);
}
.scheme-more:focus-within {
  outline: 2px solid var(--brand-line);
  outline-offset: 2px;
}
.scheme-more.active {
  border-style: solid;
  border-color: var(--brand);
  color: var(--brand);
  background: color-mix(in srgb, var(--brand-soft) 55%, transparent);
}
.scheme-more.active:hover,
.scheme-more.active:focus-within {
  border-color: var(--brand-fill-hover);
  color: var(--brand-ink);
  background: var(--brand-soft);
  box-shadow: 0 0 0 3px var(--brand-soft);
}
.scheme-more select {
  position: absolute;
  inset: 0;
  width: 100%;
  opacity: 0;
  cursor: pointer;
}
.scheme-more select:disabled {
  cursor: wait;
}
.scheme-more kbd {
  font-size: 9px;
  transition: background var(--dur-fast), color var(--dur-fast), transform var(--dur-fast);
}
.scheme-more:hover kbd,
.scheme-more:focus-within kbd,
.scheme-more.active:hover kbd,
.scheme-more.active:focus-within kbd {
  background: var(--surface);
  color: var(--brand);
  transform: translateY(-1px);
}
.scheme-more svg {
  width: 12px;
  height: 12px;
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
