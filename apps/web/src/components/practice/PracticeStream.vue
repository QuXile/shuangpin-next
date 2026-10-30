<script setup lang="ts">
/**
 * 练习流（纯展示）：根据 core SessionState 渲染所有词/字卡片，自动滚动到当前词。
 * 不做判题、不做统计；错误输入/揭示状态由 usePractice 记录后传入。
 */
import { computed, nextTick, ref, watch } from 'vue'
import type { AtomId, SessionState } from '@shuangpin/core'
import CharacterCard from './CharacterCard.vue'
import type { EndPromptView } from '@/composables/usePractice'

const props = withDefaults(
  defineProps<{
    session: SessionState
    mode?: 'grid' | 'list'
    tier?: 1 | 2 | 3
    focusAtoms?: readonly AtomId[]
    focusBadge?: string
    wrongInputs?: ReadonlyMap<string, string[]>
    revealed?: ReadonlySet<string>
    liveMessage?: string
    /** 有限目标完成后的提示行（已达标可 Enter，未达标只能 Alt+Enter 继续） */
    prompt?: EndPromptView | null
    /** 训练页「练习时隐藏」映射 */
    hiddenAtoms?: readonly AtomId[]
    hideZero?: boolean
  }>(),
  {
    mode: 'list',
    tier: 1,
    focusAtoms: () => [],
    focusBadge: '新',
    wrongInputs: () => new Map(),
    revealed: () => new Set(),
    liveMessage: '',
    prompt: null,
    hiddenAtoms: () => [],
    hideZero: false,
  },
)

const emit = defineEmits<{
  primary: []
  continue: []
}>()

interface CellView {
  active: boolean
  completed: boolean
  input: string[]
  revealed: boolean
  inputState: 'idle' | 'wrong' | 'correct'
}

const viewport = ref<HTMLElement | null>(null)
const rowEls = ref<HTMLElement[]>([])
const promptEl = ref<HTMLElement | null>(null)

const currentWordIndex = computed(() => props.session.index)

function setRowEl(el: Element | null, index: number): void {
  if (el instanceof HTMLElement) rowEls.value[index] = el
}

function cellView(wordIndex: number, charIndex: number, capKeys: readonly string[]): CellView {
  const session = props.session
  const finished = session.phase === 'finished'
  const currentWord = session.words[session.index]
  const currentChar = currentWord?.charIndex ?? 0
  const key = `${wordIndex}:${charIndex}`
  const wordBefore = wordIndex < session.index
  const completed = finished || wordBefore || (wordIndex === session.index && charIndex < currentChar)
  const active = !finished && wordIndex === session.index && charIndex === currentChar
  const wrong = active ? props.wrongInputs.get(key) : undefined
  const input = wrong ?? (active ? (currentWord?.input ?? []) : completed ? [...capKeys] : [])
  const inputState: CellView['inputState'] = wrong ? 'wrong' : completed ? 'correct' : 'idle'
  return {
    active,
    completed,
    input,
    revealed: props.revealed.has(key),
    inputState,
  }
}

/** 预先计算每个字的展示状态，避免模板里重复调用 cellView。 */
const cellRows = computed<CellView[][]>(() =>
  props.session.words.map((wordState, wordIndex) =>
    wordState.word.syllables.map((syllable, charIndex) =>
      cellView(wordIndex, charIndex, syllable.caps.map((cap) => cap.key)),
    ),
  ),
)

/** 把活动行滚到视口垂直居中（上下边界 clamp） */
function centerRow(index: number): void {
  const root = viewport.value
  const el = rowEls.value[index]
  if (!root || !el) return
  const max = Math.max(0, root.scrollHeight - root.clientHeight)
  const target = el.offsetTop - (root.clientHeight - el.offsetHeight) / 2
  root.scrollTo({ top: Math.min(max, Math.max(0, target)), behavior: 'smooth' })
}

/** 完成提示行滚到可见（底部对齐） */
function revealPrompt(): void {
  const root = viewport.value
  const el = promptEl.value
  if (!root || !el) return
  const max = Math.max(0, root.scrollHeight - root.clientHeight)
  const target = el.offsetTop + el.offsetHeight - root.clientHeight + 16
  root.scrollTo({ top: Math.min(max, Math.max(0, target)), behavior: 'smooth' })
}

/** 仅在当前行变化（或追加批次）时滚动，避免逐字抖动 */
watch(
  () => [currentWordIndex.value, props.session.words.length] as const,
  async ([index]) => {
    await nextTick()
    if (props.prompt) {
      revealPrompt()
      return
    }
    centerRow(index)
  },
  { immediate: true },
)

watch(
  () => props.prompt,
  async (prompt) => {
    if (!prompt) return
    await nextTick()
    revealPrompt()
  },
  { immediate: true },
)
</script>

