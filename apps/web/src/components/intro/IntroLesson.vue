<script setup lang="ts">
/**
 * 入门课「认识双拼」：5 步讲解 + 试打。
 * - 试打复用 core createSession/applyKey/backspace（不再写第二套判题）；
 * - 所有键位/改造声母/零声母示例都从 engine/scheme 动态生成，不写死方案；
 * - 完成试打 emit('finished') 由页面记录通过，emit('next') 进入第 1 课。
 */
import { computed, ref, shallowRef } from 'vue'
import {
  applyKey,
  backspace,
  clearInput,
  buildPracticeWord,
  createSchemeEngine,
  createSession,
  type PracticeWord,
  type SchemeDef,
  type SessionState,
  type WordEntry,
} from '@shuangpin/core'
import CharacterCard from '@/components/practice/CharacterCard.vue'
import SessionBar from '@/components/layout/SessionBar.vue'
import { useGlobalKeys, type KeyBinding } from '@/composables/useGlobalKeys'
import { useSoundStore } from '@/stores/sound'

const props = withDefaults(
  defineProps<{
    scheme: SchemeDef
    words: WordEntry[]
    /** 以前已通过入门课：不再要求重做最后的试打 */
    passed?: boolean
  }>(),
  { passed: false },
)

const emit = defineEmits<{
  finished: []
  next: []
  'key-pressed': [key: string]
}>()

const sound = useSoundStore()

type Step = 'concept' | 'principle' | 'keymap' | 'overlap' | 'try'
const stepOrder: readonly Step[] = ['concept', 'principle', 'keymap', 'overlap', 'try']
const step = ref<Step>('concept')

const engine = createSchemeEngine(props.scheme)
const diff = engine.diff()

// ── 动态方案文案 ──────────────────────────────────────────────
const conceptWord = '双'
const conceptKeys = ['s', 'h', 'u', 'a', 'n', 'g']
const shuangKeys = engine.primarySequence({ initial: 'sh', final: 'uang' }).map((key) => key.toUpperCase())
const shKey = shuangKeys[0] ?? '?'
const uangKey = shuangKeys[1] ?? '?'
const learnInitialsText = diff.learnInitials.join(' / ')
const freeInitialsText = diff.freeInitials.join('、')
const freeFinalsText = diff.freeFinals.join('、')
const freeZeroText = diff.freeZero.join('、')

// ── 试打（core session） ─────────────────────────────────────
const trialWord = computed<PracticeWord | null>(() => {
  const entry = props.words.find((word) => word.text === '双拼') ?? props.words.find((word) => word.text.length === 2)
  return entry ? buildPracticeWord(engine, entry) : null
})

const session = shallowRef<SessionState | null>(null)
const wrongInputs = ref<ReadonlyMap<string, string[]>>(new Map())
const revealed = ref<ReadonlySet<string>>(new Set())
/** 每字错误次数（UI 记录，第 3 次错误揭示答案） */
const cellErrors = ref<ReadonlyMap<string, number>>(new Map())

const currentCellKey = computed(() => {
  const state = session.value
  if (!state || state.phase === 'finished') return null
  return `0:${state.words[0]?.charIndex ?? 0}`
})
const hasInputError = computed(() => {
  const key = currentCellKey.value
  return Boolean(key && wrongInputs.value.has(key))
})

const completed = computed(() => session.value?.phase === 'finished')
const currentChar = computed(() => {
  const state = session.value
  if (!state) return 0
  if (state.phase === 'finished') return state.words[0]?.word.syllables.length ?? 0
  return state.words[0]?.charIndex ?? 0
})

function resetTry(): void {
  const word = trialWord.value
  if (!word) {
    session.value = null
    return
  }
  session.value = createSession({ words: [word], now: performance.now() })
  wrongInputs.value = new Map()
  revealed.value = new Set()
  cellErrors.value = new Map()
}

