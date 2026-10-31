<script setup lang="ts">
/**
 * 练习场统一选择卡片：卡头固定 + 正文内部滚动（thin-scroll）。
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
  <article class="setup-card panel" :class="`tone-${tone}`">
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
/* 外框复用全局 .panel；这里只负责色调变量、卡内布局与滚动。 */
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
  padding: 18px 20px;
}
.setup-card.tone-hidden {
  --setup-accent: var(--danger);
  --setup-accent-ink: var(--danger);
  --setup-accent-soft: var(--danger-soft);
  --setup-accent-line: var(--danger-line);
  /* 隐藏语气卡在明暗主题下都更「内敛」：以页面底色混出凹陷感 */
  background: color-mix(in srgb, var(--bg) 55%, var(--surface));
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
  gap: 8px 10px;
  padding-bottom: 14px;
}
.setup-pill {
  flex: none;
  padding: 4px 10px;
  border-radius: var(--r-control);
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0.02em;
  line-height: 1.4;
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
  font-size: var(--text-xs);
  line-height: 1.5;
}
.setup-card-scroll {
  scrollbar-gutter: stable;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-right: 4px;
}
@media (max-width: 640px) {
  .setup-card {
    padding: 14px 16px;
  }
  .setup-card-head {
    padding-bottom: 12px;
  }
}
</style>