<template>
  <div class="stream-shell">
    <p class="sr-only" aria-live="polite">{{ liveMessage }}</p>
    <div ref="viewport" class="stream-viewport thin-scroll">
      <div class="stream-inner" :class="`is-${mode}`">
        <div
          v-for="(wordState, wordIndex) in session.words"
          :key="wordIndex"
          :ref="(el) => setRowEl(el as Element | null, wordIndex)"
          class="stream-word"
          :class="{ 'is-active': wordIndex === session.index }"
        >
          <div class="stream-row">
            <CharacterCard
              v-for="(syllable, charIndex) in wordState.word.syllables"
              :key="charIndex"
              :char="wordState.word.chars[charIndex] ?? syllable.text"
              :pinyin="syllable.pinyinTone"
              :initial-text="syllable.initial"
              :caps="syllable.caps"
              :input="cellRows[wordIndex]?.[charIndex]?.input ?? []"
              :focus-atoms="focusAtoms"
              :focus-badge="focusBadge"
              :tier="tier"
              :active="cellRows[wordIndex]?.[charIndex]?.active ?? false"
              :completed="cellRows[wordIndex]?.[charIndex]?.completed ?? false"
              :input-state="cellRows[wordIndex]?.[charIndex]?.inputState ?? 'idle'"
              :revealed="cellRows[wordIndex]?.[charIndex]?.revealed ?? false"
              :hidden-atoms="hiddenAtoms"
              :hide-zero="hideZero"
            />
          </div>
        </div>
      </div>
      <div v-if="prompt" ref="promptEl" class="end-prompt" :class="{ 'is-met': prompt.met }" role="status">
        <p class="end-prompt-text">
          <strong>{{ prompt.title }}</strong>
          <span>{{ prompt.hint }}</span>
        </p>
        <div class="end-prompt-actions">
          <button
            v-if="prompt.enterLabel"
            class="btn btn--primary end-prompt-btn"
            type="button"
            @click="emit('primary')"
          >
            {{ prompt.enterLabel }}
            <kbd>Enter</kbd>
          </button>
          <button class="btn end-prompt-btn" type="button" @click="emit('continue')">
            继续练习
            <kbd>Alt+Enter</kbd>
          </button>
        </div>
      </div>
    </div>
    <div class="fade fade--top" aria-hidden="true" />
    <div class="fade fade--bottom" aria-hidden="true" />
  </div>
</template>

<style scoped>
.stream-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: 860px;
  margin: 0 auto;
  padding-bottom: 4px;
}
.stream-viewport {
  position: relative;
  flex: 1;
  min-height: 0;
  height: auto;
  width: 100%;
  border-radius: var(--r-lg);
  clip-path: inset(0 round var(--r-lg));
  overflow-y: auto;
  overscroll-behavior: contain;
  scroll-behavior: smooth;
}
.stream-inner {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 4px;
}
.stream-inner.is-grid {
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: center;
  align-content: flex-start;
  gap: 12px 8px;
}
.stream-word {
  display: flex;
  justify-content: center;
  border-radius: calc(var(--r-lg) + 5px);
  padding: 4px;
  width: fit-content;
  max-width: 100%;
  margin: 0 auto;
  transition: background 140ms, box-shadow 140ms;
}
.stream-inner.is-grid .stream-word {
  margin: 0;
}
.stream-word.is-active {
  background: var(--brand-soft);
}
.stream-row {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 8px;
}
.stream-row :deep(.char-card) {
  width: clamp(112px, 13.5vw, 150px);
  flex: 0 0 auto;
}
.fade {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 3;
  height: 16px;
  pointer-events: none;
}
.fade--top {
  top: 0;
  background: linear-gradient(color-mix(in srgb, var(--bg) 72%, transparent), transparent);
}
.fade--bottom {
  bottom: 0;
  background: linear-gradient(transparent, color-mix(in srgb, var(--bg) 72%, transparent));
}
.end-prompt {
  margin: 8px 4px 18px;
  padding: 12px 14px;
  border-radius: var(--r-lg);
  border: 1px solid var(--line);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.end-prompt.is-met {
  border-color: var(--state-success-line);
  background: var(--state-success-bg);
}
.end-prompt-text {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 6px;
  color: var(--ink-2);
  font-size: 12px;
  line-height: 1.6;
}
.end-prompt-text strong {
  font-weight: 650;
}
.end-prompt.is-met .end-prompt-text strong {
  color: var(--state-success-ink);
}
.end-prompt-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.end-prompt-btn {
  height: 32px;
  padding: 0 12px;
  font-size: 12px;
}
.end-prompt-btn kbd {
  margin-left: 2px;
}
</style>
