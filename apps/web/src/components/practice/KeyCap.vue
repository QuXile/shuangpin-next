<script setup lang="ts">
import type { PracticeCap } from '@shuangpin/core'

const props = withDefaults(
  defineProps<{
    cap: PracticeCap
    hidden?: boolean
    focus?: boolean
    completed?: boolean
    focusLabel?: string
  }>(),
  { hidden: false, focus: false, completed: false, focusLabel: '新' },
)
</script>

<template>
  <span
    class="keycap"
    :class="[
      props.cap.role === 'initial' ? 'keycap--initial' : 'keycap--final',
      {
        'is-hidden': hidden,
        'is-focus': focus && !hidden,
        'is-completed': completed,
      },
    ]"
    :aria-label="`${props.cap.role === 'initial' ? '声母' : '韵母'}键 ${hidden ? '已隐藏' : props.cap.key.toUpperCase()}`"
  >
    <span class="keycap-face">{{ hidden ? '?' : props.cap.key.toUpperCase() }}</span>
    <span
      v-if="focus && !hidden"
      class="keycap-badge"
      :class="{ 'is-contained': focusLabel === '含' }"
      aria-hidden="true"
    >{{ focusLabel }}</span>
  </span>
</template>

<style scoped>
/* 尺寸单位 cqw 相对最近的容器（CharacterCard 的 container-type: inline-size） */
.keycap {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 31.5cqw;
  height: 34cqw;
  border-radius: 7cqw;
  font-family: var(--font-mono);
  font-size: 13.5cqw;
  font-weight: 700;
  line-height: 1;
  border: 1px solid var(--cap-ini-border);
  border-bottom-width: 3px;
  background: var(--cap-ini-bg);
  color: var(--cap-ini-ink);
  box-shadow: 0 3px 0 var(--cap-ini-edge);
  transition: transform 90ms var(--ease), box-shadow 90ms var(--ease),
    background 120ms, border-color 120ms, color 120ms;
  user-select: none;
}
.keycap--final {
  border-color: var(--cap-fin-border);
  background: var(--cap-fin-bg);
  color: var(--cap-fin-ink);
  box-shadow: 0 3px 0 var(--cap-fin-edge);
}
.keycap-face {
  transform: translateY(-0.5px);
}
.keycap.is-focus {
  outline: 2px solid var(--brand);
  outline-offset: 1px;
}
.keycap.is-hidden {
  border-color: var(--cap-hidden-border);
  background: var(--cap-hidden-bg);
  color: var(--cap-hidden-ink);
  box-shadow: 0 3px 0 var(--cap-hidden-border);
  border-style: dashed;
}
.keycap.is-completed {
  opacity: 0.72;
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
  font-size: 12px;
  font-weight: 800;
  color: #fff;
  background: var(--brand);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.18);
}
.keycap-badge.is-contained {
  color: var(--ink-3);
  background: var(--surface-3);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.12);
}
</style>
