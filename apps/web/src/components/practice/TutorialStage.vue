<script setup lang="ts">
import { computed } from 'vue'
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
  { focusAtoms: () => [], focusBadge: '新', startLabel: '开始练习' },
)

const emit = defineEmits<{ start: [] }>()

/** 记忆锚点：仅在本课 focus 的 initial/final 原子 ≤3 个时显示 */
const anchorRows = computed(() => buildAnchorViews(props.lesson, props.focusItems))

/** 评分标准：与 core evaluateLesson 同一份门槛数据 */
const ratingLines = computed<PassCriteriaLine[]>(() => {
  const criteria = props.lesson.passCriteria
  return criteria ? describePassCriteria(criteria) : []
})
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
          <div
            class="focus-block thin-scroll"
            :class="{ 'is-wide': focusItems.length > 8 }"
          >
            <FocusTagList :items="focusItems" />
            <span v-if="focusItems.length === 0" class="focus-empty">键位总览 · 无新键</span>
          </div>
        </div>

        <div v-if="anchorRows.length || notes.length" class="tutorial-bottom">
          <section v-if="anchorRows.length" class="anchors-card" aria-label="记忆锚点">
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

          <section v-if="notes.length" class="notes-card" aria-label="本课技巧">
            <div v-for="note in notes" :key="note.title" class="note-item">
              <strong>{{ note.title }}</strong>
              <ul class="note-bullets">
                <li v-for="bullet in note.bullets" :key="bullet">{{ bullet }}</li>
              </ul>
            </div>
          </section>
        </div>

      </section>

      <aside class="tutorial-side">
        <section class="tutorial-examples panel">
          <header class="panel-head tutorial-side-head">
            <h2 class="panel-title">示例</h2>
            <span class="count-badge">{{ examples.length }} 张</span>
          </header>
          <TutorialExamples :words="examples" :focus-atoms="focusAtoms" :focus-badge="focusBadge" />
        </section>

        <section v-if="ratingLines.length" class="tutorial-rating panel" aria-label="评分标准">
          <header class="panel-head tutorial-side-head">
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
  overflow: visible;
  position: relative;
  z-index: 1;
  padding: 20px 22px 22px;
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
/* 映射标签始终从顶部开始，少量/大量映射保持同一视觉规则 */
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
.tutorial-bottom {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}
.anchors-card,
.notes-card {
  flex: none;
  padding: 10px 12px;
  border-radius: var(--r-sm);
  border: 1px solid var(--line-faint);
  background: var(--surface-2);
}
.anchors-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-right: 2px;
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
.note-item {
  display: flex;
  gap: 8px;
  padding: 3px 0;
  color: var(--ink-3);
  font-size: 11px;
  line-height: 1.6;
}
.note-item + .note-item {
  border-top: 1px dashed var(--line-faint);
}
.note-item strong {
  flex: none;
  color: var(--ink-2);
  font-weight: 650;
}
.note-bullets {
  flex: 1;
  margin: 0;
  padding-left: 15px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.note-bullets li {
  color: var(--ink-3);
  font-size: 11px;
  line-height: 1.6;
}
.tutorial-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow: hidden;
}
.tutorial-examples {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 16px;
  overflow: hidden;
}
.tutorial-rating {
  flex: none;
  max-height: 42%;
  display: flex;
  flex-direction: column;
  padding: 16px;
  overflow: hidden;
}
.tutorial-side-head {
  flex: none;
  margin-bottom: 10px;
}
.rating-lines {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
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
  .tutorial-bottom {
    max-height: none;
    margin-top: 10px;
    gap: 6px;
  }
  .tutorial-side {
    flex: none;
    overflow: visible;
    gap: 10px;
  }
  .tutorial-examples {
    flex: none;
    height: 300px;
    min-height: 300px;
    padding: 12px 12px 8px;
  }
  .tutorial-rating {
    flex: none;
    max-height: none;
    padding: 12px 12px 8px;
  }
  .tutorial-side-head {
    margin-bottom: 6px;
  }
  .rating-line {
    font-size: 10px;
    line-height: 1.45;
    gap: 4px;
  }
  .anchors-card {
    padding: 8px 10px;
  }
  .anchor-chips {
    display: none;
  }
  .notes-card {
    padding: 8px 10px;
  }
  .note-item {
    padding: 2px 0;
    font-size: 10px;
    line-height: 1.5;
  }
  .note-bullets li {
    font-size: 10px;
    line-height: 1.5;
  }
}
</style>
