<script setup lang="ts">
/**
 * 入门课「认识双拼」：完全由当前方案数据自动生成的通用入门课。
 *
 * 内容结构见 tmp/intro-lesson-design.md：
 * 拼音基础 → 声母 → 韵母 → 零声母 → 多键（条件）→ 推荐码 / 兼容编码（条件）→ 工具说明 → 试打。
 * - 不写死任何方案名 / 键位；声母、韵母、零声母、示例、推荐码、兼容编码全部来自 SchemeDef + engine + 词表；
 * - 主键（数组第一条 / 主序列）蓝色，其余键普通样式，所有列出的键都合法；
 * - 试打复用 core 的 createSession / applyKey / backspace，完成后 emit('finished') / emit('next')。
 */
import { computed, ref, shallowRef, watch } from 'vue'
import {
  applyKey,
  backspace,
  buildPracticeWord,
  clearInput,
  createSchemeEngine,
  createSession,
  type PracticeWord,
  type SchemeDef,
  type SessionState,
  type WordEntry,
} from '@shuangpin/core'
import PracticeStream from '@/components/practice/PracticeStream.vue'
import SessionBar from '@/components/layout/SessionBar.vue'
import { useGlobalKeys, type KeyBinding } from '@/composables/useGlobalKeys'
import { useSoundStore } from '@/stores/sound'
import CodeExampleCard from './CodeExampleCard.vue'
import KeyAtomCapsule from './KeyAtomCapsule.vue'
import KeyChip from './KeyChip.vue'
import {
  buildIntroLessonModel,
  type CodesSection,
  type FinalsSection,
  type InitialsSection,
  type IntroSection,
  type IntroSectionKind,
  type KeyAtom,
  type MultiKeySection,
  type ToolLegendSection,
  type ZeroInitialsSection,
} from './introLessonModel'

const props = withDefaults(
  defineProps<{
    scheme: SchemeDef
    words: WordEntry[]
    /** 已通过入门课：跳过最后的试打 */
    passed?: boolean
  }>(),
  { passed: false },
)

const emit = defineEmits<{
  finished: []
  next: []
}>()

const sound = useSoundStore()

// ── 通用模型 ─────────────────────────────────────────────────
const engine = computed(() => createSchemeEngine(props.scheme))
const model = computed(() => buildIntroLessonModel(props.scheme, engine.value, props.words))

type StepId = IntroSectionKind | 'try'

const steps = computed<StepId[]>(() => [...model.value.sections.map((section) => section.kind), 'try'])
const step = ref<StepId>('pinyin-basics')
const stepIndex = computed(() => Math.max(0, steps.value.indexOf(step.value)))
const stepNumber = computed(() => String(stepIndex.value + 1).padStart(2, '0'))
const totalSteps = computed(() => String(steps.value.length).padStart(2, '0'))
const canPrevious = computed(() => stepIndex.value > 0)

// 方案 / 词表变化导致条件 section 消失时，退回第一个仍然存在的步骤。
watch(steps, (list) => {
  if (!list.includes(step.value)) step.value = list[0] ?? 'try'
})

const EMPTY_ATOMS = { atoms: [] as KeyAtom[], learnCount: 0, freeCount: 0, multiCount: 0 }

function findSection<K extends IntroSectionKind>(kind: K): Extract<IntroSection, { kind: K }> | null {
  const section = model.value.sections.find((item) => item.kind === kind)
  return (section as Extract<IntroSection, { kind: K }> | undefined) ?? null
}

