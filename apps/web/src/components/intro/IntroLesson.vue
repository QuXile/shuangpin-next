<script setup lang="ts">
/**
 * 入门课「认识双拼」：完全由当前方案数据自动生成的通用入门课。
 *
 * 内容结构由 IntroLesson 的通用页面顺序定义。
 * 拼音基础 → 声母 → 韵母 → 零声母 → 多键（条件）→ 推荐码 / 兼容编码（条件）→ 工具说明 → 试打。
 * - 不写死任何方案名 / 键位；声母、韵母、零声母、示例、推荐码、兼容编码全部来自 SchemeDef + engine + 词表；
 * - 主键（数组第一条 / 主序列）紫色，其余键普通样式，所有列出的键都合法；
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
  cellKeyOf as coreCellKeyOf,
  hasInputError as coreHasInputError,
  type PracticeWord,
  type SchemeDef,
  type SessionState,
  type WordEntry,
  type WordSyllable,
} from '@shuangpin/core'
import PracticeStream from '@/components/practice/PracticeStream.vue'
import IntroPageShell from '@/components/intro/IntroPageShell.vue'
import IntroStepLayout from '@/components/intro/IntroStepLayout.vue'
import PinyinAnatomy from '@/components/intro/PinyinAnatomy.vue'
import SchemeGuideCards from '@/components/intro/SchemeGuideCards.vue'
import { useGlobalKeys, type KeyBinding } from '@/composables/useGlobalKeys'
import type { FocusAtomView } from '@/lib/lessonView'
import { useSoundStore } from '@/stores/sound'
import CodeExampleCard from './CodeExampleCard.vue'
import FocusTagList from '@/components/FocusTagList.vue'
import KeyAtomCapsule from './KeyAtomCapsule.vue'
import KeyCap from '@/components/common/KeyCap.vue'
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

type StepId = IntroSectionKind | 'scheme-guide' | 'try'

const steps = computed<StepId[]>(() => {
  const sections = model.value.sections.map((section) => section.kind)
  const guideAt = sections.length > 0 ? 1 : 0
  return [...sections.slice(0, guideAt), 'scheme-guide', ...sections.slice(guideAt), 'try']
})
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

/** 入门课原子列表复用课程「映射范围」同款 chip（新 = 需要新学，沿 = 与全拼一致）。 */
function toFocusTags(atoms: readonly KeyAtom[]): FocusAtomView[] {
  return atoms.map((atom) => ({
    atomId: atom.atomId,
    label: atom.label,
    keys: atom.keys.map((key) => key.sequence),
    badge: atom.free ? '沿' : '新',
    type: atom.kind,
    anchors: [],
  }))
}

const initialTags = computed(() => toFocusTags(initialsSection.value.atoms))
const finalTags = computed(() => toFocusTags(finalsSection.value.atoms))
const zeroTags = computed(() => toFocusTags(zeroSection.value.atoms))
const multiTags = computed(() => toFocusTags(multiKeySection.value.atoms))

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

const stepTitle = computed(() => {
  switch (step.value) {
    case 'pinyin-basics': return '双拼不改变拼音'
    case 'scheme-guide': return '找到适合自己的双拼方案'
    case 'initials': return `${initialsSection.value.atoms.length} 个声母，各对应一套键位`
    case 'finals': return `${finalsSection.value.atoms.length} 个韵母，把长拼音压成一键`
    case 'zero-initials': return `${zeroSection.value.atoms.length} 个零声母，整段序列就是答案`
    case 'multi-key': return '同一个映射，可以有多个键'
    case 'codes': return '推荐码与兼容编码'
    case 'tool-legend': return '看懂键位、答案和判题'
    case 'try': return '打出「双拼」'
    default: return '认识双拼'
  }
})

const stepBadge = computed(() => {
  switch (step.value) {
    case 'pinyin-basics': return '声母 + 韵母 + 声调'
    case 'scheme-guide': return '5 套定制方案'
    case 'initials': return `${initialsSection.value.atoms.length} 个映射`
    case 'finals': return `${finalsSection.value.atoms.length} 个映射`
    case 'zero-initials': return `${zeroSection.value.atoms.length} 个映射`
    case 'multi-key': return `${multiKeySection.value.totalCount} 个多键映射`
    case 'codes': {
      const parts: string[] = []
      if (codesSection.value.hasRecommended) parts.push(`${codesSection.value.recommendedTotal} 条推荐码`)
      if (codesSection.value.hasCompat) parts.push(`${codesSection.value.compatTotal} 组兼容编码`)
      return parts.join(' · ') || '编码说明'
    }
    case 'tool-legend': return `${toolSection.value.initialCount} 声母 · ${toolSection.value.finalCount} 韵母 · ${toolSection.value.zeroCount} 零声母`
    case 'try': return '试一试'
    default: return ''
  }
})

