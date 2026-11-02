<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AtomId, LessonDef, PracticeWord } from '@shuangpin/core'
import type { PassCriteriaLine } from '@shuangpin/core'
import { describePassCriteria } from '@shuangpin/core'
import FocusTagList from '@/components/FocusTagList.vue'
import KeyCap from '@/components/common/KeyCap.vue'
import ScrollTail from '@/components/common/ScrollTail.vue'
import TutorialExamples from './TutorialExamples.vue'
import AnchorTips from './AnchorTips.vue'
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

const focusScrollRef = ref<HTMLElement | null>(null)
const notesBodyRef = ref<HTMLElement | null>(null)

/** 记忆锚点：仅在本课 focus 的 initial/final 原子 ≤3 个时显示 */
const anchorRows = computed(() => buildAnchorViews(props.lesson, props.focusItems))

/** 评分标准：与 core evaluateLesson 同一份门槛数据 */
const ratingLines = computed<PassCriteriaLine[]>(() => {
  const criteria = props.lesson.passCriteria
  return criteria ? describePassCriteria(criteria) : []
})

const allTips = computed(() => props.notes.flatMap((note) => note.bullets))
interface CodeTipLine {
  kind: 'recommended' | 'compat'
  syllable: string
  codes: string[]
}
/** 生成课程的编码说明：解析成「音节 + 键位序列」，键位用键帽渲染。 */
const codeTips = computed<CodeTipLine[]>(() => {
  const lines: CodeTipLine[] = []
  for (const tip of allTips.value) {
    for (const part of tip.split('；')) {
      const line = part.trim()
      const recommended = /^推荐码：(.+?) 所推荐的键位组合为特别的 (.+)$/.exec(line)
      if (recommended) {
        lines.push({
          kind: 'recommended',
          syllable: recommended[1]!,
          codes: recommended[2]!.split(/\s*\/\s*/).filter(Boolean),
        })
        continue
      }
      const compat = /^兼容映射：(.+?) 兼容的特别键位组合还包括 (.+)$/.exec(line)
      if (compat) {
        lines.push({
          kind: 'compat',
          syllable: compat[1]!,
          codes: compat[2]!.split(/\s*\/\s*/).filter(Boolean),
        })
      }
    }
  }
  return lines
})
const otherTips = computed(() => allTips.value.filter((tip) => !/^(推荐码：|兼容映射：)/.test(tip.trim())))
const hasTips = computed(
  () => codeTips.value.length > 0 || otherTips.value.length > 0 || anchorRows.value.length > 0,
)

