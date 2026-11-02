<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AtomId, LessonDef, PracticeWord } from '@shuangpin/core'
import type { PassCriteriaLine } from '@shuangpin/core'
import { describePassCriteria } from '@shuangpin/core'
import FocusTagList from '@/components/FocusTagList.vue'
import TutorialExamples from './TutorialExamples.vue'
import {
  buildAnchorViews,
  lessonKindLabel,
  type FocusAtomView,
  type LessonNote,
} from '@/lib/lessonView'

const props = withDefaults(
  defineProps<{
    lesson: LessonDef
    lessonOrder: number
    focusItems: FocusAtomView[]
    notes: LessonNote[]
    examples: PracticeWord[]
    focusAtoms?: readonly AtomId[]
    focusBadge?: string
    startLabel?: string
  }>(),
  { focusAtoms: () => [], focusBadge: '新', startLabel: '开始学习' },
)

const emit = defineEmits<{ start: [] }>()

/** 记忆锚点：仅在本课 focus 的 initial/final 原子 ≤3 个时显示 */
const anchorRows = computed(() => buildAnchorViews(props.lesson, props.focusItems))

/** 评分标准：与 core evaluateLesson 同一份门槛数据 */
const ratingLines = computed<PassCriteriaLine[]>(() => {
  const criteria = props.lesson.passCriteria
  return criteria ? describePassCriteria(criteria) : []
})

const allTips = computed(() => props.notes.flatMap((note) => note.bullets))
/** 把生成课程的「编码补充」长句拆成推荐码 / 兼容映射两组；普通 tips 单独展示。 */
const recommendedTips = computed(() => {
  const lines: string[] = []
  for (const tip of allTips.value) {
    const body = tip.replace(/^编码补充（[^）]*）：/, '')
    for (const part of body.split('；')) {
      const [recommended, compat] = part.split(/，兼容码/)
      if (recommended?.includes('推荐码')) lines.push(recommended.trim())
      if (compat) lines.push(`兼容码 ${compat.trim()}`)
    }
  }
  return lines
})
const compatTips = computed(() => recommendedTips.value.filter((tip) => tip.startsWith('兼容码')))
const recommendedOnlyTips = computed(() => recommendedTips.value.filter((tip) => !tip.startsWith('兼容码')))
const otherTips = computed(() =>
  allTips.value.filter((tip) => !/推荐码|兼容|编码补充/.test(tip)),
)
const hasTips = computed(
  () =>
    recommendedOnlyTips.value.length > 0 ||
    compatTips.value.length > 0 ||
    otherTips.value.length > 0 ||
    anchorRows.value.length > 0,
)

/** 悬停示例时，课程技巧收起到标题行，示例向上占满。 */
const examplesHovered = ref(false)
</script>