// ── 试打（core session，保留原有交互） ──────────────────────
/** 入门课固定试打词：双拼。 */
const TRIAL_ENTRY: WordEntry = {
  text: '双拼',
  length: 2,
  freq: 0,
  chars: ['双', '拼'],
  syllables: [
    { text: '双', pinyin: 'shuang', initial: 'sh', final: 'uang', tone: 1 },
    { text: '拼', pinyin: 'pin', initial: 'p', final: 'in', tone: 1 },
  ] as WordSyllable[],
}
const trialWord = computed<PracticeWord>(() => buildPracticeWord(engine.value, TRIAL_ENTRY))

const session = shallowRef<SessionState | null>(null)
const EMPTY_MAP: ReadonlyMap<string, string[]> = new Map()
const EMPTY_SET: ReadonlySet<string> = new Set()
/** 判题交互状态全部来自 core SessionState（唯一真相），组件不再维护本地副本。 */
const wrongInputs = computed(() => session.value?.wrongInputs ?? EMPTY_MAP)
const revealed = computed(() => session.value?.revealed ?? EMPTY_SET)
const currentCellKey = computed(() =>
  session.value ? coreCellKeyOf(session.value) : null,
)
const hasInputError = computed(() =>
  session.value ? coreHasInputError(session.value) : false,
)
const completed = computed(() => session.value?.phase === 'finished')

function resetTry(): void {
  const word = trialWord.value
  if (!word) {
    session.value = null
    return
  }
  session.value = createSession({ words: [word], now: performance.now() })
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
  // 错误记录 / 错误锁定 / 第 3 次揭示全部由 core applyKey 维护。
  const result = applyKey(state, raw, performance.now())
  if (result.feedback.kind === 'wrong') sound.playError()
  else if (result.feedback.kind === 'word-complete') sound.playComplete()
  else sound.playKey()
  session.value = result.state
  if (result.state.phase === 'finished') emit('finished')
}

function handleBackspace(): void {
  sound.playKey()
  if (step.value !== 'try') return
  if (!session.value || session.value.phase === 'finished') return
  session.value = backspace(session.value)
}