/** 只有悬停示例时才把课程技巧收起到标题行；悬停技巧本身不触发任何布局变化。 */
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
          <div class="focus-block" :class="{ 'is-wide': focusItems.length > 8 }">
            <header class="range-head panel-head">
              <h2 class="panel-title">课程范围</h2>
              <span class="count-badge">{{ focusItems.length }} 个映射</span>
            </header>
            <div ref="focusScrollRef" class="focus-scroll thin-scroll scroll-y">
              <FocusTagList :items="focusItems" />
              <span v-if="focusItems.length === 0" class="empty-note">键位总览 · 无新键</span>
            </div>
            <ScrollTail :scroller="focusScrollRef" />
          </div>
        </div>

        <section v-if="ratingLines.length" class="tutorial-rating" aria-label="评分标准">
          <header class="range-head panel-head">
            <h2 class="panel-title">评分标准</h2>
            <span class="count-badge">{{ ratingLines.length }} 档</span>
          </header>
          <div class="rating-lines thin-scroll scroll-y">
            <p v-for="line in ratingLines" :key="line.label" class="criteria-line">
              <b>{{ line.label }}</b>
              <span>{{ line.text }}</span>
            </p>
          </div>
        </section>
      </section>

      <aside class="tutorial-side" :class="{ 'no-tips': !hasTips }">
        <section v-if="hasTips" class="tutorial-notes panel" aria-label="课程技巧">
          <header class="panel-head tutorial-side-head">
            <h2 class="panel-title">课程技巧</h2>
            <span class="count-badge">本课</span>
          </header>
          <div ref="notesBodyRef" class="notes-body thin-scroll scroll-y">
            <section v-if="codeTips.length" class="tip-section">
              <ul class="tip-bullets">
                <li
                  v-for="(tip, index) in codeTips"
                  :key="`${tip.kind}-${tip.syllable}-${index}`"
                  class="tip-code"
                  :class="tip.kind === 'recommended' ? 'is-recommended' : 'is-compat'"
                >
                  <template v-if="tip.kind === 'recommended'">
                    推荐码：<b>{{ tip.syllable }}</b> 所推荐的键位组合为特别的
                    <span class="code-keys">
                      <template v-for="(code, codeIndex) in tip.codes" :key="code">
                        <span v-if="codeIndex > 0" class="code-sep">/</span>
                        <KeyCap :text="code" variant="primary" />
                      </template>
                    </span>
                  </template>
                  <template v-else>
                    兼容映射：<b>{{ tip.syllable }}</b> 兼容的特别键位组合还包括
                    <span class="code-keys">
                      <template v-for="(code, codeIndex) in tip.codes" :key="code">
                        <span v-if="codeIndex > 0" class="code-sep">/</span>
                        <KeyCap :text="code" variant="compat" />
                      </template>
                    </span>
                  </template>
                </li>
              </ul>
            </section>

            <section v-if="anchorRows.length" class="tip-section">
              <AnchorTips :rows="anchorRows" />
            </section>

            <section v-if="otherTips.length" class="tip-section">
              <ul class="tip-bullets">
                <li v-for="tip in otherTips" :key="tip">{{ tip }}</li>
              </ul>
            </section>
          </div>
          <ScrollTail :scroller="notesBodyRef" />
        </section>

        <section class="tutorial-examples panel" aria-label="示例">
          <header class="panel-head tutorial-side-head">
            <h2 class="panel-title">示例</h2>
            <span class="count-badge">{{ examples.length }} 张</span>
          </header>
          <div class="examples-body">
            <TutorialExamples :words="examples" :focus-atoms="focusAtoms" :focus-badge="focusBadge" />
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
  animation: ui-fade-up var(--dur-mid) var(--ease);
}
.tutorial-top {
  display: grid;
  grid-template-columns: minmax(0, 1.04fr) minmax(0, 0.96fr);
  gap: 16px;
  align-items: stretch;
  width: 100%;
  max-width: var(--content-narrow);
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
  font-size: var(--text-display-sm);
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

.tutorial-eyebrow {
  font-size: var(--text-xs);
}
.tutorial-card :deep(.focus-tag) {
  font-size: var(--text-sm);
}
.tutorial-card :deep(.focus-keys kbd) {
  font-size: var(--text-xs);
}
.focus-block {
  /* 「还有内容」提示的渐隐底色与课程范围卡背景一致 */
  --scroll-tail-bg: var(--surface-2);
  --scroll-tail-inset: 14px;
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 14px;
  border-radius: var(--r-card);
  background: var(--surface-2);
  border: 1px solid var(--line);
  overflow: hidden;
}

.focus-block.is-wide :deep(.focus-tag-list) {
  padding-right: 6px;
}

.tutorial-rating {
  flex: none;
  max-height: 40%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
.tutorial-side {
  display: grid;
  grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  min-height: 0;
  overflow: hidden;
}
/* 课程技巧 / 示例：固定两等分面板，正文各自滚动；不做任何悬浮/展开的高度动画。 */
.tutorial-side.no-tips {
  grid-template-rows: minmax(0, 1fr);
}
.tutorial-notes,
.tutorial-examples {
  --scroll-tail-inset: 16px;
  position: relative;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 16px;
  box-shadow: none;
}
.notes-body,
.examples-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding-right: 2px;
}
.notes-body {
  overflow-y: auto;
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
}
.examples-body {
  display: flex;
  flex-direction: column;
}
.tutorial-side-head {
  flex: none;
  margin-bottom: 10px;
}
.tip-section + .tip-section {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--line);
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
  font-size: var(--text-base);
  line-height: 1.7;
}
.tip-code {
  font-weight: 700;
}
.tip-code.is-recommended { color: var(--brand); }
.tip-code.is-compat { color: var(--fin); }
.tip-code b {
  color: inherit;
  font-weight: 800;
}
.code-keys {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  vertical-align: middle;
}
.code-sep {
  color: var(--ink-4);
  font-size: var(--text-xs);
}
















@media (max-width: 1024px) {
  /* 平板/窄屏不再做“固定视口两栏”，而是自然流式布局，页面自身滚动。 */
  .tutorial-top {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    max-width: 640px;
    flex: none;
  }
  .tutorial-card,
  .tutorial-side {
    flex: none;
    min-height: 0;
  }
  .tutorial-range {
    flex: none;
  }
  .focus-block {
    flex: none;
    max-height: 300px;
    overflow: hidden;
  }
  .focus-scroll {
    overflow-y: auto;
  }
  .tutorial-side {
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow: visible;
  }
  .tutorial-notes,
  .tutorial-examples {
    min-height: 0;
    overflow: visible;
  }
  .tutorial-examples {
    max-height: 430px;
  }
  .examples-body {
    overflow-y: auto;
  }
  .tutorial-examples .example-grid {
    max-height: none;
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
    font-size: var(--text-lg);
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
  .focus-scroll {
    flex: none;
    overflow: visible;
    max-height: none;
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
    transition: none;
  }
  .notes-body {
    flex: none;
    max-height: none;
    overflow: visible;
    opacity: 1;
    transition: none;
  }
  .tutorial-examples {
    flex: none;
    height: 300px;
    min-height: 300px;
    padding: 12px 12px 8px;
  }
  .tutorial-side-head {
    margin-bottom: 6px;
  }
  .rating-line {
    font-size: var(--text-2xs);
    line-height: 1.45;
    gap: 4px;
  }
  .tip-bullets li {
    font-size: var(--text-2xs);
    line-height: 1.5;
  }
}
</style>
