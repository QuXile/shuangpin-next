<script setup lang="ts">
/**
 * 文章练习行渲染：按 core 解析出的行（每行 ≤5 字）渲染 CharacterCard；
 * 读音无法解析的汉字以跳过样式展示、不参与判题。自动把当前字滚到视口中间。
 */
import { computed, nextTick, ref, watch } from 'vue'
import type { AtomId, PracticeCap, SessionState } from '@shuangpin/core'
import CharacterCard from '@/components/practice/CharacterCard.vue'
import type { ArticlePlan } from '@shuangpin/core'

const props = defineProps<{
  plan: ArticlePlan
  session: SessionState
  revealed: ReadonlySet<string>
  wrongInputs: ReadonlyMap<string, string[]>
  hiddenAtoms?: readonly AtomId[]
  hideZero?: boolean
  /** 文章末尾追加结束卡片 */
  end?: boolean
}>()

interface CellView {
  wordIndex: number | null
  char: string
  charIndex: number
  active: boolean
  completed: boolean
  input: string[]
  inputState: 'idle' | 'wrong' | 'correct'
  revealed: boolean
  pinyin: string
  initialText: string
  caps: PracticeCap[]
}

const cellEls = ref<(HTMLElement | null)[]>([])
const scrollRef = ref<HTMLElement | null>(null)

function setCellEl(el: Element | null, wordIndex: number | null): void {
  if (wordIndex === null) return
  cellEls.value[wordIndex] = el instanceof HTMLElement ? el : null
}

const lines = computed<CellView[][]>(() => {
  const session = props.session
  const finished = session.phase === 'finished'
  return props.plan.cells.map((line) =>
    line.map((cell) => {
      if (cell.wordIndex === null) {
        return {
          wordIndex: null,
          char: cell.char,
          charIndex: 0,
          active: false,
          completed: false,
          input: [],
          inputState: 'idle',
          revealed: false,
          pinyin: '',
          initialText: '',
          caps: [],
        }
      }
      const wordIndex = cell.wordIndex
      const wordState = session.words[wordIndex]
      const syllable = wordState?.word.syllables[0]
      if (!wordState || !syllable) {
        return {
          wordIndex: null,
          char: cell.char,
          charIndex: 0,
          active: false,
          completed: false,
          input: [],
          inputState: 'idle',
          revealed: false,
          pinyin: '',
          initialText: '',
          caps: [],
        }
      }
      const charIndex = wordState.charIndex
      const key = `${wordIndex}:${charIndex}`
      const completed = finished || wordIndex < session.index
      const active = !finished && wordIndex === session.index
      const wrong = active ? props.wrongInputs.get(key) : undefined
      const historyInput = wordState.charInputs?.[0]
      const input = wrong ?? (active ? wordState.input : completed ? (historyInput ?? syllable.caps.map((cap) => cap.key)) : [])
      const inputState: CellView['inputState'] = wrong ? 'wrong' : completed ? 'correct' : 'idle'
      return {
        wordIndex,
        char: cell.char,
        charIndex,
        active,
        completed,
        input,
        inputState,
        revealed: props.revealed.has(key),
        pinyin: syllable.pinyinTone,
        initialText: syllable.initial,
        caps: syllable.caps,
      }
    }),
  )
})

watch(
  () => props.end,
  async (end) => {
    if (!end) return
    await nextTick()
    const el = scrollRef.value
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  },
  { immediate: true },
)

watch(
  () => props.session.index,
  async (index) => {
    await nextTick()
    const el = cellEls.value[index]
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  },
  { immediate: true },
)
</script>

<template>
  <div ref="scrollRef" class="article-scroll thin-scroll">
    <div class="article-lines">
      <div v-for="(line, lineIndex) in lines" :key="lineIndex" class="article-line">
        <template v-for="(cell, cellIndex) in line" :key="`${lineIndex}-${cellIndex}`">
          <span v-if="cell.wordIndex === null" class="article-skipped" :title="`「${cell.char}」读音无法解析，已跳过`">
            {{ cell.char }}
          </span>
          <div
            v-else
            :ref="(el) => setCellEl(el as Element | null, cell.wordIndex)"
            class="article-cell"
          >
            <CharacterCard
              :char="cell.char"
              :pinyin="cell.pinyin"
              :initial-text="cell.initialText"
              :caps="cell.caps"
              :input="cell.input"
              :tier="1"
              :active="cell.active"
              :completed="cell.completed"
              :revealed="cell.revealed"
              :input-state="cell.inputState"
              :hidden-atoms="hiddenAtoms ?? []"
              :hide-zero="hideZero ?? false"
            />
          </div>
        </template>
      </div>
    </div>
    <Transition name="session-card" appear>
      <div v-if="end && $slots.end" class="article-end">
        <slot name="end" />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.article-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
  padding: 6px 4px 24px;
}
.article-lines {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-width: min-content;
  margin: 0 auto;
}
.article-line {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}
.article-end {
  width: min(100%, var(--content-session));
  margin: 18px auto 0;
  padding: 0 2px;
}
.article-cell {
  flex: 0 0 auto;
  width: clamp(64px, 9vw, 128px);
}
.article-skipped {
  flex: 0 0 auto;
  width: clamp(24px, 3.4vw, 44px);
  min-height: 40px;
  display: grid;
  place-items: center;
  color: var(--ink-4);
  font-size: var(--text-base);
  border: 1px dashed var(--line);
  border-radius: var(--r-card);
  background: var(--surface-2);
}
@media (max-width: 640px) {
  .article-line {
    gap: 4px;
  }
  .article-cell {
    width: clamp(56px, 18vw, 76px);
  }
  .article-skipped {
    width: 22px;
    font-size: var(--text-xs);
  }
}
</style>
