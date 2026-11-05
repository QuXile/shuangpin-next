<script setup lang="ts">
/**
 * 练习流（纯展示）：根据 core SessionState 渲染所有词/字卡片，自动滚动到当前词。
 * 不做判题、不做统计；错误输入/揭示状态由 usePractice 记录后传入。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { AtomId, SessionState } from '@shuangpin/core'
import CharacterCard from './CharacterCard.vue'
import SessionSummaryCard from './SessionSummaryCard.vue'
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
    /** 有限目标完成后的总结卡（达标自动记录，可在操作区继续或重新开始） */
    prompt?: EndPromptView | null
    /** 练习页「练习时隐藏」映射 */
    hiddenAtoms?: readonly AtomId[]
    hideZero?: boolean
    /** 题目末尾追加结束卡片 */
    end?: boolean
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
    end: false,
  },
)

const emit = defineEmits<{
  primary: []
  restart: []
  endless: []
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
const endEl = ref<HTMLElement | null>(null)
/** 当前练习视口可容纳的总结卡高度；由 ResizeObserver 随容器更新 */
const promptMaxHeight = ref('')
let promptResizeObserver: ResizeObserver | undefined

const currentWordIndex = computed(() => props.session.index)

const stageSummary = computed(() => {
  const prompt = props.prompt
  if (!prompt) return null
  return {
    accuracy: prompt.stats.accuracy,
    cpm: prompt.stats.cpm,
    errors: prompt.stats.errors,
    durationSec: prompt.stats.durationSec,
    keyErrorRows: prompt.keyErrors,
  }
})

function setRowEl(el: Element | null, index: number): void {
  if (el instanceof HTMLElement) rowEls.value[index] = el
}

function cellView(wordIndex: number, charIndex: number, capKeys: readonly string[], wordState: SessionState['words'][number]): CellView {
  const session = props.session
  const finished = session.phase === 'finished'
  const currentWord = session.words[session.index]
  const currentChar = currentWord?.charIndex ?? 0
  const key = `${wordIndex}:${charIndex}`
  const wordBefore = wordIndex < session.index
  const completed = finished || wordBefore || (wordIndex === session.index && charIndex < currentChar)
  const active = !finished && wordIndex === session.index && charIndex === currentChar
  const wrong = active ? props.wrongInputs.get(key) : undefined
  const historyInput = wordState.charInputs?.[charIndex]
  const input = wrong ?? (active ? (currentWord?.input ?? []) : completed ? (historyInput ? [...historyInput] : [...capKeys]) : [])
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
      cellView(wordIndex, charIndex, syllable.caps.map((cap) => cap.key), wordState),
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

function updatePromptMaxHeight(): void {
  const root = viewport.value
  promptMaxHeight.value =
    root && props.prompt
      ? `${Math.max(200, Math.min(720, root.clientHeight - 52))}px`
      : ''
}

/** 将指定末尾卡片滚到可见（底部对齐） */
function revealElement(el: HTMLElement | null): void {
  const root = viewport.value
  if (!root || !el) return
  const max = Math.max(0, root.scrollHeight - root.clientHeight)
  const target = el.offsetTop + el.offsetHeight - root.clientHeight + 16
  root.scrollTo({ top: Math.min(max, Math.max(0, target)), behavior: 'smooth' })
}

function revealEnd(): void {
  revealElement(endEl.value)
}

/** 完成提示行滚到可见（底部对齐） */
function revealPrompt(): void {
  revealElement(promptEl.value)
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
    if (!prompt) {
      promptMaxHeight.value = ''
      return
    }
    await nextTick()
    updatePromptMaxHeight()
    revealPrompt()
  },
  { immediate: true },
)

onMounted(() => {
  if (typeof ResizeObserver === 'undefined' || !viewport.value) return
  promptResizeObserver = new ResizeObserver(updatePromptMaxHeight)
  promptResizeObserver.observe(viewport.value)
})
watch(
  () => props.end,
  async (end) => {
    if (!end) return
    await nextTick()
    revealEnd()
  },
  { immediate: true },
)

onBeforeUnmount(() => promptResizeObserver?.disconnect())
</script>

<template>
  <div class="stream-shell">
    <p class="sr-only" aria-live="polite">{{ liveMessage }}</p>
    <div ref="viewport" class="stream-viewport thin-scroll scroll-y">
      <div class="stream-inner" :class="`is-${mode}`">
        <div
          v-for="(wordState, wordIndex) in session.words"
          :key="wordIndex"
          :ref="(el) => setRowEl(el as Element | null, wordIndex)"
          class="stream-word"
          :class="{
            'is-active': wordIndex === session.index,
            'has-error': cellRows[wordIndex]?.some((cell) => cell.inputState === 'wrong'),
          }"
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
      <Transition name="session-card" appear>
        <div v-if="end && $slots.end" ref="endEl" class="end-summary-wrap">
          <slot name="end" />
        </div>
      </Transition>
      <Transition name="session-card" appear>
        <div v-if="prompt" ref="promptEl" class="end-summary-wrap" role="status">
          <SessionSummaryCard
            v-if="stageSummary"
            mode="stage"
            :summary="stageSummary"
            :title="prompt.title"
            :rules="prompt.rules"
            :rating="prompt.rating"
            :passed-attempt="prompt.passedAttempt"
            :max-height="promptMaxHeight"
          >
            <template #actions>
              <button
                v-if="prompt.enterLabel"
                class="btn btn--primary"
                type="button"
                @click="emit('primary')"
              >
                {{ prompt.enterLabel }}
                <kbd>Enter</kbd>
              </button>
              <button class="btn" type="button" @click="emit('restart')">
                重新开始
                <kbd>Alt+R</kbd>
              </button>
              <button class="btn" type="button" @click="emit('endless')">
                进入练习
                <kbd>Alt+Enter</kbd>
              </button>
            </template>
          </SessionSummaryCard>
        </div>
      </Transition>
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
  max-width: var(--content-session);
  margin: 0 auto;
  padding-bottom: 4px;
  animation: ui-fade-up var(--dur-mid) var(--ease);
}
.stream-viewport {
  position: relative;
  flex: 1;
  min-height: 0;
  height: auto;
  width: 100%;
  border-radius: var(--r-panel);
  clip-path: inset(0 round var(--r-panel));
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
  scroll-behavior: smooth;
}
.stream-inner {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px 6px;
}
.stream-inner.is-grid {
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: center;
  align-content: flex-start;
  gap: 12px 10px;
}
.stream-word {
  display: flex;
  justify-content: center;
  border-radius: var(--r-panel);
  padding: 4px;
  width: fit-content;
  max-width: 100%;
  margin: 0 auto;
  transition: background var(--dur-mid), box-shadow var(--dur-mid);
}
.stream-inner.is-grid .stream-word {
  margin: 0;
}
/* 活动词：品牌柔色底 + 极细内描边；错误时整词切到 danger 语义色 */
.stream-word.is-active {
  background: color-mix(in srgb, var(--brand-soft) 72%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--brand) 16%, transparent);
  animation: ui-row-focus var(--dur-mid) var(--ease);
}
.stream-word.is-active.has-error {
  background: color-mix(in srgb, var(--danger-soft) 62%, transparent);
  box-shadow: inset 0 0 0 1px var(--danger-line);
}
.stream-row {
  display: flex;
  flex-wrap: wrap;
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
  height: 18px;
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
.end-summary-wrap {
  margin: 12px 4px 20px;
}
@media (max-width: 640px) {
  .end-summary-wrap {
    margin: 8px 2px 14px;
  }
}
</style>