function inputFor(charIndex: number, capKeys: readonly string[]): string[] {
  const state = session.value
  const wordState = state?.words[0]
  if (!state || !wordState) return []
  const key = `0:${charIndex}`
  if (state.phase === 'finished' || charIndex < wordState.charIndex) return [...capKeys]
  if (charIndex === wordState.charIndex) {
    return wrongInputs.value.get(key) ?? wordState.input
  }
  return []
}

function inputStateFor(charIndex: number): 'idle' | 'wrong' | 'correct' {
  const state = session.value
  if (!state) return 'idle'
  if (wrongInputs.value.has(`0:${charIndex}`)) return 'wrong'
  if (state.phase === 'finished' || charIndex < state.words[0]!.charIndex) return 'correct'
  return 'idle'
}

function isActive(charIndex: number): boolean {
  return !completed.value && charIndex === currentChar.value
}

function isCompleted(charIndex: number): boolean {
  const state = session.value
  if (!state) return false
  return state.phase === 'finished' || charIndex < (state.words[0]?.charIndex ?? 0)
}

function isRevealed(charIndex: number): boolean {
  return revealed.value.has(`0:${charIndex}`)
}

function handleKey(raw: string): void {
  if (step.value !== 'try') {
    emit('key-pressed', raw)
    sound.playKey()
    return
  }
  const state = session.value
  if (!state || state.phase === 'finished') {
    // 试打完成后仍保留键位图反馈，不能只有退格有声音。
    emit('key-pressed', raw)
    sound.playKey()
    return
  }
  const charIndex = state.words[0]?.charIndex ?? 0
  const cellKey = `0:${charIndex}`
  emit('key-pressed', raw)
  const result = applyKey(state, raw, performance.now())
  if (result.feedback.kind === 'wrong') {
    sound.playError()
    const nextWrong = new Map(wrongInputs.value)
    nextWrong.set(cellKey, result.feedback.input ?? [])
    wrongInputs.value = nextWrong
    const nextErrors = new Map(cellErrors.value)
    const errorCount = (nextErrors.get(cellKey) ?? 0) + 1
    nextErrors.set(cellKey, errorCount)
    cellErrors.value = nextErrors
    if (errorCount >= 3 && !revealed.value.has(cellKey)) {
      const nextRevealed = new Set(revealed.value)
      nextRevealed.add(cellKey)
      revealed.value = nextRevealed
    }
  } else if (
    (result.feedback.kind === 'char-complete' || result.feedback.kind === 'word-complete') &&
    wrongInputs.value.has(cellKey)
  ) {
    const nextWrong = new Map(wrongInputs.value)
    nextWrong.delete(cellKey)
    wrongInputs.value = nextWrong
  }
  if (result.feedback.kind !== 'wrong') {
    if (result.state.phase === 'finished' || result.feedback.kind === 'word-complete') {
      sound.playComplete()
    } else {
      sound.playKey()
    }
  }
  session.value = result.state
  if (result.state.phase === 'finished') emit('finished')
}

function handleBackspace(): void {
  emit('key-pressed', 'backspace')
  sound.playKey()
  if (step.value !== 'try') return
  if (!session.value || session.value.phase === 'finished') return
  const cellKey = currentCellKey.value
  if (cellKey && wrongInputs.value.has(cellKey)) {
    const nextWrong = new Map(wrongInputs.value)
    nextWrong.delete(cellKey)
    wrongInputs.value = nextWrong
  }
  session.value = backspace(session.value)
}

/** 空格 / Enter：清空当前字输入并取消红色错误状态 */
function clearCurrentInput(): void {
  if (step.value !== 'try') return
  if (!session.value || session.value.phase === 'finished') return
  sound.playKey()
  const cellKey = currentCellKey.value
  if (cellKey && wrongInputs.value.has(cellKey)) {
    const nextWrong = new Map(wrongInputs.value)
    nextWrong.delete(cellKey)
    wrongInputs.value = nextWrong
  }
  session.value = clearInput(session.value)
}