/** 空格 / Enter：清空当前字输入并取消红色错误状态（core clearInput 维护） */
function clearCurrentInput(): void {
  if (step.value !== 'try') return
  if (!session.value || session.value.phase === 'finished') return
  sound.playKey()
  session.value = clearInput(session.value)
}
// ── 步骤推进 ─────────────────────────────────────────────────
const nextDisabled = computed(
  () => step.value === 'try' && !completed.value && !props.passed,
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
    <IntroPageShell
      :success="completed && step === 'try'"
      :can-previous="canPrevious"
      :step-number="stepNumber"
      :total-steps="totalSteps"
      :steps="steps"
      :step-index="stepIndex"
      :step-title="stepTitle"
      :step-badge="stepBadge"
      :next-disabled="nextDisabled"
      :next-label="nextLabel"
      @previous="previous"
      @next="primaryAction"
    />


    <!-- 1 · 拼音基础（固定通用内容） -->
    <IntroStepLayout v-if="step === 'pinyin-basics'" visual-class="anatomy-panel">
      <template #visual>
        <PinyinAnatomy />
      </template>
      <div class="intro-prose">
        <p>拼音音节可以拆成「声母 + 韵母 + 声调」。例如 <b>shuāng</b> = sh + uang + 第一声。</p>
        <p>双拼只改变声母和韵母的<strong>按键方式</strong>，不改变拼音本身：读法照旧，只是把 sh 和 uang 各按到一个键上。</p>
        <p>有些音节没有声母，例如 āi、ér，称为<b>零声母</b>；当前方案也为它们单独安排了键位。</p>
        <p>所以入门课要建立的是「看到拼音 → 找到对应两键」的新映射，不需要重新学发音。</p>
      </div>
    </IntroStepLayout>

    <!-- 2 · 声母 -->
    <IntroStepLayout v-else-if="step === 'initials'" grid-class="intro-grid--atoms" visual-class="atoms-panel">
      <template #visual>
          <header class="atoms-head panel-head">
            <h2 class="panel-title">全部声母</h2>
            <span v-if="initialsSection.freeCount > 0" class="atoms-hint">带「沿」标记的与全拼一致</span>
          </header>
          <FocusTagList :items="initialTags" />
      </template>
      <div class="intro-prose">
          <p>当前方案「{{ model.schemeName }}」共有 {{ initialsSection.atoms.length }} 个声母：<b>{{ initialsSection.learnCount }}</b> 个需要重新记键位，<b>{{ initialsSection.freeCount }}</b> 个与全拼一致。</p>
          <p>每个声母对应一个键。若一个声母列出多个键，紫色是<b>主键</b>，其他是<b>副键</b>——它们都是合法输入，不是只能按紫色。</p>
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
                <KeyCap
                  v-for="(key, index) in initialsSection.example.primary"
                  :key="`${key}-${index}`"
                  :text="key"
                  :variant="initialsSection.example.primaryVariants[index]"
                />
              </span>
            </div>
            <p v-if="initialsSection.example.accepted.length > 1" class="example-note">
              这个音节共有 {{ initialsSection.example.accepted.length }} 种被接受的组合。
            </p>
          </div>
      </div>
    </IntroStepLayout>

    <!-- 3 · 韵母 -->
    <IntroStepLayout v-else-if="step === 'finals'" grid-class="intro-grid--atoms" visual-class="atoms-panel">
      <template #visual>
          <header class="atoms-head panel-head">
            <h2 class="panel-title">全部韵母</h2>
            <span v-if="finalsSection.freeCount > 0" class="atoms-hint">带「沿」标记的与全拼一致</span>
          </header>
          <FocusTagList :items="finalTags" />
      </template>
      <div class="intro-prose">
          <p>当前方案「{{ model.schemeName }}」共有 {{ finalsSection.atoms.length }} 个韵母：<b>{{ finalsSection.learnCount }}</b> 个需要重新记，<b>{{ finalsSection.freeCount }}</b> 个与全拼一致。</p>
          <p>韵母决定音节的后半段。列出多个键时，紫色是<b>主键</b>，其他是<b>副键</b>；所有列出的键都是合法输入，不要求只用紫色。</p>
          <p>拼音里的 ü 在方案数据中写作 v，如 ü → v、üe → ve；列表中的韵母名与键位就是实际输入的按键，以列出的键为准。</p>

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
                <KeyCap
                  v-for="(key, index) in finalsSection.example.primary"
                  :key="`${key}-${index}`"
                  :text="key"
                  :variant="finalsSection.example.primaryVariants[index]"
                />
              </span>
            </div>
            <p v-if="finalsSection.example.accepted.length > 1" class="example-note">
              这个音节共有 {{ finalsSection.example.accepted.length }} 种被接受的组合。
            </p>
          </div>
      </div>
    </IntroStepLayout>

    <!-- 4 · 零声母 -->
    <IntroStepLayout v-else-if="step === 'zero-initials'" grid-class="intro-grid--atoms" visual-class="atoms-panel">
      <template #visual>
          <header class="atoms-head panel-head">
            <h2 class="panel-title">全部零声母</h2>
            <span v-if="zeroSection.freeCount > 0" class="atoms-hint">带「沿」标记的与全拼一致</span>
          </header>
          <FocusTagList :items="zeroTags" />
      </template>
      <div class="intro-prose">
          <p>没有声母的音节叫<b>零声母</b>，例如 a、ai、er。当前方案为这 {{ zeroSection.atoms.length }} 个音节分别定义了完整的按键序列。</p>
          <p v-if="zeroSection.multiCount > 0">零声母不是「先按什么、再按什么」，而是一整段固定序列；一个音节可能有多条序列，紫色是<b>主序列</b>，其他序列同样合法。</p>
          <p v-else>零声母不是「先按什么、再按什么」，而是一整段固定序列。</p>
          <p>{{ zeroSection.freeCount }} 个零声母的序列与全拼拼写一致，标「沿」，{{ zeroSection.learnCount }} 个需要重新记。</p>
          <div v-if="zeroSection.example" class="example-card">
            <div class="example-head">
              <span class="example-word">{{ zeroSection.example.atom.label }}</span>
              <span class="example-caption">完整序列，一次输入</span>
            </div>
            <div class="example-parts">
              <span class="example-keys">
                <KeyCap :text="zeroSection.example.primary" variant="primary" />
              </span>
              <span class="example-caption">主序列</span>
            </div>
            <p v-if="zeroSection.example.atom.keys.length > 1" class="example-note">
              该音节还有 {{ zeroSection.example.atom.keys.length - 1 }} 条副序列，也都能被判题接受。
            </p>
          </div>
      </div>
    </IntroStepLayout>

    <!-- 5 · 多键（仅当存在多键原子） -->
    <IntroStepLayout v-else-if="step === 'multi-key'" visual-class="multi-panel">
      <template #visual>
          <div class="atom-legend">
            <span class="atom-legend-item"><i class="legend-swatch is-primary" aria-hidden="true" />主键 紫色</span>
            <span class="atom-legend-item"><i class="legend-swatch" aria-hidden="true" />副键 / 兼容键</span>
          </div>
          <div class="multi-list">
            <FocusTagList :items="multiTags" />
          </div>
      </template>
      <div class="intro-prose">
          <p>本方案有 <b>{{ multiKeySection.totalCount }}</b> 个映射带多个键：同一个声母、韵母或零声母，可以用不止一个键输入。</p>
          <p>紫色是<b>主键</b>，也是工具默认展示、答案卡优先显示的键；其他键是<b>副键</b>。所有列出的键都能参与组合，都会被判题接受。</p>
          <p v-if="multiKeySection.hasRecommended">方案数据里还有推荐码：标答以推荐码为准，推荐码可能与「主键 + 主键」的组合不同。</p>
          <p v-else>没有推荐码时，「主键 + 主键」的组合就是默认标答。</p>
          <p v-if="multiKeySection.sharedKey">同一个键也可能被多个映射共用，例如 <b>{{ multiKeySection.sharedKey.key }}</b> 键同时对应韵母 {{ multiKeySection.sharedKey.labels.join('、') }}；每个韵母仍按自己的主键 / 副键判断，判题看完整的按键序列。</p>
          <p>练习时按任意合法键都算对，不必只按紫色。</p>
      </div>
    </IntroStepLayout>

    <!-- 6 · 推荐码与兼容编码（仅当方案数据存在） -->
    <IntroStepLayout v-else-if="step === 'codes'" visual-class="codes-panel">
      <template #visual>
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
      </template>
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
    </IntroStepLayout>

    <!-- 7 · 工具使用说明（固定通用内容 + 当前方案数据） -->
    <IntroStepLayout v-else-if="step === 'tool-legend'" visual-class="tool-panel">
      <template #visual>
          <div class="tool-row">
            <span class="tool-swatch is-primary" aria-hidden="true" />
            <div>
              <b>紫色键 = 主键</b>
              <p>工具默认展示、答案卡优先显示。</p>
            </div>
          </div>
          <div v-if="toolSection.hasMulti || toolSection.hasCodes" class="tool-row">
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
          <p class="tool-note">答案卡只显示 primary 标答；判题接受全部 accepted，不只认标答。</p>
      </template>
      <div class="intro-prose">
          <p><b>紫色键</b>是工具默认显示的主键。</p>
          <p v-if="toolSection.hasMulti || toolSection.hasCodes"><b>普通样式</b>的键是副键 / 兼容键，它们都是合法输入。</p>
          <p>答案卡显示 primary 标答，但判题接受全部 accepted：副键、兼容编码、主键组合都算对。</p>
          <p>页面底部的键位图会列出全部映射<template v-if="toolSection.hasMulti">，多键映射会全部标出</template><template v-if="toolSection.hasCodes">，兼容编码单独成行</template>；可以用 <kbd>Ctrl+K</kbd> 随时显隐。</p>
          <p>课程和练习场使用同一套判题规则。</p>
          <p v-if="toolSection.hasMulti || toolSection.hasCodes">练习时不必只按紫色键，按任意合法组合都能通过。</p>
          <p>课程进度只保存在本地浏览器，不会同步到其他设备。</p>
      </div>
    </IntroStepLayout>

    <!-- 方案选择指南 -->
    <IntroStepLayout v-else-if="step === 'scheme-guide'" grid-class="intro-grid--guide" visual-class="scheme-guide">
      <template #visual>
        <SchemeGuideCards :current-id="scheme.id" />
      </template>
      <div class="intro-prose">
        <p>没有绝对最好的双拼方案，只有更适合你的方案。</p>
        <p>如果你还没有偏好，优先考虑教程与输入法支持最广的方案；如果你经常换设备，优先考虑系统自带方案；如果你已经在用某个输入法，优先选择它已内置的方案。</p>
        <p>当前正在学习的是 <b>{{ model.schemeName }}</b>。你可以在学习路线顶部随时切换方案，进度会按方案分别保存。</p>
        <p>选定后先坚持练一段时间，比频繁换方案更有效。</p>
      </div>
    </IntroStepLayout>

    <!-- 8 · 试打（保留原有交互） -->
    <IntroStepLayout
      v-else-if="step === 'try'"
      card-class="intro-card--try"
      grid-class="intro-grid--try"
      visual-class="try-panel"
    >
      <template #visual>
        <div v-if="session" class="try-stream">
          <PracticeStream
            :session="session"
            mode="grid"
            :tier="3"
            :wrong-inputs="wrongInputs"
            :revealed="revealed"
          />
        </div>
      </template>
      <div class="intro-prose">
          <p>每个字固定两键：先声母、后韵母。目标键已经隐藏，去页面底部的键位图里找；键位图可以用 <kbd>Ctrl+K</kbd> 随时显隐。</p>
          <p>打错时这个字会变红并锁住：按退格逐键撤销，或按空格 / Enter 一次清空重来；同一个字错满 3 次会直接揭示答案。</p>
          <p class="try-tip">
            不需要提前背键位：按下的键会在键位图上亮起，把
            「{{ trialWord.chars[0] ?? '双' }}」＝{{ trialWord.syllables[0]?.caps.map((cap) => cap.key.toUpperCase()).join(' + ') ?? '' }}
            这样的组合和字形一起记，比背整张表更牢。
          </p>
          <p v-if="wrongInputs.size > 0 && !completed" class="try-bad">
            {{ revealed.size > 0 ? '已显示答案，照着键位图完成这个字。' : '键位不对，同一个字第 3 次错误会显示答案。' }}
          </p>
          <p v-else-if="completed" class="try-ok">「双拼」完成。</p>
      </div>
    </IntroStepLayout>
  </div>
</template>

<style scoped>
.intro-page {
  width: 100%;
  max-width: var(--content-narrow);
  height: 100%;
  min-height: 0;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
}
/* 桌面：卡片撑满可用高度，内容在卡片内滚动（键位图从第一页起固定在底部） */
.intro-prose {
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: var(--ink-2);
  font-size: var(--text-base);
  line-height: 1.9;
}
.intro-prose b,
.intro-prose strong {
  color: var(--ink);
  font-weight: 750;
}

/* ── 拼音基础 ───────────────────────────────────── */

/* ── 原子列表 ───────────────────────────────────── */
.atoms-panel {
  gap: 10px;
}
.atoms-head {
  padding: 0 2px;
}
.atoms-hint {
  color: var(--ink-4);
  font-size: var(--text-2xs);
  line-height: 1.4;
  text-align: right;
}

/* ── 示例卡 ─────────────────────────────────────── */
.example-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: var(--r-card);
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
  font-size: var(--text-xl);
  font-weight: 800;
  letter-spacing: -0.01em;
  line-height: 1.1;
}
.example-caption {
  color: var(--ink-4);
  font-size: var(--text-2xs);
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
  font-size: var(--text-base);
}
.example-keys {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 3px;
}
.example-note {
  color: var(--ink-3);
  font-size: var(--text-xs);
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
  font-size: var(--text-xs);
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
  border-radius: var(--r-xs);
  background: var(--surface);
}
.legend-swatch.is-primary {
  border-color: var(--mapping-focus-line);
  background: var(--mapping-focus);
}
.multi-list {
  min-width: 0;
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
  font-size: var(--text-base);
  line-height: 1.5;
}
.tool-row p {
  margin-top: 1px;
  color: var(--ink-3);
  font-size: var(--text-xs);
  line-height: 1.6;
}
.tool-swatch {
  flex: none;
  width: 22px;
  height: 22px;
  margin-top: 1px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-xs);
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
  border-radius: var(--r-card);
  background: var(--surface);
}
.tool-flow-step {
  padding: 4px 9px;
  border-radius: var(--r-control);
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: var(--text-xs);
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
  font-size: var(--text-sm);
}
.tool-note {
  color: var(--ink-3);
  font-size: var(--text-xs);
  line-height: 1.6;
}

/* ── 试打 ───────────────────────────────────────── */
/* 桌面：试打页不整体滚动，练习流填满卡片剩余高度，右侧说明单独滚动。 */
/* 试打页空间有限：略收窄字卡，让单个词完整显示在练习流里。 */
.try-stream {
  display: flex;
  width: 100%;
  min-width: 0;
  flex: 1;
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

@media (max-width: 640px) {
  /* 移动端恢复自然高度，交给页面滚动 */
  .intro-page {
    height: auto;
    min-height: 0;
  }
}
</style>
