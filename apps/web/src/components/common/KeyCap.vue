<script setup lang="ts">
/**
 * 统一键帽：静态 mini 键帽（推荐码 / 兼容码 / 示例）与练习字卡键帽共用一套结构。
 * 三个维度：
 * - variant：neutral / primary / compat / initial / final / hidden（颜色语义）
 * - size：mini（静态小键帽）/ practice（练习字卡，随容器 cqw 缩放）
 * - state：focus / completed（仅 practice 有视觉状态）
 */
import { computed } from 'vue'
import type { PracticeCap } from '@shuangpin/core'

const props = withDefaults(
  defineProps<{
    /** 静态键帽文本；与 cap 二选一 */
    text?: string
    /** 练习域键帽数据；提供时 variant 缺省由 cap.role 推导 */
    cap?: PracticeCap
    variant?: 'neutral' | 'primary' | 'compat' | 'initial' | 'final' | 'hidden'
    size?: 'mini' | 'practice'
    hidden?: boolean
    focus?: boolean
    completed?: boolean
    focusLabel?: string
  }>(),
  {
    text: '',
    cap: undefined,
    variant: 'neutral',
    size: 'mini',
    hidden: false,
    focus: false,
    completed: false,
    focusLabel: '新',
  },
)

const resolvedVariant = computed(() => {
  if (props.variant !== 'neutral') return props.variant
  if (!props.cap) return 'neutral'
  return props.cap.role === 'initial' ? 'initial' : 'final'
})

const resolvedHidden = computed(() => props.size === 'practice' && props.hidden)
const displayText = computed(() => {
  if (resolvedHidden.value) return '?'
  if (props.cap) return props.cap.key.toUpperCase()
  return props.text
})
const roleLabel = computed(() => {
  if (!props.cap) return '键'
  return props.cap.role === 'initial' ? '声母' : '韵母'
})
const ariaLabel = computed(() => {
  if (!props.cap) return undefined
  return `${roleLabel.value}键 ${resolvedHidden.value ? '已隐藏' : displayText.value}`
})
</script>

<template>
  <span
    class="cap"
    :class="[
      `cap--${resolvedVariant}`,
      size === 'practice' ? 'keycap--practice' : 'cap--mini',
      {
        'is-hidden': resolvedHidden,
        'is-focus': focus && !resolvedHidden,
        'is-completed': completed,
      },
    ]"
    :aria-label="ariaLabel"
    :role="cap ? 'img' : undefined"
  >
    <span class="cap-face">{{ displayText }}</span>
    <span
      v-if="focus && !resolvedHidden && size === 'practice'"
      class="keycap-badge"
      :class="{ 'is-contained': focusLabel === '含' }"
      aria-hidden="true"
    >{{ focusLabel }}</span>
  </span>
</template>

<style scoped>
.cap-face {
  transform: translateY(-0.5px);
}

/* ── 练习字卡：尺寸随 CharacterCard 容器等比缩放 ── */
.keycap--practice {
  position: relative;
  width: 31.5cqw;
  height: 34cqw;
  border-radius: 7cqw;
  font-size: 13.5cqw;
  border-bottom-width: 3px;
  box-shadow: 0 3px 0 var(--keycap-edge);
  transition: transform var(--dur-press) var(--ease), box-shadow var(--dur-press) var(--ease),
    background var(--dur-fast), border-color var(--dur-fast), color var(--dur-fast),
    opacity var(--dur-fast);
  user-select: none;
}
.keycap--practice.cap--hidden {
  box-shadow: 0 3px 0 var(--keycap-hidden-border);
}
.keycap--practice.is-focus {
  outline: 2px solid var(--brand);
  outline-offset: 1px;
  box-shadow: 0 3px 0 var(--keycap-edge), var(--ring-brand);
}
.keycap--practice.is-completed {
  opacity: 0.78;
}

.keycap-badge {
  position: absolute;
  top: -9px;
  right: -9px;
  min-width: 22px;
  height: 22px;
  padding: 0 5px;
  display: grid;
  place-items: center;
  border-radius: var(--r-pill);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  font-weight: 800;
  color: var(--on-accent);
  background: var(--fin);
  box-shadow: var(--badge-shadow);
}
.keycap-badge.is-contained {
  color: var(--ink-3);
  background: var(--surface-3);
}
</style>