// ── 步骤推进 ─────────────────────────────────────────────────
const stepIndex = computed(() => stepOrder.indexOf(step.value) + 1)
const canPrevious = computed(() => step.value !== 'concept')
const nextDisabled = computed(() => step.value === 'try' && !completed.value && !props.passed)
const nextLabel = computed(() => (step.value === 'try' ? '开始第 1 课' : '下一页'))

function advance(): void {
  if (step.value === 'concept') {
    step.value = 'principle'
    return
  }
  if (step.value === 'principle') {
    step.value = 'keymap'
    return
  }
  if (step.value === 'keymap') {
    step.value = 'overlap'
    return
  }
  if (step.value === 'overlap') {
    step.value = 'try'
    resetTry()
  }
}

function previous(): void {
  if (step.value === 'principle') {
    step.value = 'concept'
    return
  }
  if (step.value === 'keymap') {
    step.value = 'principle'
    return
  }
  if (step.value === 'overlap') {
    step.value = 'keymap'
    return
  }
  if (step.value === 'try') {
    step.value = 'overlap'
    resetTry()
  }
}

function primaryAction(): void {
  if (step.value !== 'try') {
    advance()
    return
  }
  if (completed.value || props.passed) emit('next')
}

const bindings = computed<KeyBinding[]>(() => {
  const list: KeyBinding[] = [
    {
      key: 'Enter',
      when: (event) =>
        !(event.target instanceof HTMLButtonElement) &&
        step.value === 'try' &&
        hasInputError.value,
      run: () => clearCurrentInput(),
    },
    {
      key: 'Enter',
      when: (event) => !(event.target instanceof HTMLButtonElement),
      run: () => primaryAction(),
    },
    { key: 'ArrowLeft', alt: true, run: () => previous() },
  ]
  // 键位图从第一页起常驻；非试打步骤也显示按键按下反馈
  list.push(
    {
      letter: true,
      run: (event) => {
        if (step.value === 'try') handleKey(event.key)
        else {
          emit('key-pressed', event.key)
          sound.playKey()
        }
      },
    },
    {
      key: 'Backspace',
      // 非试打页也要有敲击声与键位图反馈；handleBackspace 内部已按步骤分支处理。
      run: () => handleBackspace(),
    },
  )
  if (step.value === 'try') {
    list.push({ key: ' ', when: () => hasInputError.value, run: () => clearCurrentInput() })
  }
  return list
})
useGlobalKeys(bindings)

defineExpose({ pressKey: handleKey, backspace: handleBackspace })
</script>