<template>
  <div class="tutorial-single">
    <div class="tutorial-top">
      <section class="tutorial-card panel">
        <header class="tutorial-head">
          <div class="tutorial-head-copy">
            <p class="eyebrow tutorial-eyebrow">第 {{ lessonOrder }} 课 · {{ lessonKindLabel(lesson.kind) }}</p>
            <h1 class="tutorial-title">{{ lesson.title }}</h1>
          </div>
          <button class="btn btn--primary tutorial-start" type="button" @click="emit('start')">
            {{ startLabel }}
            <kbd>Enter</kbd>
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4.5 12h15" /><path d="m13.5 6 6 6-6 6" />
            </svg>
          </button>
        </header>

        <div class="tutorial-range">
          <header class="range-head panel-head">
            <h2 class="panel-title">课程范围</h2>
            <span class="count-badge">{{ focusItems.length }} 个映射</span>
          </header>
          <div class="focus-block thin-scroll" :class="{ 'is-wide': focusItems.length > 8 }">
            <FocusTagList :items="focusItems" />
            <span v-if="focusItems.length === 0" class="focus-empty">键位总览 · 无新键</span>
          </div>
        </div>

        <section v-if="ratingLines.length" class="tutorial-rating" aria-label="评分标准">
          <header class="range-head panel-head">
            <h2 class="panel-title">评分标准</h2>
            <span class="count-badge">{{ ratingLines.length }} 档</span>
          </header>
          <div class="rating-lines thin-scroll">
            <p v-for="line in ratingLines" :key="line.label" class="rating-line">
              <b>{{ line.label }}</b>
              <span>{{ line.text }}</span>
            </p>
          </div>
        </section>
      </section>

      <aside class="tutorial-side">
        <section
          v-if="hasTips"
          class="tutorial-notes panel"
          :class="{ 'is-collapsed': examplesHovered }"
          aria-label="课程技巧"
        >
          <header class="panel-head tutorial-side-head">
            <h2 class="panel-title">课程技巧</h2>
            <span class="count-badge">本课</span>
          </header>
          <div v-show="!examplesHovered" class="notes-body thin-scroll">
            <section v-if="recommendedOnlyTips.length" class="tip-section">
              <h3>推荐码</h3>
              <ul class="tip-bullets">
                <li v-for="tip in recommendedOnlyTips" :key="tip">{{ tip }}</li>
              </ul>
            </section>

            <section v-if="compatTips.length" class="tip-section">
              <h3>兼容映射</h3>
              <ul class="tip-bullets">
                <li v-for="tip in compatTips" :key="tip">{{ tip }}</li>
              </ul>
            </section>

            <section v-if="anchorRows.length" class="tip-section">
              <h3>助记</h3>
              <div class="anchors-list">
                <div v-for="row in anchorRows" :key="row.atomId" class="anchor-row">
                  <span class="anchor-label" :class="`is-${row.type}`">{{ row.label.toUpperCase() }}</span>
                  <span v-if="row.keys.length" class="anchor-key">
                    {{ row.keys.map((key) => key.toUpperCase()).join(' + ') }} 键
                  </span>
                  <span v-if="row.mnemonic" class="anchor-mnemonic">{{ row.mnemonic }}</span>
                  <span v-if="row.anchors.length" class="anchor-chips">
                    <span v-for="anchor in row.anchors" :key="anchor" class="anchor-chip">{{ anchor }}</span>
                  </span>
                </div>
              </div>
            </section>

            <section v-if="otherTips.length" class="tip-section">
              <h3>其他技巧</h3>
              <ul class="tip-bullets">
                <li v-for="tip in otherTips" :key="tip">{{ tip }}</li>
              </ul>
            </section>
          </div>
        </section>

        <section
          class="tutorial-examples panel"
          :class="{ 'is-expanded': examplesHovered }"
          aria-label="示例"
          @mouseenter="examplesHovered = true"
          @mouseleave="examplesHovered = false"
        >
          <header class="panel-head tutorial-side-head">
            <h2 class="panel-title">示例</h2>
            <span class="count-badge">{{ examples.length }} 张</span>
          </header>
          <TutorialExamples :words="examples" :focus-atoms="focusAtoms" :focus-badge="focusBadge" />
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.tutorial-single {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  animation: ui-fade-up 240ms var(--ease);
}
.tutorial-top {
  display: grid;
  grid-template-columns: minmax(0, 1.04fr) minmax(0, 0.96fr);
  gap: 16px;
  align-items: stretch;
  width: 100%;
  max-width: 1080px;
  flex: 1;
  min-height: 0;
  margin: 0 auto;
}
.tutorial-card {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  position: relative;
  z-index: 1;
  padding: 20px 22px 18px;
}
.tutorial-head {
  flex: none;
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.tutorial-head-copy {
  flex: 1 1 200px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.tutorial-eyebrow {
  margin: 0;
}
.tutorial-title {
  margin: 0;
  color: var(--ink);
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.22;
  overflow-wrap: anywhere;
}
.tutorial-start {
  flex: none;
  min-height: 38px;
  margin-left: auto;
}
.tutorial-range {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.range-head {
  flex: none;
  margin-bottom: 10px;
}
.panel-head .panel-title {
  font-size: 13px;
}
.focus-block {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  padding: 14px;
  border-radius: var(--r-md);
  background: var(--surface-2);
  border: 1px solid var(--line-faint);
}
.focus-block.is-wide :deep(.focus-tag-list) {
  padding-right: 6px;
}
.focus-empty {
  align-self: center;
  display: inline-block;
  padding: 5px 10px;
  border-radius: var(--r-control);
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--ink-3);
  font-size: var(--text-sm);
}
.tutorial-rating {
  flex: none;
  max-height: 40%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--line-faint);
}
.tutorial-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow: hidden;
}
.tutorial-notes {
  flex: 0 1 auto;
  max-height: 48%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 16px;
  overflow: hidden;
}
.tutorial-notes.is-collapsed {
  flex: 0 0 auto;
  max-height: none;
}
.tutorial-notes.is-collapsed .tutorial-side-head {
  margin-bottom: 0;
}
.tutorial-examples {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 16px;
  overflow: hidden;
}
.tutorial-examples.is-expanded {
  flex: 1 1 auto;
}
.tutorial-side-head {
  flex: none;
  margin-bottom: 10px;
}
.notes-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
  padding-right: 2px;
}
.tip-section + .tip-section {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--line-faint);
}
.tip-section h3 {
  margin: 0 0 6px;
  color: var(--ink-3);
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0.05em;
}
.tip-bullets {
  margin: 0;
  padding-left: 15px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tip-bullets li {
  color: var(--ink-2);
  font-size: 11px;
  line-height: 1.65;
}
.anchors-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.anchor-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 3px 8px;
  min-width: 0;
}
.anchor-label {
  flex: none;
  padding: 2px 7px;
  border-radius: 6px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 800;
  line-height: 1.4;
}
.anchor-label.is-initial {
  color: var(--focus-initial);
  background: color-mix(in srgb, var(--focus-initial) 12%, transparent);
}
.anchor-label.is-final {
  color: var(--focus-final);
  background: color-mix(in srgb, var(--focus-final) 14%, transparent);
}
.anchor-label.is-zero {
  color: var(--brand-ink);
  background: var(--brand-soft);
}
.anchor-key {
  flex: none;
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 650;
}
.anchor-mnemonic {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--ink-2);
  font-size: 11px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.anchor-chips {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
}
.anchor-chip {
  padding: 1px 7px;
  border-radius: 5px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink-3);
  font-size: 10px;
  line-height: 1.5;
}
.rating-lines {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 2px;
}
.rating-line {
  margin: 0;
  display: grid;
  grid-template-columns: 2.6em minmax(0, 1fr);
  column-gap: 8px;
  align-items: baseline;
  color: var(--ink-3);
  font-size: 11px;
  line-height: 1.55;
}
.rating-line b {
  flex: none;
  color: var(--star);
  font-weight: 800;
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
}
.rating-line span {
  min-width: 0;
  overflow-wrap: anywhere;
}
@media (max-width: 980px) {
  .tutorial-top {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 2.2fr) minmax(0, 1.2fr);
    gap: 10px;
    min-height: 0;
    max-width: 640px;
  }
  .tutorial-card,
  .tutorial-side {
    min-height: 0;
  }
  .tutorial-notes {
    max-height: 45%;
  }
  .anchor-mnemonic {
    flex-basis: 100%;
    width: 100%;
  }
}
@media (max-width: 640px) {
  .tutorial-single {
    flex: none;
    min-height: 0;
  }
  .tutorial-top {
    display: flex;
    flex-direction: column;
    height: auto;
    min-height: 0;
    max-width: none;
    gap: 10px;
  }
  .tutorial-card {
    flex: none;
    padding: 14px;
    overflow: visible;
  }
  .tutorial-head {
    margin-bottom: 10px;
  }
  .tutorial-start {
    width: 100%;
    justify-content: center;
    margin-left: 0;
  }
  .tutorial-title {
    font-size: 20px;
  }
  .tutorial-range {
    flex: none;
    overflow: visible;
  }
  .focus-block {
    flex: none;
    overflow: visible;
    padding: 12px;
  }
  .tutorial-rating {
    max-height: none;
    overflow: visible;
    margin-top: 10px;
  }
  .tutorial-side {
    flex: none;
    overflow: visible;
    gap: 10px;
  }
  .tutorial-notes {
    flex: none;
    max-height: none;
    overflow: visible;
    padding: 12px;
  }
  .notes-body {
    flex: none;
    overflow: visible;
  }
  .tutorial-examples {
    flex: none;
    height: 300px;
    min-height: 300px;
    padding: 12px 12px 8px;
  }
  .tutorial-notes.is-collapsed .notes-body {
    display: none;
  }
  .tutorial-side-head {
    margin-bottom: 6px;
  }
  .rating-line {
    font-size: 10px;
    line-height: 1.45;
    gap: 4px;
  }
  .anchor-chips {
    display: none;
  }
  .anchor-chip {
    display: none;
  }
  .tip-bullets li {
    font-size: 10px;
    line-height: 1.5;
  }
}
</style>
