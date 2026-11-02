<script setup lang="ts">
/**
 * 教学页「示例」网格：卡片多时只渲染可视窗口附近的行，
 * 窗口外用占位行保持滚动高度与卡片位置。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { AtomId, PracticeWord } from '@shuangpin/core'
import CharacterCard from './CharacterCard.vue'
import ScrollTail from '@/components/common/ScrollTail.vue'

const props = withDefaults(
  defineProps<{
    words: PracticeWord[]
    focusAtoms?: readonly AtomId[]
    focusBadge?: string
  }>(),
  { focusAtoms: () => [], focusBadge: '新' },
)

/** 卡片宽高比（与 CharacterCard 的 aspect-ratio 一致） */
const CARD_RATIO = 392 / 340
const GRID_GAP = 10
/** 卡片数超过该值才启用窗口化；普通课（中位数 18 张）直接全量渲染。 */
const WINDOW_THRESHOLD = 60
/** 一次渲染的行数：覆盖可视区（取决于面板高度）上下各留缓冲。 */
const ROWS_PER_WINDOW = 9

const gridRef = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const gridWidth = ref(0)
const narrow = ref(false)
let resizeObserver: ResizeObserver | undefined
let rafId = 0

const columns = computed(() => (narrow.value ? 2 : 3))
const columnWidth = computed(() => {
  if (gridWidth.value <= 0) return 0
  return Math.max(0, (gridWidth.value - (columns.value - 1) * GRID_GAP) / columns.value)
})
const rowHeight = computed(() => columnWidth.value * CARD_RATIO + GRID_GAP)
const rowCount = computed(() => Math.ceil(props.words.length / columns.value))
// ≤640px 时 CSS 把网格切成 2 列并改为自然高度（页面整体滚动），此时不能窗口化。
const windowed = computed(() => !narrow.value && props.words.length > WINDOW_THRESHOLD)

const windowStartRow = computed(() => {
  if (!windowed.value || rowHeight.value <= 0) return 0
  return Math.max(0, Math.floor(scrollTop.value / rowHeight.value) - 1)
})
const windowEndRow = computed(() => {
  if (!windowed.value) return rowCount.value
  return Math.min(rowCount.value, windowStartRow.value + ROWS_PER_WINDOW)
})

const visibleWords = computed(() => {
  const start = windowStartRow.value * columns.value
  const end = Math.min(props.words.length, windowEndRow.value * columns.value)
  return props.words.slice(start, end)
})
const padTop = computed(() =>
  windowed.value && rowHeight.value > 0 ? windowStartRow.value * rowHeight.value : 0,
)
const padBottom = computed(() => {
  if (!windowed.value || rowHeight.value <= 0) return 0
  return Math.max(0, (rowCount.value - windowEndRow.value) * rowHeight.value)
})

function syncWidth(): void {
  const el = gridRef.value
  if (!el) return
  const width = el.clientWidth
  if (width > 0) gridWidth.value = width
}

function onScroll(): void {
  if (rafId) return
  rafId = requestAnimationFrame(() => {
    rafId = 0
    const el = gridRef.value
    if (el) scrollTop.value = el.scrollTop
  })
}

function resetScroll(): void {
  scrollTop.value = 0
  gridRef.value?.scrollTo({ top: 0 })
}

const mediaQuery = typeof window !== 'undefined' ? window.matchMedia('(max-width: 640px)') : null
function syncNarrow(): void {
  const next = mediaQuery?.matches ?? false
  if (next !== narrow.value) {
    narrow.value = next
    resetScroll()
  }
}

function onWindowResize(): void {
  syncWidth()
}

onMounted(() => {
  syncNarrow()
  mediaQuery?.addEventListener('change', syncNarrow)
  requestAnimationFrame(syncWidth)
  if (gridRef.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(syncWidth)
    resizeObserver.observe(gridRef.value)
  }
  window.addEventListener('resize', onWindowResize)
  gridRef.value?.addEventListener('scroll', onScroll, { passive: true })
})

onBeforeUnmount(() => {
  mediaQuery?.removeEventListener('change', syncNarrow)
  resizeObserver?.disconnect()
  resizeObserver = undefined
  window.removeEventListener('resize', onWindowResize)
  gridRef.value?.removeEventListener('scroll', onScroll)
  if (rafId) cancelAnimationFrame(rafId)
})

watch(
  () => props.words,
  () => {
    resetScroll()
  },
)
</script>

<template>
  <div class="example-wrap">
    <div ref="gridRef" class="example-grid">
      <!-- 窗口外的行用占位撑起滚动高度（占位高度要扣掉自身参与的 10px 网格间距） -->
      <div
        v-if="padTop > 0"
        class="example-spacer"
        :style="{ height: `${Math.max(0, padTop - GRID_GAP)}px` }"
        aria-hidden="true"
      />
      <CharacterCard
        v-for="(word, index) in visibleWords"
        :key="`${word.text}-${windowStartRow * columns + index}`"
        :char="word.chars[0] ?? word.text"
        :pinyin="word.syllables[0]?.pinyinTone ?? ''"
        :initial-text="word.syllables[0]?.initial ?? ''"
        :caps="word.syllables[0]?.caps ?? []"
        :input="[]"
        :focus-atoms="focusAtoms"
        :focus-badge="focusBadge"
        :tier="1"
        :show-input="false"
      />
      <p v-if="words.length === 0" class="example-empty">本课暂无示例</p>
      <div
        v-if="padBottom > 0"
        class="example-spacer"
        :style="{ height: `${Math.max(0, padBottom - GRID_GAP)}px` }"
        aria-hidden="true"
      />
    </div>
    <!-- 底部渐隐：替代 mask-image（mask 作用在超长滚动层上会让重排/滚动变慢） -->
    <span v-if="words.length > 0" class="example-fade" aria-hidden="true" />
    <ScrollTail :scroller="gridRef" />
  </div>
</template>

<style scoped>
.example-wrap {
  --scroll-tail-inset: 2px;
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
}
.example-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  align-content: start;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  /* 窗口化时滚动高度会突变，禁用滚动锚定 */
  overflow-anchor: none;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  padding: 1px 4px 26px 1px;
}
/* 底部渐隐（视觉等价于原 mask-image，但不给滚动层加合成/遮罩开销） */
.example-fade {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 24px;
  background: linear-gradient(to bottom, transparent, var(--surface));
  pointer-events: none;
}
.example-grid :deep(.char-card) {
  box-shadow: none;
  /* 示例卡比练习卡更紧凑：再次略降高度，内容保持垂直居中、上下留白对称 */
  aspect-ratio: 340 / 392;
  padding-top: 7px;
  padding-bottom: 7px;
}
.example-spacer {
  grid-column: 1 / -1;
  padding: 0;
}
.example-empty {
  grid-column: 1 / -1;
  padding: 12px;
  color: var(--ink-3);
  font-size: var(--text-sm);
}
@media (max-width: 640px) {
  .example-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    overflow-y: visible;
  }
}
</style>
