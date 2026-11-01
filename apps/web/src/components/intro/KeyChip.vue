<script setup lang="ts">
/**
 * 入门课最小键帽原语：蓝色 = 主键（工具默认显示），普通样式 = 副键 / 兼容键。
 * 只做外观，不携带任何方案数据。
 */
withDefaults(
  defineProps<{
    text: string
    /** primary = 主键（品牌蓝）；compat = 额外兼容码；neutral = 副键 */
    variant?: 'primary' | 'neutral' | 'compat'
  }>(),
  { variant: 'neutral' },
)
</script>

<template>
  <span class="key-chip" :class="`is-${variant}`">{{ text }}</span>
</template>

<style scoped>
.key-chip {
  display: inline-grid;
  place-items: center;
  min-width: 22px;
  height: 24px;
  padding: 0 6px;
  border-radius: var(--r-control);
  border: 1px solid var(--line-strong);
  border-bottom-width: 2px;
  background: var(--surface);
  color: var(--ink-2);
  font-family: var(--font-mono);
  font-size: 11.5px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.03em;
  white-space: nowrap;
}
.key-chip.is-primary {
  border-color: var(--brand-fill);
  background: var(--brand-fill);
  color: var(--on-accent);
}
.key-chip.is-compat {
  border-style: dashed;
  border-color: var(--brand-line);
  background: var(--brand-soft);
  color: var(--brand-ink);
}
</style>