const initialsSection = computed<InitialsSection>(
  () => findSection('initials') ?? { kind: 'initials', ...EMPTY_ATOMS, example: null },
)
const finalsSection = computed<FinalsSection>(
  () => findSection('finals') ?? { kind: 'finals', ...EMPTY_ATOMS, example: null },
)
const zeroSection = computed<ZeroInitialsSection>(
  () => findSection('zero-initials') ?? { kind: 'zero-initials', ...EMPTY_ATOMS, example: null },
)
const multiKeySection = computed<MultiKeySection>(
  () =>
    findSection('multi-key') ?? {
      kind: 'multi-key',
      atoms: [],
      totalCount: 0,
      hasRecommended: false,
      sharedKey: null,
    },
)
const codesSection = computed<CodesSection>(
  () =>
    findSection('codes') ?? {
      kind: 'codes',
      recommended: [],
      compat: [],
      hasRecommended: false,
      hasCompat: false,
      hasOverride: false,
      recommendedTotal: 0,
      compatTotal: 0,
    },
)
const toolSection = computed<ToolLegendSection>(
  () =>
    findSection('tool-legend') ?? {
      kind: 'tool-legend',
      initialCount: 0,
      finalCount: 0,
      zeroCount: 0,
      hasMulti: false,
      hasCodes: false,
    },
)

