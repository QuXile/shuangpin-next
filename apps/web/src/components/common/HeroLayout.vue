<script setup lang="ts">
/**
 * 课程 / 练习场共用 Hero 骨架。
 * 英文眉题置顶、中文标语贴键帽区底边；方案选择在两者较低处下方固定 18px；
 * 卡片高度完全由内容撑开，保证两个页面天然使用同一套间距和字号。
 */
</script>

<template>
  <section class="hero-layout panel">
    <div class="hero-copy">
      <slot name="eyebrow" />
      <slot name="title" />
    </div>
    <div class="hero-visual">
      <slot name="visual" />
    </div>
    <div class="hero-bottom">
      <slot name="bottom" />
    </div>
  </section>
</template>

<style scoped>
.hero-layout {
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: auto auto;
  align-items: center;
  gap: 18px;
  min-height: 0;
  padding: 20px 26px;
}
.hero-layout::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: var(--hero-tint), linear-gradient(140deg, var(--surface) 42%, var(--surface) 100%);
}
.hero-layout > * {
  position: relative;
  z-index: 1;
}
.hero-copy {
  grid-column: 1;
  grid-row: 1;
  align-self: stretch;
  min-width: 0;
  max-width: 620px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.hero-copy :slotted(.eyebrow) {
  margin: 0;
}
.hero-copy :slotted(h1) {
  margin: 0;
  color: var(--ink);
  font-size: clamp(31px, 3.4vw, 44px);
  font-weight: 800;
  line-height: 1.5;
  letter-spacing: -0.055em;
  overflow-wrap: anywhere;
}
.hero-visual {
  grid-column: 2;
  grid-row: 1;
  align-self: end;
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.hero-visual :deep(.scheme-keycaps) {
  --cap: var(--hero-keycap-size);
  min-height: 0;
  padding: 0;
  gap: 6px;
}
.hero-bottom {
  grid-column: 1 / -1;
  grid-row: 2;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
@media (max-width: 800px) {
  .hero-layout {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto;
    align-items: stretch;
    gap: 16px;
    padding: 20px;
  }
  .hero-copy {
    grid-column: 1;
    grid-row: 1;
    max-width: none;
  }
  .hero-visual {
    grid-column: 1;
    grid-row: 2;
    align-self: stretch;
    min-height: 0;
  }
  .hero-bottom {
    grid-column: 1;
    grid-row: 3;
  }
  .hero-copy :slotted(h1) {
    font-size: 30px;
  }
}
@media (max-width: 560px) {
  .hero-layout {
    padding: 18px 16px;
  }
  .hero-copy :slotted(h1) {
    font-size: 28px;
  }
}
</style>
