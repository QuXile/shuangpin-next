<script setup lang="ts">
/**
 * 课程 / 练习场共用 Hero 骨架。
 * 英文眉题置顶、中文标语贴键帽区底边；方案选择在两者较低处下方固定 18px；
 * 卡片高度完全由内容撑开，保证两个页面天然使用同一套间距和字号。
 * 指针在卡片内移动时叠加一层跟随光斑（触屏 / reduced-motion 关闭）。
 */
import { computed, onBeforeUnmount, ref } from 'vue'

const rootRef = ref<HTMLElement | null>(null)
/** 指针位置（卡片内百分比），null 表示指针已离开 */
const spot = ref<{ x: number; y: number } | null>(null)
let raf = 0
let pending: { x: number; y: number } | null = null

const spotStyle = computed(() =>
  spot.value
    ? { '--spot-x': `${spot.value.x.toFixed(1)}%`, '--spot-y': `${spot.value.y.toFixed(1)}%`, '--spot-on': '1' }
    : { '--spot-on': '0' },
)

const reducedMotion = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false

function applySpot(): void {
  raf = 0
  const el = rootRef.value
  if (!el || !pending) return
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return
  spot.value = {
    x: ((pending.x - rect.left) / rect.width) * 100,
    y: ((pending.y - rect.top) / rect.height) * 100,
  }
}

function onPointerMove(event: PointerEvent): void {
  if (event.pointerType !== 'mouse' || reducedMotion()) return
  pending = { x: event.clientX, y: event.clientY }
  if (raf === 0) raf = requestAnimationFrame(applySpot)
}

function onPointerLeave(): void {
  pending = null
  if (raf !== 0) cancelAnimationFrame(raf)
  raf = 0
  spot.value = null
}

onBeforeUnmount(() => {
  if (raf !== 0) cancelAnimationFrame(raf)
})
</script>

<template>
  <section
    ref="rootRef"
    class="hero-layout panel"
    :style="spotStyle"
    @pointermove="onPointerMove"
    @pointerleave="onPointerLeave"
  >
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
/* 指针跟随光斑：叠加在底色之上、内容之下 */
.hero-layout::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  opacity: var(--spot-on, 0);
  transition: opacity var(--dur-mid) var(--ease);
  background: radial-gradient(
    circle at var(--spot-x, 50%) var(--spot-y, 50%),
    color-mix(in srgb, var(--brand) 14%, transparent),
    transparent 55%
  );
}
.hero-copy {
  grid-column: 1;
  grid-row: 1;
  align-self: stretch;
  min-width: 0;
  max-width: var(--content-reading);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.hero-copy :slotted(.eyebrow) {
  margin: 0;
  min-height: 28px;
  display: flex;
  align-items: flex-end;
}
.hero-copy :slotted(h1) {
  margin: 0;
  color: var(--ink);
  font-size: var(--text-display);
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
  --cap-gap: 6px;
  padding: 0;
  gap: var(--cap-gap);
}
.hero-bottom {
  grid-column: 1 / -1;
  grid-row: 2;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
@media (max-width: 1024px) {
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
    font-size: var(--text-display);
  }
}
@media (max-width: 640px) {
  .hero-layout {
    padding: 18px 16px;
  }
  .hero-copy :slotted(h1) {
    font-size: var(--text-display-sm);
  }
}
</style>