// ── 试打（core session，保留原有交互） ──────────────────────
const trialWord = computed<PracticeWord | null>(() => {
  const entry =
    props.words.find((word) => word.text === '双拼') ??
    props.words.find((word) => word.text.length === 2) ??
    props.words[0]
  return entry ? buildPracticeWord(engine.value, entry) : null
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

function handleKey(raw: string): void {
  if (step.value !== 'try') {
    sound.playKey()
    return
  }
  const state = session.value
  if (!state || state.phase === 'finished') {
    // 试打完成后仍保留键位图反馈，不能只有退格有声音。
    sound.playKey()
    return
  }
  const charIndex = state.words[0]?.charIndex ?? 0
  const cellKey = `0:${charIndex}`
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
const nextDisabled = computed(
  () => step.value === 'try' && !completed.value && !props.passed && trialWord.value !== null,
)
const nextLabel = computed(() => (step.value === 'try' ? '开始第 1 课' : '下一页'))

function goToStep(next: StepId): void {
  if (next === step.value) return
  step.value = next
  if (next === 'try') resetTry()
}

function advance(): void {
  const next = steps.value[stepIndex.value + 1]
  if (next) goToStep(next)
}

function previous(): void {
  const next = steps.value[stepIndex.value - 1]
  if (next) goToStep(next)
}

function primaryAction(): void {
  if (step.value !== 'try') {
    advance()
    return
  }
  if (completed.value || props.passed || !trialWord.value) emit('next')
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

      <span class="session-item">第 {{ stepNumber }} / {{ totalSteps }} 页</span>

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

    <!-- 1 · 拼音基础（固定通用内容） -->
    <section v-if="step === 'pinyin-basics'" class="intro-card thin-scroll">
      <div class="eyebrow intro-kicker">{{ stepNumber }} · 拼音基础</div>
      <h1>双拼不改变拼音</h1>
      <div class="intro-grid">
        <div class="intro-visual anatomy-panel">
          <div class="anatomy-word">shuāng</div>
          <div class="anatomy-parts">
            <span class="anatomy-part is-initial"><b>sh</b><small>声母</small></span>
            <span class="anatomy-op" aria-hidden="true">+</span>
            <span class="anatomy-part is-final"><b>uang</b><small>韵母</small></span>
            <span class="anatomy-op" aria-hidden="true">+</span>
            <span class="anatomy-part is-tone"><b>ˉ</b><small>声调</small></span>
          </div>
          <p class="anatomy-caption">拼音音节 = 声母 + 韵母 + 声调</p>
        </div>
        <div class="intro-prose">
          <p>拼音音节可以拆成「声母 + 韵母 + 声调」。例如 <b>shuāng</b> = sh + uang + 第一声。</p>
          <p>双拼只改变声母和韵母的<strong>按键方式</strong>，不改变拼音本身：读法照旧，只是把 sh 和 uang 各按到一个键上。</p>
          <p>有些音节没有声母，例如 āi、ér，称为<b>零声母</b>；当前方案也为它们单独安排了键位。</p>
          <p>所以入门课要建立的是「看到拼音 → 找到对应两键」的新映射，不需要重新学发音。</p>
        </div>
      </div>
    </section>

    <!-- 2 · 声母 -->
    <section v-else-if="step === 'initials'" class="intro-card thin-scroll">
      <div class="eyebrow intro-kicker">{{ stepNumber }} · 声母</div>
      <header class="intro-head">
        <h1>{{ initialsSection.atoms.length }} 个声母，各对应一套键位</h1>
        <span class="count-badge">{{ initialsSection.atoms.length }} 个映射</span>
      </header>
      <div class="intro-grid intro-grid--atoms">
        <div class="intro-visual atoms-panel">
          <header class="atoms-head panel-head">
            <h2 class="panel-title">全部声母</h2>
            <span v-if="initialsSection.freeCount > 0" class="atoms-hint">标「沿用」的与全拼一致</span>
          </header>
          <div class="atom-grid">
            <KeyAtomCapsule v-for="atom in initialsSection.atoms" :key="atom.atomId" :atom="atom" />
          </div>
        </div>
        <div class="intro-prose">
          <p>当前方案「{{ model.schemeName }}」共有 {{ initialsSection.atoms.length }} 个声母：<b>{{ initialsSection.learnCount }}</b> 个需要重新记键位，<b>{{ initialsSection.freeCount }}</b> 个与全拼一致。</p>
          <p>每个声母对应一个键。若一个声母列出多个键，蓝色是<b>主键</b>，其他是<b>副键</b>——它们都是合法输入，不是只能按蓝色。</p>
          <p v-if="initialsSection.multiCount > 0">本方案有 {{ initialsSection.multiCount }} 个声母带多个键，后面的「多键」页会统一说明。</p>
          <p v-else>本方案每个声母都只有一个键。</p>
          <p>键位图里声母用蓝色标出；先认识「哪个声母在哪个键」，不用急着背整张表。</p>
          <div v-if="initialsSection.example" class="example-card">
            <div class="example-head">
              <span class="example-word">{{ initialsSection.example.display }}</span>
              <span class="example-caption">声母 + 韵母 = 两键</span>
            </div>
            <div class="example-parts">
              <KeyAtomCapsule :atom="initialsSection.example.initial" compact />
              <span class="example-op" aria-hidden="true">+</span>
              <KeyAtomCapsule :atom="initialsSection.example.final" compact />
              <span class="example-op" aria-hidden="true">=</span>
              <span class="example-keys">
                <KeyChip
                  v-for="(key, index) in initialsSection.example.primary"
                  :key="`${key}-${index}`"
                  :text="key"
                  variant="primary"
                />
              </span>
            </div>
            <p v-if="initialsSection.example.accepted.length > 1" class="example-note">
              这个音节共有 {{ initialsSection.example.accepted.length }} 种被接受的组合。
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- 3 · 韵母 -->
    <section v-else-if="step === 'finals'" class="intro-card thin-scroll">
      <div class="eyebrow intro-kicker">{{ stepNumber }} · 韵母</div>
      <header class="intro-head">
        <h1>{{ finalsSection.atoms.length }} 个韵母，把长拼音压成一键</h1>
        <span class="count-badge">{{ finalsSection.atoms.length }} 个映射</span>
      </header>
      <div class="intro-grid intro-grid--atoms">
        <div class="intro-visual atoms-panel">
          <header class="atoms-head panel-head">
            <h2 class="panel-title">全部韵母</h2>
            <span v-if="finalsSection.freeCount > 0" class="atoms-hint">标「沿用」的与全拼一致</span>
          </header>
          <div class="atom-grid">
            <KeyAtomCapsule v-for="atom in finalsSection.atoms" :key="atom.atomId" :atom="atom" />
          </div>
        </div>
        <div class="intro-prose">
          <p>当前方案「{{ model.schemeName }}」共有 {{ finalsSection.atoms.length }} 个韵母：<b>{{ finalsSection.learnCount }}</b> 个需要重新记，<b>{{ finalsSection.freeCount }}</b> 个与全拼一致。</p>
          <p>韵母决定音节的后半段。列出多个键时，蓝色是<b>主键</b>，其他是<b>副键</b>；所有列出的键都是合法输入，不要求只用蓝色。</p>
          <p>拼音里的 ü 在方案数据中写作 v（如 ü → v、üe → ve）；列表中的韵母名与键位就是实际输入的按键，以列出的键为准。</p>
          <p v-if="finalsSection.multiCount > 0">本方案有 {{ finalsSection.multiCount }} 个韵母带多个键，后面的「多键」页会统一说明。</p>
          <p v-else>本方案每个韵母都只有一个键。</p>
          <div v-if="finalsSection.example" class="example-card">
            <div class="example-head">
              <span class="example-word">{{ finalsSection.example.display }}</span>
              <span class="example-caption">声母 + 韵母 = 两键</span>
            </div>
            <div class="example-parts">
              <KeyAtomCapsule :atom="finalsSection.example.initial" compact />
              <span class="example-op" aria-hidden="true">+</span>
              <KeyAtomCapsule :atom="finalsSection.example.final" compact />
              <span class="example-op" aria-hidden="true">=</span>
              <span class="example-keys">
                <KeyChip
                  v-for="(key, index) in finalsSection.example.primary"
                  :key="`${key}-${index}`"
                  :text="key"
                  variant="primary"
                />
              </span>
            </div>
            <p v-if="finalsSection.example.accepted.length > 1" class="example-note">
              这个音节共有 {{ finalsSection.example.accepted.length }} 种被接受的组合。
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- 4 · 零声母 -->
    <section v-else-if="step === 'zero-initials'" class="intro-card thin-scroll">
      <div class="eyebrow intro-kicker">{{ stepNumber }} · 零声母</div>
      <header class="intro-head">
        <h1>{{ zeroSection.atoms.length }} 个零声母，整段序列就是答案</h1>
        <span class="count-badge">{{ zeroSection.atoms.length }} 个映射</span>
      </header>
      <div class="intro-grid intro-grid--atoms">
        <div class="intro-visual atoms-panel">
          <header class="atoms-head panel-head">
            <h2 class="panel-title">全部零声母</h2>
            <span v-if="zeroSection.freeCount > 0" class="atoms-hint">标「沿用」的与全拼一致</span>
          </header>
          <div class="atom-grid atom-grid--wide">
            <KeyAtomCapsule v-for="atom in zeroSection.atoms" :key="atom.atomId" :atom="atom" />
          </div>
        </div>
        <div class="intro-prose">
          <p>没有声母的音节叫<b>零声母</b>，例如 a、ai、er。当前方案为这 {{ zeroSection.atoms.length }} 个音节分别定义了完整的按键序列。</p>
          <p>零声母不是「先按什么、再按什么」，而是一整段固定序列；一个音节可能有多条序列，蓝色是<b>主序列</b>，其他序列同样合法。</p>
          <p>{{ zeroSection.freeCount }} 个零声母的序列与全拼拼写一致（标「沿用」），{{ zeroSection.learnCount }} 个需要重新记。</p>
          <div v-if="zeroSection.example" class="example-card">
            <div class="example-head">
              <span class="example-word">{{ zeroSection.example.atom.label }}</span>
              <span class="example-caption">完整序列，一次输入</span>
            </div>
            <div class="example-parts">
              <span class="example-keys">
                <KeyChip :text="zeroSection.example.primary" variant="primary" />
              </span>
              <span class="example-caption">主序列</span>
            </div>
            <p v-if="zeroSection.example.atom.keys.length > 1" class="example-note">
              该音节还有 {{ zeroSection.example.atom.keys.length - 1 }} 条副序列，也都能被判题接受。
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- 5 · 多键（仅当存在多键原子） -->
    <section v-else-if="step === 'multi-key'" class="intro-card thin-scroll">
      <div class="eyebrow intro-kicker">{{ stepNumber }} · 多键</div>
      <header class="intro-head">
        <h1>同一个映射，可以有多个键</h1>
        <span class="count-badge">{{ multiKeySection.totalCount }} 个多键映射</span>
      </header>
      <div class="intro-grid">
        <div class="intro-visual multi-panel">
          <div class="atom-legend">
            <span class="atom-legend-item"><i class="legend-swatch is-primary" aria-hidden="true" />主键（蓝色）</span>
            <span class="atom-legend-item"><i class="legend-swatch" aria-hidden="true" />副键 / 兼容键</span>
          </div>
          <div class="multi-list">
            <KeyAtomCapsule
              v-for="atom in multiKeySection.atoms"
              :key="atom.atomId"
              :atom="atom"
              show-kind
            />
          </div>
        </div>
        <div class="intro-prose">
          <p>本方案有 <b>{{ multiKeySection.totalCount }}</b> 个映射带多个键：同一个声母、韵母或零声母，可以用不止一个键输入。</p>
          <p>蓝色是<b>主键</b>，也是工具默认展示、答案卡优先显示的键；其他键是<b>副键</b>。所有列出的键都能参与组合，都会被判题接受。</p>
          <p v-if="multiKeySection.hasRecommended">方案数据里还有推荐码：标答以推荐码为准，推荐码可能与「主键 + 主键」的组合不同。</p>
          <p v-else>没有推荐码时，「主键 + 主键」的组合就是默认标答。</p>
          <p v-if="multiKeySection.sharedKey">同一个键也可能被多个映射共用，例如 <b>{{ multiKeySection.sharedKey.key }}</b> 键同时对应韵母 {{ multiKeySection.sharedKey.labels.join('、') }}；每个韵母仍按自己的主键 / 副键判断，判题看完整的按键序列。</p>
          <p>练习时按任意合法键都算对，不必只按蓝色。</p>
        </div>
      </div>
    </section>

    <!-- 6 · 推荐码与兼容编码（仅当方案数据存在） -->
    <section v-else-if="step === 'codes'" class="intro-card thin-scroll">
      <div class="eyebrow intro-kicker">{{ stepNumber }} · 编码说明</div>
      <header class="intro-head">
        <h1>推荐码与兼容编码</h1>
        <span class="count-badge">
          <template v-if="codesSection.hasRecommended">{{ codesSection.recommendedTotal }} 条推荐码</template>
          <template v-if="codesSection.hasRecommended && codesSection.hasCompat"> · </template>
          <template v-if="codesSection.hasCompat">{{ codesSection.compatTotal }} 组兼容编码</template>
        </span>
      </header>
      <div class="intro-grid">
        <div class="intro-visual codes-panel">
          <CodeExampleCard
            v-for="example in codesSection.recommended"
            :key="`recommended-${example.syllable}`"
            :example="example"
          />
          <CodeExampleCard
            v-for="example in codesSection.compat"
            :key="`compat-${example.syllable}`"
            :example="example"
          />
          <p v-if="codesSection.recommended.length === 0 && codesSection.compat.length === 0" class="codes-empty">
            本方案暂无编码示例。
          </p>
        </div>
        <div class="intro-prose">
          <template v-if="codesSection.hasRecommended">
            <p><b>推荐码</b>：方案为多码音节指定的推荐 / 标答序列。答案卡与提示优先显示推荐码。</p>
            <p v-if="codesSection.hasOverride">部分音节的推荐码与「主声母键 + 主韵母键」不同，标答以推荐码为准；主键组合仍然是合法输入。</p>
            <p v-else>本方案的推荐码与主键组合一致，答案卡显示的就是这组键。</p>
          </template>
          <p v-if="codesSection.hasCompat"><b>兼容编码</b>：无法由声母 × 韵母组合直接得到的额外合法序列，作为额外接受码，不影响正常组合。</p>
          <p>判题接受全部 accepted：推荐码、兼容编码、主键组合都算对；练习时不必只按推荐码。</p>
          <p>示例来自当前方案数据，展示标答、主键组合与全部接受码。</p>
        </div>
      </div>
    </section>

    <!-- 7 · 工具使用说明（固定通用内容 + 当前方案数据） -->
    <section v-else-if="step === 'tool-legend'" class="intro-card thin-scroll">
      <div class="eyebrow intro-kicker">{{ stepNumber }} · 工具说明</div>
      <header class="intro-head">
        <h1>看懂蓝色键、答案和判题</h1>
        <span class="count-badge">{{ toolSection.initialCount }} 声母 · {{ toolSection.finalCount }} 韵母 · {{ toolSection.zeroCount }} 零声母</span>
      </header>
      <div class="intro-grid">
        <div class="intro-visual tool-panel">
          <div class="tool-row">
            <span class="tool-swatch is-primary" aria-hidden="true" />
            <div>
              <b>蓝色键 = 主键</b>
              <p>工具默认展示、答案卡优先显示。</p>
            </div>
          </div>
          <div class="tool-row">
            <span class="tool-swatch" aria-hidden="true" />
            <div>
              <b>普通样式的键 = 副键 / 兼容键</b>
              <p>同样可以输入，也同样判对。</p>
            </div>
          </div>
          <div class="tool-flow">
            <span class="tool-flow-step">按下的键</span>
            <span class="tool-flow-op" aria-hidden="true">→</span>
            <span class="tool-flow-step is-accent">全部 accepted</span>
            <span class="tool-flow-op" aria-hidden="true">→</span>
            <span class="tool-flow-step is-success">判题正确</span>
          </div>
          <p class="tool-note">答案卡只显示 primary（标答）；判题接受全部 accepted，不只认标答。</p>
        </div>
        <div class="intro-prose">
          <p><b>蓝色键</b>是工具默认显示的主键；普通样式的键是副键 / 兼容键，它们都是合法输入。</p>
          <p>答案卡显示 primary（标答），但判题接受全部 accepted：副键、兼容编码、主键组合都算对。</p>
          <p>页面底部的键位图会列出全部映射<template v-if="toolSection.hasMulti">（多键映射会全部标出）</template><template v-if="toolSection.hasCodes">，兼容编码单独成行</template>；可以用 <kbd>Ctrl+K</kbd> 随时显隐。</p>
          <p>课程和练习场使用同一套判题规则；练习时不必只按蓝色键，按任意合法组合都能通过。</p>
          <p>课程进度只保存在本地浏览器，不会同步到其他设备。</p>
        </div>
      </div>
    </section>

    <!-- 8 · 试打（保留原有交互） -->
    <section v-else-if="step === 'try'" class="intro-card intro-card--try thin-scroll">
      <div class="eyebrow intro-kicker">{{ stepNumber }} · 试打</div>
      <h1>看键位图，打出「{{ trialWord?.text ?? '双拼' }}」</h1>
      <div class="intro-grid intro-grid--try">
        <div v-if="session" class="try-stream">
          <PracticeStream
            :session="session"
            mode="grid"
            :tier="3"
            :wrong-inputs="wrongInputs"
            :revealed="revealed"
          />
        </div>
        <div class="intro-prose">
          <p>每个字固定两键：先声母、后韵母。目标键已经隐藏，去页面底部的键位图里找；键位图可以用 <kbd>Ctrl+K</kbd> 随时显隐。</p>
          <p>打错时这个字会变红并锁住：按退格逐键撤销，或按空格 / Enter 一次清空重来；同一个字错满 3 次会直接揭示答案。</p>
          <p v-if="trialWord" class="try-tip">
            不需要提前背键位：按下的键会在键位图上亮起，把
            「{{ trialWord.chars[0] ?? '双' }}」＝{{ trialWord.syllables[0]?.caps.map((cap) => cap.key.toUpperCase()).join(' + ') ?? '' }}
            这样的组合和字形一起记，比背整张表更牢。
          </p>
          <p v-else class="try-tip">当前词表没有可用于试打的词，可以直接进入第 1 课。</p>
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
/* 桌面：卡片撑满可用高度，内容在卡片内滚动（键位图从第一页起固定在底部） */
.intro-card {
  flex: 1;
  width: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 26px 36px;
  border-radius: var(--r-xl);
  border: 1px solid var(--line);
  background: var(--surface);
  box-shadow: var(--shadow-md);
  overflow-y: auto;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  animation: ui-fade-up 260ms var(--ease);
}
.intro-kicker {
  margin: 0;
}
.intro-card h1 {
  margin: 8px 0 22px;
  color: var(--ink);
  font-size: clamp(26px, 2.3vw, 34px);
  font-weight: 800;
  letter-spacing: -0.035em;
  line-height: 1.2;
}
.intro-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 14px;
  margin: 8px 0 22px;
}
.intro-head h1 {
  margin: 0;
}
.intro-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
  gap: clamp(20px, 3vw, 44px);
  align-items: start;
}
.intro-grid--atoms {
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
}
.intro-grid--try {
  grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr);
}
.intro-visual {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: 18px 16px;
  border-radius: var(--r-lg);
  border: 1px solid var(--line-faint);
  background: var(--surface-2);
}
.intro-prose {
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: var(--ink-2);
  font-size: 14px;
  line-height: 1.9;
}
.intro-prose b,
.intro-prose strong {
  color: var(--ink);
  font-weight: 750;
}

/* ── 拼音基础 ───────────────────────────────────── */
.anatomy-panel {
  align-items: center;
  gap: 16px;
  padding: 32px 20px;
}
.anatomy-word {
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: clamp(38px, 4.4vw, 52px);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.1;
}
.anatomy-parts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.anatomy-part {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 14px;
  border: 1px solid var(--line);
  border-radius: var(--r-control);
  background: var(--surface);
}
.anatomy-part b {
  font-family: var(--font-mono);
  font-size: 20px;
  font-weight: 750;
  line-height: 1.2;
}
.anatomy-part small {
  color: var(--ink-4);
  font-size: 10px;
  line-height: 1.4;
}
.anatomy-part.is-initial {
  border-color: var(--focus-initial-soft);
  background: color-mix(in srgb, var(--ini) 8%, var(--surface));
}
.anatomy-part.is-initial b {
  color: var(--ini);
}
.anatomy-part.is-final {
  border-color: var(--focus-final-soft);
  background: color-mix(in srgb, var(--fin) 9%, var(--surface));
}
.anatomy-part.is-final b {
  color: var(--fin);
}
.anatomy-part.is-tone b {
  color: var(--brand-ink);
}
.anatomy-op {
  color: var(--ink-4);
  font-family: var(--font-mono);
  font-size: 16px;
}
.anatomy-caption {
  color: var(--ink-3);
  font-size: var(--text-sm);
}

/* ── 原子列表 ───────────────────────────────────── */
.atoms-panel {
  gap: 10px;
}
.atoms-head {
  padding: 0 2px;
}
.atoms-hint {
  color: var(--ink-4);
  font-size: 10.5px;
  line-height: 1.4;
  text-align: right;
}
.atom-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 6px;
  align-content: start;
}
.atom-grid--wide {
  grid-template-columns: repeat(auto-fill, minmax(172px, 1fr));
}

