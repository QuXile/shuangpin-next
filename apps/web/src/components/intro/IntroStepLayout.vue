<script setup lang="ts">
/** 入门课步骤骨架：统一卡片表面 + 视觉/说明双栏；窄屏自动堆叠。 */
withDefaults(
  defineProps<{
    cardClass?: string
    gridClass?: string
    visualClass?: string
  }>(),
  { cardClass: '', gridClass: '', visualClass: '' },
)
</script>

<template>
  <section class="intro-card thin-scroll" :class="cardClass">
    <div class="intro-grid" :class="gridClass">
      <div class="intro-visual" :class="visualClass">
        <slot name="visual" />
      </div>
      <slot />
    </div>
  </section>
</template>

<style scoped>
.intro-card {
  flex: 1;
  width: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 26px 36px;
  border-radius: var(--r-panel);
  border: 1px solid var(--line);
  background: var(--surface);
  box-shadow: var(--shadow-md);
  overflow-y: auto;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  animation: ui-fade-up var(--dur-mid) var(--ease);
}
.intro-card h1 {
  margin: 8px 0 22px;
  color: var(--ink);
  font-size: var(--text-display-sm);
  font-weight: 800;
  letter-spacing: -0.035em;
  line-height: 1.2;
}
.intro-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
  gap: clamp(20px, 3vw, 44px);
  align-items: start;
}
.intro-grid--atoms {
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
}
.intro-grid--guide {
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.75fr);
  align-items: stretch;
}
.intro-grid--try {
  grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr);
}
.intro-visual {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: 18px 16px;
  border-radius: var(--r-panel);
  border: 1px solid var(--line);
  background: var(--surface-2);
}
.intro-visual.anatomy-panel {
  align-items: center;
  gap: 16px;
  padding: 32px 20px;
}
.intro-visual.scheme-guide {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-content: start;
  gap: 8px;
  padding: 12px 14px;
}
/* ── 试打页（08/08）：与其它页共用同一套卡片表面，仅收紧内部布局 ── */
.intro-card.intro-card--try {
  padding-top: 20px;
  padding-bottom: 16px;
  overflow: hidden;
}
.intro-card--try .intro-grid--try {
  flex: 1;
  min-height: 0;
  align-items: stretch;
}
/* 试打面板与其它页视觉区同构：surface-2 底 + 1px 边框 + 圆角 + 18/16 padding。 */
.intro-visual.try-panel {
  flex: 1;
  min-height: 0;
  gap: 0;
}
/* 外层面板已负责圆角与底色，内部练习流透明、去掉重复裁切。 */
.intro-visual.try-panel :deep(.stream-shell) {
  max-width: 100%;
  background: transparent;
}
.intro-visual.try-panel :deep(.stream-viewport) {
  border-radius: 0;
  clip-path: none;
  background: transparent;
}
.intro-visual.try-panel :deep(.stream-inner.is-grid) {
  justify-content: center;
  align-content: center;
}
/* 试打面板没有滚动内容，且底色是 surface-2：去掉按页面底色绘制的上下渐隐 */
.intro-visual.try-panel :deep(.fade) {
  display: none;
}
.intro-card--try :deep(.intro-prose) {
  padding-top: 8px;
  padding-right: 4px;
  overflow-y: auto;
  scrollbar-width: thin;
}
/* 试打页空间有限：略收窄字卡，让单个词完整显示在练习流里。 */
.intro-card--try :deep(.try-stream .char-card) {
  width: clamp(104px, 10vw, 128px);
}

@media (max-width: 1024px) {
  .intro-card {
    padding: 24px 26px;
  }
  .intro-visual.scheme-guide {
    grid-template-columns: 1fr;
  }
  .intro-grid,
  .intro-grid--atoms,
  .intro-grid--guide,
  .intro-grid--try {
    grid-template-columns: 1fr;
    gap: 18px;
  }
  /* 单列时试打流固定高度，整页在卡片内自然滚动。 */
  .intro-card--try {
    overflow-y: auto;
  }
  .intro-card--try .intro-grid--try {
    flex: none;
  }
  .intro-visual.try-panel {
    flex: none;
    min-height: clamp(300px, 44vh, 380px);
  }
  .intro-card--try :deep(.intro-prose) {
    padding-right: 0;
    overflow: visible;
  }
}
@media (max-width: 640px) {
  .intro-card {
    flex: none;
    overflow: visible;
    padding: 20px 16px;
  }
  .intro-card--try {
    overflow: visible;
  }
  .intro-visual.try-panel {
    min-height: 330px;
  }
}
</style>
