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
  restart: []
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
        <div class="end-prompt-head">
          <div class="end-prompt-copy">
            <span class="end-prompt-kicker">{{ prompt.met ? '阶段完成' : '暂未达标' }}</span>
            <p class="end-prompt-text">
              <strong>{{ prompt.title }}</strong>
            </p>
          </div>
          <div
            v-if="prompt.rating"
            class="end-rating"
            :class="{ 'is-passed': prompt.rating.passed }"
            aria-label="本次考核评分"
          >
            <span class="end-rating-label">本次评分</span>
            <strong class="end-rating-stars">
              {{ prompt.rating.passed ? '★'.repeat(prompt.rating.stars) + '☆'.repeat(3 - prompt.rating.stars) : '未通过' }}
            </strong>
            <span v-if="prompt.rating.passed" class="end-rating-note">{{ prompt.rating.stars }} 星</span>
          </div>
        </div>

        <div class="end-stats">
          <div class="end-stat">
            <b>{{ prompt.stats.accuracy }}<small>%</small></b>
            <span>正确率</span>
          </div>
          <div class="end-stat">
            <b>{{ prompt.stats.cpm }}<small>字/分</small></b>
            <span>速度</span>
          </div>
          <div class="end-stat">
            <b>{{ prompt.stats.errors }}</b>
            <span>错误次数</span>
          </div>
          <div class="end-stat">
            <b>{{ prompt.stats.durationSec }}<small>秒</small></b>
            <span>用时</span>
          </div>
        </div>

        <div class="end-details" :class="{ 'is-single': prompt.stats.errors === 0 }">
          <section v-if="prompt.stats.errors > 0" class="end-block">
            <header>错误分布</header>
            <div class="end-error-dist">
              <span v-for="item in prompt.errorDistribution" :key="item.label">
                {{ item.label }}<b>{{ item.count }}</b> 处
              </span>
            </div>
            <div v-if="prompt.errorGroups.length" class="end-error-top">
              <span>最常出错</span>
              <ul>
                <li v-for="group in prompt.errorGroups" :key="group.label">
                  <b>{{ group.label }}</b> ×{{ group.count }}
                </li>
              </ul>
            </div>
          </section>

          <section v-if="prompt.rules.length" class="end-block">
            <header>本课评分规则</header>
            <p v-for="line in prompt.rules" :key="line.label" class="end-rule">
              <b>{{ line.label }}</b>
              <span>{{ line.text }}</span>
            </p>
            <p v-if="prompt.rating && !prompt.rating.passed" class="end-rule-note">
              达到最低标准后即可完成本课。
            </p>
          </section>
        </div>

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
          <button class="btn end-prompt-btn" type="button" @click="emit('restart')">
            重新开始
            <kbd>Alt+R</kbd>
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
  margin: 10px 4px 18px;
  padding: 16px 18px;
  border-radius: var(--r-lg);
  border: 1px solid var(--line);
  background: var(--surface);
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.end-prompt.is-met {
  border-color: var(--state-success-line);
  background: linear-gradient(180deg, var(--state-success-bg), var(--surface) 58%);
}
.end-prompt-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.end-prompt-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.end-prompt-kicker {
  width: fit-content;
  padding: 2px 8px;
  border-radius: var(--r-pill);
  color: var(--ink-3);
  background: var(--surface-3);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.end-prompt.is-met .end-prompt-kicker {
  color: var(--state-success-ink);
  background: var(--surface);
}
.end-prompt-text {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  color: var(--ink-3);
  font-size: 12px;
  line-height: 1.6;
}
.end-prompt-text strong {
  color: var(--ink);
  font-size: 14px;
  font-weight: 700;
}
.end-prompt.is-met .end-prompt-text strong {
  color: var(--state-success-ink);
}
.end-rating {
  flex: none;
  min-width: 148px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 14px 9px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
}
.end-rating.is-passed {
  border-color: var(--state-success-line);
  background: var(--surface);
}
.end-rating-label {
  color: var(--ink-4);
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.06em;
}
.end-rating-stars {
  color: var(--danger);
  font-size: 21px;
  font-weight: 800;
  letter-spacing: 2px;
  line-height: 1.25;
}
.end-rating.is-passed .end-rating-stars {
  color: #d69e2e;
}
.end-rating-note {
  color: var(--ink-3);
  font-size: 10px;
  font-weight: 650;
}
.end-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.end-stat {
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid var(--line-faint);
  border-radius: var(--r-md);
  background: var(--surface);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.end-stat b {
  color: var(--ink);
  font-size: 18px;
  font-weight: 780;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
.end-stat b small {
  margin-left: 2px;
  color: var(--ink-3);
  font-size: 9px;
  font-weight: 600;
}
.end-stat > span {
  color: var(--ink-3);
  font-size: 10px;
  font-weight: 600;
}
.end-details {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  gap: 10px;
}
.end-details.is-single {
  grid-template-columns: 1fr;
}
.end-block {
  min-width: 0;
  padding: 11px 12px;
  border: 1px solid var(--line-faint);
  border-radius: var(--r-md);
  background: var(--surface);
}
.end-block > header {
  margin-bottom: 7px;
  color: var(--ink-2);
  font-size: 11px;
  font-weight: 700;
}
.end-error-dist {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.end-error-dist span {
  padding: 3px 7px;
  border-radius: var(--r-pill);
  background: var(--surface-2);
  color: var(--ink-3);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.end-error-dist b {
  margin: 0 2px 0 4px;
  color: var(--ink);
}
.end-error-top {
  margin-top: 8px;
  display: flex;
  align-items: flex-start;
  gap: 7px;
  color: var(--ink-4);
  font-size: 10px;
}
.end-error-top ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
}
.end-error-top li {
  color: var(--ink-3);
}
.end-error-top b {
  color: var(--danger);
  font-weight: 700;
}
.end-rule {
  margin: 0;
  display: grid;
  grid-template-columns: 2.6em minmax(0, 1fr);
  column-gap: 7px;
  color: var(--ink-3);
  font-size: 10px;
  line-height: 1.55;
}
.end-rule + .end-rule {
  margin-top: 3px;
}
.end-rule b {
  color: var(--brand-ink);
  font-weight: 800;
  letter-spacing: 0.04em;
}
.end-rule-note {
  margin: 6px 0 0;
  color: var(--ink-4);
  font-size: 10px;
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
@media (max-width: 700px) {
  .end-prompt {
    padding: 12px;
  }
  .end-prompt-head {
    flex-direction: column;
    gap: 10px;
  }
  .end-rating {
    align-items: flex-start;
    width: 100%;
  }
  .end-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .end-details {
    grid-template-columns: 1fr;
  }
}
</style>