/* ── 示例卡 ─────────────────────────────────────── */
.example-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--line-faint);
  border-radius: var(--r-md);
  background: var(--surface-2);
}
.example-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 10px;
}
.example-word {
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.01em;
  line-height: 1.1;
}
.example-caption {
  color: var(--ink-4);
  font-size: 10.5px;
  line-height: 1.5;
}
.example-parts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.example-op {
  color: var(--ink-4);
  font-family: var(--font-mono);
  font-size: 14px;
}
.example-keys {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 3px;
}
.example-note {
  color: var(--ink-3);
  font-size: 11px;
  line-height: 1.6;
}

/* ── 多键 ───────────────────────────────────────── */
.multi-panel {
  gap: 14px;
}
.atom-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  color: var(--ink-3);
  font-size: 11px;
}
.atom-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.legend-swatch {
  width: 10px;
  height: 10px;
  border: 1px solid var(--line-strong);
  border-radius: 3px;
  background: var(--surface);
}
.legend-swatch.is-primary {
  border-color: var(--brand-fill);
  background: var(--brand-fill);
}
.multi-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* ── 推荐码 / 兼容编码 ──────────────────────────── */
.codes-panel {
  gap: 10px;
}
.codes-empty {
  color: var(--ink-3);
  font-size: var(--text-sm);
}

