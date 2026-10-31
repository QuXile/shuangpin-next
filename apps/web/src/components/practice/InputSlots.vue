<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { PracticeCap } from '@shuangpin/core'

const props = withDefaults(
  defineProps<{
    caps: PracticeCap[]
    input: string[]
    state?: 'idle' | 'wrong' | 'correct'
  }>(),
  { state: 'idle' },
)

const slots = computed(() =>
  props.caps.map((_cap, index) => ({
    typed: props.input[index] ?? '',
    filled: index < props.input.length,
  })),
)

/** 只给「刚刚填入的那一格」播放弹入；挂载/恢复进度时不播放。 */
const popIndex = ref(-1)
let popTimer: number | undefined
watch(
  () => props.input.length,
  (length, previous) => {
    if (popTimer !== undefined) window.clearTimeout(popTimer)
    if (
      previous !== undefined &&
      length > previous &&
      length > 0 &&
      props.state !== 'wrong'
    ) {
      popIndex.value = length - 1
      popTimer = window.setTimeout(() => {
        popIndex.value = -1
      }, 200)
    } else {
      popIndex.value = -1
    }
  },
)

/** 整字通过时给输入格一次绿色脉冲，和卡片 / 键帽的完成动画同步。 */
const correctPulse = ref(false)
let correctTimer: number | undefined
watch(
  () => props.state,
  (state, previous) => {
    if (state !== 'correct' || previous === 'correct') return
    correctPulse.value = true
    if (correctTimer !== undefined) window.clearTimeout(correctTimer)
    correctTimer = window.setTimeout(() => {
      correctPulse.value = false
    }, 440)
  },
)

onBeforeUnmount(() => {
  if (popTimer !== undefined) window.clearTimeout(popTimer)
  if (correctTimer !== undefined) window.clearTimeout(correctTimer)
})
</script>

<template>
  <div
    class="input-slots"
    :class="[`is-${state}`, { 'is-correct-pulse': correctPulse }]"
    aria-hidden="true"
  >
    <span
      v-for="(slot, index) in slots"
      :key="index"
      class="input-slot"
      :class="{ 'is-filled': slot.filled, 'is-popping': index === popIndex }"
    >
      {{ slot.filled ? slot.typed.toUpperCase() : '' }}
    </span>
  </div>
</template>

<style scoped>
.input-slots {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  margin-top: 4px;
  min-height: 18cqw;
}
.input-slot {
  width: 21.5cqw;
  height: 20cqw;
  border-radius: 4cqw;
  display: grid;
  place-items: center;
  font-family: var(--font-mono);
  font-size: 9.5cqw;
  font-weight: 700;
  color: var(--ink-4);
  background: var(--surface-2);
  border: 1px dashed var(--line-strong);
  transition: background var(--dur-fast), border-color var(--dur-fast), color var(--dur-fast),
    box-shadow var(--dur-fast);
}
.input-slot.is-filled {
  color: var(--brand-ink);
  background: var(--brand-soft);
  border-style: solid;
  border-color: var(--brand-line);
  box-shadow: 0 2px 0 var(--brand-soft-2);
}
.input-slot.is-popping {
  animation: ui-slot-pop 190ms var(--ease);
}
.input-slots.is-correct-pulse .input-slot {
  animation: ui-slot-success 440ms var(--ease);
}
/* 错误 / 成功态：与 CharacterCard、KeyCap 共用 danger / success 语义色 */
.input-slots.is-wrong .input-slot {
  color: var(--danger);
  background: var(--danger-soft);
  border-color: var(--danger-line);
  border-style: solid;
  box-shadow: none;
}
.input-slots.is-correct .input-slot {
  color: var(--state-success-ink);
  background: var(--success-soft);
  border-color: var(--success-strong);
  border-style: solid;
  box-shadow: none;
}
</style>