<template>
  <div class="intro-page">
    <SessionBar :success="completed && step === 'try'">
      <template #left>
        <button class="session-btn" type="button" :disabled="!canPrevious" @click="previous">
          <svg class="icon session-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19.5 12h-15" /><path d="m10.5 6-6 6 6 6" />
          </svg>
          上一页
          <kbd>Alt+←</kbd>
        </button>
      </template>

      <span class="session-item">第 {{ String(stepIndex).padStart(2, '0') }} / {{ String(stepOrder.length).padStart(2, '0') }} 页</span>

      <template #right>
        <button
          class="btn btn--primary session-primary"
          type="button"
          :disabled="nextDisabled"
          @click="primaryAction"
        >
          {{ nextLabel }}
          <kbd>Enter</kbd>
        </button>
      </template>
    </SessionBar>

    <section v-if="step === 'concept'" class="intro-card">
      <div class="eyebrow intro-kicker">01 · 全拼</div>
      <h1>全拼要按很多下</h1>
      <div class="intro-grid">
        <div class="intro-visual">
          <div class="visual-word">{{ conceptWord }}</div>
          <div class="full-keycaps">
            <span v-for="letter in conceptKeys" :key="letter" class="visual-key">{{ letter }}</span>
          </div>
          <div class="mono visual-caption">shuang · 6 键</div>
        </div>
        <div class="intro-prose">
          <p>全拼输入时，电脑要识别每一个字母。像「双」的拼音 <b>shuang</b>，必须依次按下 s、h、u、a、n、g 六个键；拼音越长，手指移动越多。</p>
          <p>双拼不是另一套拼音，而是改变按键方式：把声母和韵母各压缩到一个键上，让每个汉字固定只按两下。</p>
          <p>所以我们要学的不是新拼音，而是「哪个声母在哪个键、哪个韵母在哪个键」。</p>
        </div>
      </div>
    </section>

    <section v-else-if="step === 'principle'" class="intro-card">
      <div class="eyebrow intro-kicker">02 · 双拼原理</div>
      <h1>声母 + 韵母，各按一下</h1>
      <div class="intro-grid">
        <div class="intro-visual">
          <div class="visual-word">{{ conceptWord }}</div>
          <div class="split-line">
            <span class="split-part is-initial">zh</span>
            <span class="split-part is-final">uang</span>
          </div>
          <div class="two-key-row">
            <span class="two-key">1 键</span>
            <span class="two-plus">+</span>
            <span class="two-key">1 键</span>
            <span class="two-equals">=</span>
            <strong>2 键</strong>
          </div>
        </div>
        <div class="intro-prose">
          <p>每个音节都可以拆成声母和韵母。比如 <b>sh</b> 是声母，<b>uang</b> 是韵母。在「{{ scheme.name }}」里，sh 在 <b>{{ shKey }}</b> 键、uang 在 <b>{{ uangKey }}</b> 键，所以「双」只需要按 <b>{{ shKey }}</b> 和 <b>{{ uangKey }}</b>。</p>
          <p>拼音本身没有变，变的只是按键数量。学会这套映射后，所有汉字都能按「声母键 + 韵母键」两下打出来。</p>
          <p>双拼的优势是击键更少、输入更连贯，尤其适合长拼音和高频输入。</p>
        </div>
      </div>
    </section>

    <section v-else-if="step === 'keymap'" class="intro-card">
      <div class="eyebrow intro-kicker">03 · {{ scheme.name }}</div>
      <h1>记住这两张映射</h1>
      <div class="intro-grid">
        <div class="mapping-cards">
          <div class="mapping-card"><span class="mapping-atom is-initial">sh</span><span class="mapping-arrow">→</span><span class="mapping-key">{{ shKey }}</span></div>
          <div class="mapping-card"><span class="mapping-atom is-final">uang</span><span class="mapping-arrow">→</span><span class="mapping-key">{{ uangKey }}</span></div>
        </div>
        <div class="intro-prose">
          <p>页面底部的键位图如果没看到，按 Ctrl+K 唤出；之后随时可以用同一快捷键显示或隐藏。蓝色是改造声母（{{ learnInitialsText || '本方案无改造声母' }}），橘色是韵母；当前正在学的键会用白字 + 底色突出。</p>
          <p>其他课程也一样：记不住时低头看一眼，按下的键会实时亮起，不需要背完所有键再开始。</p>
          <p>先只记一个例子：sh 在 {{ shKey }}，uang 在 {{ uangKey }}，所以「双」就是 {{ shKey }} + {{ uangKey }}。</p>
        </div>
      </div>
    </section>

    <section v-else-if="step === 'overlap'" class="intro-card">
      <div class="eyebrow intro-kicker">04 · 全拼沿用</div>
      <h1>双拼没有推翻你会的全拼</h1>
      <div class="intro-grid">
        <div class="overlap-board">
          <div class="overlap-row">
            <span class="overlap-pill" title="声母继续沿用全拼">全拼沿用</span>
            <div class="overlap-keys">
              <span v-for="key in diff.freeInitials" :key="key">{{ key }}</span>
            </div>
          </div>
          <div v-if="freeFinalsText" class="overlap-row">
            <span class="overlap-pill" title="韵母继续沿用全拼">全拼沿用</span>
            <div class="overlap-keys">
              <span v-for="key in diff.freeFinals" :key="key">{{ key }}</span>
            </div>
          </div>
          <div v-if="freeZeroText" class="overlap-row">
            <span class="overlap-pill" title="零声母继续沿用全拼">全拼沿用</span>
            <div class="overlap-keys">
              <span v-for="key in diff.freeZero" :key="key">{{ key }}</span>
            </div>
          </div>
          <div class="overlap-note">这些声母、韵母和零声母继续沿用全拼，不需要重新记。</div>
        </div>
        <div class="intro-prose">
          <p>你不需要把全拼忘掉。在「{{ scheme.name }}」里，这些声母仍在原来的键上：{{ freeInitialsText }} 都保持全拼习惯。</p>
          <p v-if="freeFinalsText">韵母 {{ freeFinalsText }} 也直接沿用全拼键位。</p>
          <p v-if="freeZeroText">零声母 {{ freeZeroText }} 仍按全拼拼写输入。</p>
          <p>真正需要重新记的，是本方案的改造声母（{{ learnInitialsText }}）以及复韵母和鼻韵母被压缩到单键后的位置。</p>
          <p>所以这一课不是重新学拼音，而是一次全拼复习：键位图已经出现，先确认哪些键和全拼完全一样，再只看真正需要重记的部分。</p>
          <p>你已有的全拼能力是底座；双拼只是在底座上换几条线路。</p>
        </div>
      </div>
    </section>

    <section v-else class="intro-card">
      <div class="eyebrow intro-kicker">05 · 试一下</div>
      <h1>看键位图，打出「{{ trialWord?.text ?? '双拼' }}」</h1>
      <div class="intro-grid intro-grid--try">
        <div v-if="trialWord" class="try-cards">
          <CharacterCard
            v-for="(syllable, index) in trialWord.syllables"
            :key="`${trialWord.text}-${index}`"
            :char="trialWord.chars[index] ?? syllable.text"
            :pinyin="syllable.pinyinTone"
            :initial-text="syllable.initial"
            :caps="syllable.caps"
            :input="inputFor(index, syllable.caps.map((cap) => cap.key))"
            :tier="3"
            :active="isActive(index)"
            :completed="isCompleted(index)"
            :revealed="isRevealed(index)"
            :input-state="inputStateFor(index)"
          />
        </div>
        <div class="intro-prose">
          <p>每个字固定两个键：先声母，后韵母。目标键的答案已经隐藏，去页面底部的键位图里找。</p>
          <p>打完一个字会自动进入下一个字；输入框会一直显示，即使打完了也不会消失。</p>
          <p class="try-tip">打错了不会自动清空：继续按键没反应；按退格逐键撤销并恢复；按空格或 Enter 一次清空重来。</p>
          <p v-if="wrongInputs.size > 0 && !completed" class="try-bad">
            {{ revealed.size > 0 ? '已显示答案，照着键位图完成这个字。' : '键位不对，同一个字第 3 次错误会显示答案。' }}
          </p>
          <p v-else-if="completed" class="try-ok">「{{ trialWord?.text ?? '双拼' }}」完成。</p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.intro-page {
  width: 100%;
  max-width: 1080px;
  height: 100%;
  min-height: 0;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
}
/* 桌面：卡片撑满可用高度，内容从顶部开始（键位图从第一页起就固定在底部） */
.intro-card {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  padding: 28px 40px;
  border-radius: var(--r-xl);
  border: 1px solid var(--line);
  background: var(--surface);
  box-shadow: var(--shadow-md);
  animation: ui-fade-up 260ms var(--ease);
}
.intro-kicker {
  margin: 0;
}
.intro-card h1 {
  margin: 8px 0 22px;
  color: var(--ink);
  font-size: clamp(28px, 2.4vw, 36px);
  font-weight: 800;
  letter-spacing: -0.035em;
  line-height: 1.2;
}
.intro-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
  gap: clamp(24px, 3.4vw, 48px);
  align-items: center;
}
.intro-visual {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 20px;
  border-radius: var(--r-lg);
  border: 1px solid var(--line-faint);
  background: var(--surface-2);
}
.visual-word {
  color: var(--ink);
  font-size: clamp(64px, 6.6vw, 88px);
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: -0.03em;
}
.full-keycaps {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}
.visual-key {
  width: 38px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: var(--r-control);
  border: 1px solid var(--line-strong);
  border-bottom-width: 3px;
  background: var(--surface);
  color: var(--ink-2);
  font-family: var(--font-mono);
  font-size: 16px;
  font-weight: 700;
  box-shadow: var(--shadow-sm);
}
.visual-caption {
  color: var(--ink-3);
  font-size: var(--text-sm);
}
.split-line {
  display: flex;
  gap: 10px;
}
.split-part {
  padding: 7px 15px;
  border-radius: var(--r-control);
  font-family: var(--font-mono);
  font-size: 24px;
  font-weight: 700;
}
.split-part.is-initial,
.mapping-atom.is-initial {
  color: var(--focus-initial);
  background: color-mix(in srgb, var(--focus-initial) 11%, transparent);
}
.split-part.is-final,
.mapping-atom.is-final {
  color: var(--focus-final);
  background: color-mix(in srgb, var(--focus-final) 13%, transparent);
}
.two-key-row {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--ink-3);
  font-size: var(--text-sm);
}
.two-key {
  padding: 5px 11px;
  border-radius: var(--r-control);
  border: 1px dashed var(--line-strong);
}
.two-key-row strong {
  color: var(--brand-ink);
}
.mapping-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: stretch;
}
.mapping-card {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 18px;
  border-radius: var(--r-lg);
  border: 1px solid var(--line-faint);
  background: var(--surface-2);
}
.mapping-atom {
  padding: 5px 10px;
  border-radius: var(--r-control);
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 700;
}
.mapping-arrow {
  color: var(--ink-4);
}
.mapping-key {
  min-width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: var(--r-control);
  border: 1px solid var(--line-strong);
  border-bottom-width: 3px;
  background: var(--surface);
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 800;
  box-shadow: var(--shadow-sm);
}
.intro-prose {
  color: var(--ink-2);
  font-size: 14px;
  line-height: 1.95;
}
.intro-prose p + p {
  margin-top: 9px;
}
.overlap-board {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
  border-radius: var(--r-lg);
  border: 1px solid var(--line-faint);
  background: var(--surface-2);
}
.overlap-row {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.overlap-pill {
  display: inline-flex;
  width: fit-content;
  align-self: flex-start;
  align-items: center;
  padding: 3px 9px;
  border-radius: var(--r-pill);
  background: var(--brand-soft);
  color: var(--brand-ink);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.02em;
}
.overlap-keys {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.overlap-keys span {
  min-width: 30px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: var(--r-control);
  border: 1px solid var(--line-strong);
  border-bottom-width: 2px;
  background: var(--surface);
  color: var(--ink-2);
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 700;
}
.overlap-note {
  padding-top: 10px;
  border-top: 1px dashed var(--line-faint);
  color: var(--ink-3);
  font-size: var(--text-sm);
}
.intro-grid--try {
  grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr);
}
.try-cards {
  display: flex;
  justify-content: center;
  gap: 12px;
}
.try-cards :deep(.char-card) {
  width: 140px;
}
.try-tip {
  color: var(--ink-3);
  font-size: var(--text-sm);
  line-height: 1.7;
}
.try-bad {
  color: var(--danger);
  font-weight: 650;
}
.try-ok {
  color: var(--success-strong);
  font-weight: 650;
}
@media (max-width: 900px) {
  .intro-card {
    padding: 26px 28px;
  }
  .intro-grid {
    gap: 22px;
  }
}
@media (max-width: 760px) {
  /* 移动端恢复自然高度，交给页面滚动 */
  .intro-page {
    height: auto;
    min-height: 0;
  }
  .intro-card {
    flex: none;
    padding: 20px 16px;
  }
  .intro-card h1 {
    margin: 6px 0 16px;
    font-size: 26px;
  }
  .intro-grid,
  .intro-grid--try {
    grid-template-columns: 1fr;
    gap: 16px;
  }
  .intro-visual {
    padding: 18px 14px;
  }
  .visual-word {
    font-size: 64px;
  }
  .try-cards :deep(.char-card) {
    width: 120px;
  }
}
</style>
