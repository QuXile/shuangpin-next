<script setup lang="ts">
import { computed } from 'vue'
import type { AtomId, PracticeCap } from '@shuangpin/core'
import KeyCap from './KeyCap.vue'
import InputSlots from './InputSlots.vue'

const props = withDefaults(
  defineProps<{
    char: string
    pinyin: string
    initialText?: string
    caps: PracticeCap[]
    input?: string[]
    focusAtoms?: readonly AtomId[]
    tier?: 1 | 2 | 3
    active?: boolean
    completed?: boolean
    inputState?: 'idle' | 'wrong' | 'correct'
    revealed?: boolean
    showInput?: boolean
    focusBadge?: string
    /** 训练页「练习时隐藏」：这些原子的 KeyCap 映射隐藏（revealed 优先） */
    hiddenAtoms?: readonly AtomId[]
    /** 训练页「练习时隐藏」：隐藏零声母映射 */
    hideZero?: boolean
  }>(),
  {
    input: () => [],
    initialText: '',
    focusAtoms: () => [],
    tier: 1,
    active: false,
    completed: false,
    inputState: 'idle',
    revealed: false,
    showInput: true,
    focusBadge: '新',
    hiddenAtoms: () => [],
    hideZero: false,
  },
)

const focusSet = computed(() => new Set(props.focusAtoms))
const hiddenSet = computed(() => new Set(props.hiddenAtoms))
const initialPinyin = computed(() => props.pinyin.slice(0, props.initialText.length))
const finalPinyin = computed(() => props.pinyin.slice(props.initialText.length))

function hidden(cap: PracticeCap): boolean {
  if (props.revealed) return false
  if (hiddenSet.value.has(cap.atomId)) return true
  if (props.hideZero && cap.atomId.startsWith('zero:')) return true
  if (props.tier === 3) return true
  if (props.tier === 2) return focusSet.value.has(cap.atomId)
  return false
}
</script>

<template>
  <div
    class="char-card"
    :class="{
      'has-input': showInput,
      'is-active': active,
      'is-completed': completed,
      'is-error': inputState === 'wrong',
    }"
  >
    <span class="char-glyph">{{ char }}</span>
    <span class="char-pinyin">
      <span class="py-initial">{{ initialPinyin }}</span>
      <span class="py-final">{{ finalPinyin }}</span>
    </span>
    <div class="char-target">
      <KeyCap
        v-for="(cap, index) in caps"
        :key="index"
        :cap="cap"
        :hidden="hidden(cap)"
        :focus="focusSet.has(cap.atomId)"
        :focus-label="focusBadge"
        :completed="completed"
      />
    </div>
    <InputSlots v-if="showInput" :caps="caps" :input="input" :state="inputState" />
  </div>
</template>

<style scoped>
/* 卡片自身是尺寸容器：内部所有尺寸用 cqw 等比缩放（替代原 ResizeObserver + --card-scale）。 */
.char-card {
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 100%;
  min-width: 0;
  aspect-ratio: 340 / 430;
  padding: 8px 7px;
  border: 1.1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  transition: border-color 130ms, box-shadow 130ms, background 130ms, transform 130ms;
}
.char-card.has-input {
  aspect-ratio: 340 / 450;
}
.char-card.is-active {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-soft), var(--shadow-md);
}
.char-card.is-completed {
  background: var(--surface-2);
}
.char-card.is-error {
  border-color: color-mix(in srgb, var(--danger) 55%, var(--line));
  background: var(--danger-soft);
}
.char-glyph {
  font-size: 34cqw;
  font-weight: 700;
  line-height: 1.1;
  color: var(--ink);
}
.char-pinyin {
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 13cqw;
  line-height: 1.3;
  color: var(--ink-2);
  min-height: 17cqw;
  margin-bottom: 1.5cqw;
  white-space: nowrap;
}
.py-initial {
  color: var(--brand-ink);
}
.py-final {
  color: var(--fin);
}
.char-target {
  display: flex;
  justify-content: center;
  gap: 5.5cqw;
  width: 100%;
  min-height: 34cqw;
  margin-top: 1cqw;
}
</style>