/* ── 工具说明 ───────────────────────────────────── */
.tool-panel {
  gap: 12px;
}
.tool-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.tool-row b {
  display: block;
  color: var(--ink);
  font-size: 13px;
  line-height: 1.5;
}
.tool-row p {
  margin-top: 1px;
  color: var(--ink-3);
  font-size: 11.5px;
  line-height: 1.6;
}
.tool-swatch {
  flex: none;
  width: 22px;
  height: 22px;
  margin-top: 1px;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: var(--surface);
}
.tool-swatch.is-primary {
  border-color: var(--brand-fill);
  background: var(--brand-fill);
}
.tool-flow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--r-md);
  background: var(--surface);
}
.tool-flow-step {
  padding: 4px 9px;
  border-radius: var(--r-control);
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: 11px;
  font-weight: 650;
  line-height: 1.5;
}
.tool-flow-step.is-accent {
  background: var(--brand-soft);
  color: var(--brand-ink);
}
.tool-flow-step.is-success {
  background: var(--success-soft);
  color: var(--success-strong);
}
.tool-flow-op {
  color: var(--ink-4);
  font-family: var(--font-mono);
  font-size: 12px;
}
.tool-note {
  color: var(--ink-3);
  font-size: 11px;
  line-height: 1.6;
}

/* ── 试打 ───────────────────────────────────────── */
/* 桌面：试打页不整体滚动，练习流填满卡片剩余高度，右侧说明单独滚动。 */
.intro-card--try {
  padding-top: 20px;
  padding-bottom: 16px;
  overflow: hidden;
}
.intro-card--try h1 {
  margin: 4px 0 12px;
  font-size: clamp(22px, 1.9vw, 28px);
}
.intro-card--try .intro-grid--try {
  flex: 1;
  min-height: 0;
  align-items: stretch;
}
.intro-card--try .try-stream {
  height: auto;
  min-height: 0;
}
.intro-card--try .intro-prose {
  padding-right: 4px;
  overflow-y: auto;
  scrollbar-width: thin;
}
/* 试打页空间有限：略收窄字卡，让单个词完整显示在练习流里。 */
.intro-card--try .try-stream :deep(.char-card) {
  width: clamp(104px, 10vw, 128px);
}
.try-stream {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 250px;
  height: clamp(250px, 28vh, 340px);
}
.intro-grid--try .intro-prose {
  padding-top: 8px;
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

@media (max-width: 960px) {
  .intro-card {
    padding: 24px 26px;
  }
  .intro-grid,
  .intro-grid--atoms,
  .intro-grid--try {
    grid-template-columns: 1fr;
    gap: 18px;
  }
  /* 单列时试打流固定高度，整页在卡片内自然滚动。 */
  .intro-card--try {
    overflow-y: auto;
  }
  .intro-card--try .intro-grid--try {
    flex: none;
  }
  .intro-card--try .try-stream {
    height: clamp(300px, 44vh, 380px);
    min-height: 300px;
  }
  .intro-card--try .intro-prose {
    padding-right: 0;
    overflow: visible;
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
    overflow: visible;
    padding: 20px 16px;
  }
  .intro-card h1 {
    margin: 6px 0 16px;
    font-size: 24px;
  }
  .intro-head {
    margin: 6px 0 16px;
  }
  .atom-grid,
  .atom-grid--wide {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .anatomy-word {
    font-size: 38px;
  }
  .intro-card--try {
    overflow: visible;
  }
  .intro-card--try .try-stream {
    height: auto;
    min-height: 330px;
  }
}
</style>
