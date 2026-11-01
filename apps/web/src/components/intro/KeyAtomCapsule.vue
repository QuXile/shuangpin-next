<script setup lang="ts">
/**
 * 入门课原子胶囊：声母 / 韵母 / 零声母统一外观。
 * - 主键（数组第一条）蓝色，其他键 / 序列普通样式；
 * - 零声母的每个 key 是一条完整序列，整段作为一个胶囊内的小键帽；
 * - 所有键均为合法输入，组件不做「只允许主键」的暗示。
 */
import type { KeyAtom } from './introLessonModel'
import KeyChip from './KeyChip.vue'

withDefaults(
  defineProps<{
    atom: KeyAtom
    /** 多键说明页混合展示时标出声母 / 韵母 / 零声母 */
    showKind?: boolean
    compact?: boolean
  }>(),
  { showKind: false, compact: false },
)

const KIND_LABEL = { initial: '声母', final: '韵母', zero: '零声母' } as const
</script>

<template>
  <div class="atom-capsule" :class="[`is-${atom.kind}`, { 'is-compact': compact }]">
    <span v-if="showKind" class="atom-kind">{{ KIND_LABEL[atom.kind] }}</span>
    <span class="atom-label">{{ atom.label }}</span>
    <span class="atom-arrow" aria-hidden="true">→</span>
    <span class="atom-keys">
      <KeyChip
        v-for="key in atom.keys"
        :key="key.sequence"
        :text="key.sequence"
        :variant="key.primary ? 'primary' : 'neutral'"
      />
    </span>
    <span v-if="atom.free" class="atom-free" title="键位与全拼习惯一致">沿用</span>
  </div>
</template>

<style scoped>
.atom-capsule {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 6px 9px;
  border: 1px solid var(--line);
  border-radius: var(--r-control);
  background: var(--surface);
}
.atom-kind {
  flex: none;
  padding: 1px 6px;
  border-radius: var(--r-pill);
  background: var(--surface-3);
  color: var(--ink-3);
  font-family: var(--font-ui);
  font-size: 10px;
  font-weight: 700;
  line-height: 1.5;
}
.atom-label {
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 750;
  line-height: 1.2;
  white-space: nowrap;
}
.is-initial .atom-label {
  color: var(--ini);
}
.is-final .atom-label {
  color: var(--fin);
}
.is-zero .atom-label {
  color: var(--brand-ink);
}
.atom-arrow {
  color: var(--ink-4);
  font-size: 11px;
  line-height: 1;
}
.atom-keys {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 3px;
  min-width: 0;
}
.atom-free {
  margin-left: auto;
  padding: 1px 6px;
  border-radius: var(--r-pill);
  background: var(--surface-3);
  color: var(--ink-4);
  font-family: var(--font-ui);
  font-size: 10px;
  font-weight: 650;
  line-height: 1.5;
  white-space: nowrap;
}
.is-compact {
  gap: 5px;
  padding: 4px 7px;
}
.is-compact .atom-label {
  font-size: 12px;
}
</style>
