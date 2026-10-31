<script setup lang="ts">
/**
 * 训练场统一选择卡片：卡头固定 + 正文内部滚动（thin-scroll）。
 * 文章隐藏卡 / 专项隐藏卡 / 专项出现卡 / 文章输入卡共用同一外框结构。
 */
withDefaults(
  defineProps<{
    /** 卡头 pill 文案，如「出现」「隐藏」；自定义 #head 插槽时可省略 */
    pill?: string
    /** 视觉语气：出现（brand）/ 隐藏（danger）/ 输入（中性） */
    tone?: 'appear' | 'hidden' | 'input'
    subtitle?: string
  }>(),
  { pill: '', tone: 'appear', subtitle: '' },
)
</script>

<template>
  <article class="setup-card" :class="`tone-${tone}`">
    <header class="setup-card-head">
      <slot name="head">
        <span v-if="pill" class="setup-pill" :class="`is-${tone}`">{{ pill }}</span>
        <span v-if="subtitle" class="setup-card-sub">{{ subtitle }}</span>
      </slot>
      <slot name="head-extra" />
    </header>
    <div class="setup-card-scroll thin-scroll">
      <slot />
    </div>
  </article>
</template>

<style scoped>
.setup-card {
  --setup-accent: var(--brand);
  --setup-accent-ink: var(--brand-ink);
  --setup-accent-soft: var(--brand-soft);
  --setup-accent-line: var(--brand-soft-2);
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  padding: 16px 18px;
  border: 1px solid var(--line);
  border-radius: var(--r-xl);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}
.setup-card.tone-hidden {
  --setup-accent: var(--danger);
  --setup-accent-ink: var(--danger);
  --setup-accent-soft: var(--danger-soft);
  --setup-accent-line: var(--danger-line);
  background: color-mix(in srgb, var(--surface-2) 62%, var(--surface));
}
.setup-card.tone-input {
  --setup-accent: var(--ink-3);
  --setup-accent-ink: var(--ink-2);
  --setup-accent-soft: var(--surface-3);
  --setup-accent-line: var(--line);
}
.setup-card-head {
  flex: none;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px;
  padding-bottom: 12px;
}
.setup-pill {
  flex: none;
  padding: 4px 11px;
  border-radius: var(--r-pill);
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.setup-pill.is-appear {
  color: var(--brand-ink);
  background: var(--brand-soft);
}
.setup-pill.is-hidden {
  color: var(--danger);
  background: var(--danger-soft);
}
.setup-pill.is-input {
  color: var(--ink-2);
  background: var(--surface-3);
}
.setup-card-sub {
  min-width: 0;
  color: var(--ink-4);
  font-size: 11px;
}
.setup-card-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-right: 4px;
}
</style>
