<script setup lang="ts">
/**
 * 训练场（/training）：专项练习（字/词，声母×韵母自由组合，无尽练习）
 * 与文章练习（粘贴/.txt 导入，core parseArticleText 断行，逐字练习 + 汇总）。
 *
 * 判题、错误锁定、退格、清空、按下高亮复用 useTrainingSession（内部共享 lib/sessionInput），
 * 不写课程进度/星级。
 */
import { computed, onMounted, onScopeDispose, ref, shallowRef, watch } from 'vue'
import {
  createSchemeEngine,
  filterTrainingEntries,
  parseArticleText,
  sessionMetrics,
  type AtomId,
  type SchemeEngine,
  type TrainingScope,
  type WordEntry,
} from '@shuangpin/core'
import PracticeStream from '@/components/practice/PracticeStream.vue'
import StageSummaryCard from '@/components/practice/StageSummaryCard.vue'
import KeyboardDock from '@/components/keyboard/KeyboardDock.vue'
import ArticleGrid from '@/components/training/ArticleGrid.vue'
import SetupCard from '@/components/training/SetupCard.vue'
import SetupGroup from '@/components/training/SetupGroup.vue'
import { useCourseStore } from '@/stores/course'
import { useGlobalKeys, type KeyBinding } from '@/composables/useGlobalKeys'
import { useTrainingSession } from '@/composables/useTrainingSession'
import { loadTrainingBank, type TrainingBank } from '@/lib/data'
import {
  articlesToPracticeWords,
  buildArticlePlan,
  buildTrainingBatch,
  entriesToPracticeWords,
  trainingAtomOptions,
} from '@/lib/training'

type Tab = 'drill' | 'article'
type DrillMode = 'char' | 'word'
type SessionKind = 'drill' | 'article' | null

const course = useCourseStore()
const trainer = useTrainingSession()
const {
  session,
  revealed,
  wrongInputs,
  keyErrors: sessionKeyErrors,
  completedWords,
  accuracy,
  inError,
  cpm,
  start: startSession,
  reset: resetSession,
  apply,
  backspace: sessionBackspace,
  clearInput,
} = trainer

// ── 数据 / 配置 ──────────────────────────────────────────────

const tab = ref<Tab>('drill')
const drillMode = ref<DrillMode>('char')
const bank = shallowRef<TrainingBank | null>(null)
const bankStatus = ref<'loading' | 'ready' | 'error'>('loading')
const bankError = ref('')
const selectedInitials = ref<ReadonlySet<string>>(new Set())
const selectedFinals = ref<ReadonlySet<string>>(new Set())
const selectedZeroFinals = ref<ReadonlySet<string>>(new Set())
const schemeId = ref('')
// 隐藏映射选择（出现/隐藏双选栏）；必须在下方 immediate watch 之前初始化
const hiddenInitials = ref<ReadonlySet<string>>(new Set())
const hiddenFinals = ref<ReadonlySet<string>>(new Set())
const hiddenZeroFinals = ref<ReadonlySet<string>>(new Set())
const articleHiddenInitials = ref<ReadonlySet<string>>(new Set())
const articleHiddenFinals = ref<ReadonlySet<string>>(new Set())
const articleHiddenZeroFinals = ref<ReadonlySet<string>>(new Set())

const schemeOptions = computed(() => course.schemeOptions)
const atomOptions = computed(() => (course.scheme ? trainingAtomOptions(course.scheme) : null))
const engine = computed<SchemeEngine | null>(() =>
  course.scheme ? createSchemeEngine(course.scheme) : null,
)

function selectAll(): void {
  const options = atomOptions.value
  if (!options) return
  selectedInitials.value = new Set(options.initials)
  selectedFinals.value = new Set(options.finals)
  selectedZeroFinals.value = new Set(options.zeroFinals)
}

watch(
  () => course.schemeId,
  (id) => {
    if (!id || id === schemeId.value) {
      if (!schemeId.value && atomOptions.value) {
        schemeId.value = id
        selectAll()
      }
      return
    }
    schemeId.value = id
    selectAll()
    hiddenInitials.value = new Set()
    hiddenFinals.value = new Set()
    hiddenZeroFinals.value = new Set()
    articleHiddenInitials.value = new Set()
    articleHiddenFinals.value = new Set()
    articleHiddenZeroFinals.value = new Set()
  },
  { immediate: true },
)

onMounted(async () => {
  await course.init()
  if (!schemeId.value && course.schemeId) {
    schemeId.value = course.schemeId
    selectAll()
  }
  try {
    bank.value = await loadTrainingBank()
    bankStatus.value = 'ready'
  } catch (cause) {
    bankStatus.value = 'error'
    bankError.value = cause instanceof Error ? cause.message : String(cause)
  }
})

watch(atomOptions, (options) => {
  if (options && selectedInitials.value.size === 0 && selectedFinals.value.size === 0) selectAll()
})

const scope = computed<TrainingScope>(() => ({
  initials: [...selectedInitials.value],
  finals: [...selectedFinals.value],
  zeroFinals: [...selectedZeroFinals.value],
}))

const baseEntries = computed<readonly WordEntry[]>(() => {
  const data = bank.value
  if (!data) return []
  return drillMode.value === 'char' ? data.chars : data.words
})
const availableEntries = computed<readonly WordEntry[]>(() =>
  bank.value ? filterTrainingEntries(baseEntries.value, scope.value) : [],
)
const availableCount = computed(() => availableEntries.value.length)
const previewTexts = computed(() => availableEntries.value.slice(0, 16).map((entry) => entry.text))
const previewSample = computed(
  () => previewTexts.value.join('、') + (availableCount.value > previewTexts.value.length ? '…' : ''),
)
const initialsSelectedCount = computed(() => selectedInitials.value.size)
const initialsTotalCount = computed(() => atomOptions.value?.initials.length ?? 0)
const canStartDrill = computed(
  () => bankStatus.value === 'ready' && Boolean(engine.value) && availableEntries.value.length > 0,
)

function toggleInitial(value: string): void {
  const next = new Set(selectedInitials.value)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  selectedInitials.value = next
}
function toggleFinal(value: string): void {
  const next = new Set(selectedFinals.value)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  selectedFinals.value = next
}
function toggleZeroFinal(value: string): void {
  const next = new Set(selectedZeroFinals.value)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  selectedZeroFinals.value = next
}
type Group = 'initial' | 'final'
function selectGroup(group: Group): void {
  const options = atomOptions.value
  if (!options) return
  if (group === 'initial') {
    selectedInitials.value = new Set(options.initials)
    selectedZeroFinals.value = new Set(options.zeroFinals)
  } else {
    selectedFinals.value = new Set(options.finals)
  }
}
function clearGroup(group: Group): void {
  if (group === 'initial') {
    selectedInitials.value = new Set()
    selectedZeroFinals.value = new Set()
  } else {
    selectedFinals.value = new Set()
  }
}
function invertGroup(group: Group): void {
  const options = atomOptions.value
  if (!options) return
  if (group === 'initial') {
    selectedInitials.value = new Set(options.initials.filter((item) => !selectedInitials.value.has(item)))
    selectedZeroFinals.value = new Set(options.zeroFinals.filter((item) => !selectedZeroFinals.value.has(item)))
  } else {
    selectedFinals.value = new Set(options.finals.filter((item) => !selectedFinals.value.has(item)))
  }
}

// ── 练习时隐藏映射（出现 / 隐藏双选栏） ──────────────────────

type HiddenScope = 'drill' | 'article'

const drillHiddenInitialCandidates = computed(() =>
  atomOptions.value ? atomOptions.value.initials.filter((item) => selectedInitials.value.has(item)) : [],
)
const drillHiddenFinalCandidates = computed(() =>
  atomOptions.value ? atomOptions.value.finals.filter((item) => selectedFinals.value.has(item)) : [],
)
const drillHiddenZeroCandidates = computed(() =>
  atomOptions.value ? atomOptions.value.zeroFinals.filter((item) => selectedZeroFinals.value.has(item)) : [],
)
const articleHiddenInitialCandidates = computed(() => atomOptions.value?.initials ?? [])
const articleHiddenFinalCandidates = computed(() => atomOptions.value?.finals ?? [])
const articleHiddenZeroCandidates = computed(() => atomOptions.value?.zeroFinals ?? [])

const hiddenInitialsOf = (scope: HiddenScope) =>
  scope === 'drill' ? hiddenInitials : articleHiddenInitials
const hiddenFinalsOf = (scope: HiddenScope) =>
  scope === 'drill' ? hiddenFinals : articleHiddenFinals
const hiddenZeroFinalsOf = (scope: HiddenScope) =>
  scope === 'drill' ? hiddenZeroFinals : articleHiddenZeroFinals

function toggleHidden(scope: HiddenScope, group: Group, value: string): void {
  const target = group === 'initial' ? hiddenInitialsOf(scope) : hiddenFinalsOf(scope)
  const next = new Set(target.value)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  target.value = next
}

function toggleHiddenZeroFinal(scope: HiddenScope, value: string): void {
  const target = hiddenZeroFinalsOf(scope)
  const next = new Set(target.value)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  target.value = next
}

function hiddenCandidatesOf(scope: HiddenScope): {
  initials: readonly string[]
  finals: readonly string[]
  zeroFinals: readonly string[]
} {
  return scope === 'drill'
    ? {
        initials: drillHiddenInitialCandidates.value,
        finals: drillHiddenFinalCandidates.value,
        zeroFinals: drillHiddenZeroCandidates.value,
      }
    : {
        initials: articleHiddenInitialCandidates.value,
        finals: articleHiddenFinalCandidates.value,
        zeroFinals: articleHiddenZeroCandidates.value,
      }
}

function hiddenGroupCandidates(scope: HiddenScope, group: Group): readonly string[] {
  const candidates = hiddenCandidatesOf(scope)
  return group === 'initial' ? candidates.initials : candidates.finals
}

/** 隐藏栏的 全选/反选/全不选 与出现栏一致，按声母/韵母分组 */
function selectHiddenGroup(scope: HiddenScope, group: Group): void {
  const target = group === 'initial' ? hiddenInitialsOf(scope) : hiddenFinalsOf(scope)
  target.value = new Set(hiddenGroupCandidates(scope, group))
  if (group === 'initial') {
    hiddenZeroFinalsOf(scope).value = new Set(hiddenCandidatesOf(scope).zeroFinals)
  }
}

function clearHiddenGroup(scope: HiddenScope, group: Group): void {
  const target = group === 'initial' ? hiddenInitialsOf(scope) : hiddenFinalsOf(scope)
  target.value = new Set()
  if (group === 'initial') hiddenZeroFinalsOf(scope).value = new Set()
}

function invertHiddenGroup(scope: HiddenScope, group: Group): void {
  const candidates = hiddenGroupCandidates(scope, group)
  const target = group === 'initial' ? hiddenInitialsOf(scope) : hiddenFinalsOf(scope)
  target.value = new Set(candidates.filter((item) => !target.value.has(item)))
  if (group === 'initial') {
    const zeroCandidates = hiddenCandidatesOf(scope).zeroFinals
    const hiddenZeros = hiddenZeroFinalsOf(scope)
    hiddenZeros.value = new Set(zeroCandidates.filter((item) => !hiddenZeros.value.has(item)))
  }
}

const drillHiddenCount = computed(
  () => hiddenInitials.value.size + hiddenFinals.value.size + hiddenZeroFinals.value.size,
)
const articleHiddenCount = computed(
  () =>
    articleHiddenInitials.value.size +
    articleHiddenFinals.value.size +
    articleHiddenZeroFinals.value.size,
)

/** 出现集合变化时，专项隐藏选择自动收缩到交集 */
watch(
  [selectedInitials, selectedFinals, selectedZeroFinals],
  () => {
    const nextInitials = new Set([...hiddenInitials.value].filter((item) => selectedInitials.value.has(item)))
    const nextFinals = new Set([...hiddenFinals.value].filter((item) => selectedFinals.value.has(item)))
    if (nextInitials.size !== hiddenInitials.value.size) hiddenInitials.value = nextInitials
    if (nextFinals.size !== hiddenFinals.value.size) hiddenFinals.value = nextFinals
    const zeroCandidates = new Set(
      (atomOptions.value?.zeroFinals ?? []).filter((item) => selectedZeroFinals.value.has(item)),
    )
    const nextZeros = new Set([...hiddenZeroFinals.value].filter((item) => zeroCandidates.has(item)))
    if (nextZeros.size !== hiddenZeroFinals.value.size) hiddenZeroFinals.value = nextZeros
  },
  { flush: 'sync' },
)

function atomIdsFor(
  initials: ReadonlySet<string>,
  finals: ReadonlySet<string>,
  zeroFinals: ReadonlySet<string>,
): AtomId[] {
  return [
    ...[...initials].map((item) => `initial:${item}` as AtomId),
    ...[...finals].map((item) => `final:${item}` as AtomId),
    ...[...zeroFinals].map((item) => `zero:${item}` as AtomId),
  ]
}

const sessionHiddenAtomIds = shallowRef<readonly AtomId[]>([])
const sessionHiddenLabels = shallowRef<readonly string[]>([])
const sessionHiddenCount = computed(() => sessionHiddenAtomIds.value.length)
const sessionHiddenTitle = computed(() =>
  sessionHiddenLabels.value.length ? `已隐藏：${sessionHiddenLabels.value.join('、')}` : '',
)

function hiddenLabelsFor(
  initials: ReadonlySet<string>,
  finals: ReadonlySet<string>,
  zeroFinals: ReadonlySet<string>,
): string[] {
  return [
    ...[...initials].map((item) => `声母 ${item}`),
    ...[...finals].map((item) => `韵母 ${item}`),
    ...[...zeroFinals].map((item) => `零声母 ${item}`),
  ]
}

// ── 会话 ──────────────────────────────────────────────────────

const kind = ref<SessionKind>(null)
const playing = computed(() => kind.value !== null && session.value !== null)
const pressedKeys = ref<string[]>([])
let pressTimer: number | undefined
function showPressed(key: string): void {
  pressedKeys.value = [key.toLowerCase()]
  if (pressTimer !== undefined) window.clearTimeout(pressTimer)
  pressTimer = window.setTimeout(() => {
    pressedKeys.value = []
  }, 160)
}

function makeDrillBatch(): ReturnType<typeof entriesToPracticeWords> {
  const schemeEngine = engine.value
  if (!schemeEngine) return []
  return buildTrainingBatch(schemeEngine, availableEntries.value, drillMode.value === 'char' ? 20 : 10)
}

function startDrill(): void {
  if (!canStartDrill.value) return
  const first = makeDrillBatch()
  sessionHiddenAtomIds.value = atomIdsFor(
    hiddenInitials.value,
    hiddenFinals.value,
    hiddenZeroFinals.value,
  )
  sessionHiddenLabels.value = hiddenLabelsFor(
    hiddenInitials.value,
    hiddenFinals.value,
    hiddenZeroFinals.value,
  )
  if (!startSession(first, { extend: makeDrillBatch })) return
  kind.value = 'drill'
}

const keyMapRows = computed(() => (engine.value ? engine.value.keyMap() : []))
const sessionTitle = computed(() =>
  kind.value === 'article' ? '文章练习' : `专项练习 · ${drillMode.value === 'char' ? '单字' : '词语'}`,
)
const countUnit = computed(() =>
  kind.value === 'article' || (kind.value === 'drill' && drillMode.value === 'char') ? '字' : '词',
)
const accuracyPercent = computed(() => Math.round(accuracy.value * 100))
const liveSpeed = computed(() => Math.round(cpm.value))
const liveMessage = computed(() => {
  const feedback = session.value?.lastFeedback
  if (!feedback) return ''
  if (feedback.kind === 'wrong') return feedback.message ?? '键位错误'
  if (feedback.kind === 'word-complete') return feedback.message ?? '完成'
  return ''
})

function exitSession(): void {
  resetSession()
  kind.value = null
}

function onLetter(raw: string): void {
  if (!playing.value) return
  showPressed(raw)
  apply(raw)
}
function onBackspace(): void {
  if (!playing.value) return
  showPressed('backspace')
  sessionBackspace()
}
function onClearInput(): void {
  if (!playing.value) return
  clearInput()
}
function onDockKey(letter: string): void {
  onLetter(letter)
}

// ── 文章 ──────────────────────────────────────────────────────

const articleText = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const parsed = computed(() => (articleText.value.trim() ? parseArticleText(articleText.value) : null))
const articlePlan = computed(() => {
  const data = bank.value
  const result = parsed.value
  return data && result ? buildArticlePlan(result.lines, data.chars) : null
})
const articleMappedCount = computed(() => {
  const plan = articlePlan.value
  return plan ? plan.chars.length - plan.skipped : 0
})
const articleSkippedCount = computed(() => articlePlan.value?.skipped ?? 0)
const canStartArticle = computed(
  () => bankStatus.value === 'ready' && Boolean(engine.value) && articleMappedCount.value > 0,
)
const articleDone = computed(() => {
  if (kind.value !== 'article') return false
  return session.value?.phase === 'finished'
})
const articleSummary = computed(() => {
  const state = session.value
  if (kind.value !== 'article' || !state) return null
  const metrics = sessionMetrics(state, performance.now())
  const finishedAt = state.stats.finishedAt ?? performance.now()
  const keyErrors = [...sessionKeyErrors.value.entries()]
    .map(([pair, count]) => {
      const [typed = '?', expected = '?'] = pair.split('|')
      return { expected: expected.toUpperCase(), typed: typed.toUpperCase(), count }
    })
    .sort((a, b) => b.count - a.count || a.expected.localeCompare(b.expected))
  return {
    words: metrics.completedWords,
    accuracy: Math.round(metrics.accuracy * 100),
    cpm: metrics.cpm,
    errors: state.stats.errors,
    durationSec: Math.max(1, Math.round((finishedAt - state.stats.startedAt) / 1000)),
    keyErrors,
  }
})

function startArticle(): void {
  const schemeEngine = engine.value
  const plan = articlePlan.value
  const data = bank.value
  if (!schemeEngine || !plan || !data || !canStartArticle.value) return
  const words = articlesToPracticeWords(schemeEngine, plan, data.chars)
  sessionHiddenAtomIds.value = atomIdsFor(
    articleHiddenInitials.value,
    articleHiddenFinals.value,
    articleHiddenZeroFinals.value,
  )
  sessionHiddenLabels.value = hiddenLabelsFor(
    articleHiddenInitials.value,
    articleHiddenFinals.value,
    articleHiddenZeroFinals.value,
  )
  if (!startSession(words)) return
  kind.value = 'article'
}

function replayArticle(): void {
  startArticle()
}

function changeArticle(): void {
  resetSession()
  kind.value = null
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  readArticleFile(file)
  input.value = ''
}

type ArticleInputMode = 'input' | 'import'
const articleInputMode = ref<ArticleInputMode>('input')
const articleFileName = ref('')
const articleDragActive = ref(false)

function readArticleFile(file: File | null | undefined): void {
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    articleText.value = String(reader.result ?? '')
    articleFileName.value = file.name
    articleInputMode.value = 'import'
  }
  reader.readAsText(file, 'utf-8')
}

function onArticleDrop(event: DragEvent): void {
  articleDragActive.value = false
  readArticleFile(event.dataTransfer?.files?.[0])
}

function clearArticle(): void {
  articleText.value = ''
  articleFileName.value = ''
}

function switchTab(next: Tab): void {
  if (playing.value) exitSession()
  tab.value = next
}

// ── 快捷键（唯一入口） ────────────────────────────────────────

const bindings = computed<KeyBinding[]>(() => {
  if (!playing.value) return []
  return [
    { letter: true, run: (event) => onLetter(event.key) },
    { key: 'Backspace', run: () => onBackspace() },
    { key: ' ', when: () => inError.value, run: () => onClearInput() },
    {
      key: 'Enter',
      when: (event) =>
        !(event.target instanceof HTMLButtonElement) &&
        !(event.target instanceof HTMLTextAreaElement) &&
        inError.value,
      run: () => onClearInput(),
    },
    { key: 'Escape', run: () => exitSession() },
  ]
})
useGlobalKeys(bindings)

onScopeDispose(() => {
  if (pressTimer !== undefined) window.clearTimeout(pressTimer)
})
</script>

<template>
  <div class="training-page">
    <template v-if="!playing">
      <div class="training-config">
        <header class="training-hero">
          <div class="training-hero-text">
            <h1>训练场</h1>
            <p class="training-sub">
              自由组合声母与韵母做专项训练，或粘贴文章逐字练习；可指定「练习时隐藏」的键位映射。
              训练结果不写入课程进度与星级。
            </p>
          </div>

          <div class="training-controls">
            <div class="training-controls-left">
              <div v-if="course.schemeOptions.length > 1" class="training-scheme">
                <label for="training-scheme-select">双拼方案</label>
                <select
                  id="training-scheme-select"
                  class="scheme-select"
                  :value="course.schemeId"
                  @change="course.setScheme(($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="option in course.schemeOptions" :key="option.id" :value="option.id">
                    {{ option.name }}
                  </option>
                </select>
              </div>
              <div v-if="tab === 'drill'" class="training-mode" role="group" aria-label="练习类型">
                <button
                  type="button"
                  class="mode-btn"
                  :class="{ 'is-active': drillMode === 'char' }"
                  @click="drillMode = 'char'"
                >
                  字
                </button>
                <button
                  type="button"
                  class="mode-btn"
                  :class="{ 'is-active': drillMode === 'word' }"
                  @click="drillMode = 'word'"
                >
                  词
                </button>
              </div>
            </div>

            <div class="training-tabs" role="tablist" aria-label="训练类型">
              <button
                type="button"
                role="tab"
                :aria-selected="tab === 'drill'"
                class="training-tab"
                :class="{ 'is-active': tab === 'drill' }"
                @click="switchTab('drill')"
              >
                专项练习
              </button>
              <button
                type="button"
                role="tab"
                :aria-selected="tab === 'article'"
                class="training-tab"
                :class="{ 'is-active': tab === 'article' }"
                @click="switchTab('article')"
              >
                文章练习
              </button>
            </div>
          </div>
        </header>

        <div v-if="bankStatus === 'error'" class="training-state is-error">
          <strong>训练字库加载失败</strong>
          <p>{{ bankError }}</p>
        </div>

        <!-- 专项练习 -->
        <section v-else-if="tab === 'drill'" class="training-panel">
          <div class="setup-grid">
            <SetupCard pill="出现" tone="appear" subtitle="本局训练范围">
              <div v-if="bankStatus === 'loading'" class="training-state">正在加载训练字库…</div>
              <template v-else-if="atomOptions">
                <SetupGroup title="声母" group="initial">
                  <template #count>
                    已选 {{ selectedInitials.size }}/{{ atomOptions.initials.length }} · 零 {{ selectedZeroFinals.size }}/{{ atomOptions.zeroFinals.length }}
                  </template>
                  <template #actions>
                    <button type="button" @click="selectGroup('initial')">全选</button>
                    <button type="button" @click="invertGroup('initial')">反选</button>
                    <button type="button" @click="clearGroup('initial')">全不选</button>
                  </template>
                  <button
                    v-for="initial in atomOptions.initials"
                    :key="initial"
                    type="button"
                    class="chip"
                    :class="{ 'is-selected': selectedInitials.has(initial) }"
                    @click="toggleInitial(initial)"
                  >
                    {{ initial }}
                  </button>
                  <button
                    v-for="zero in atomOptions.zeroFinals"
                    :key="`zero-${zero}`"
                    type="button"
                    class="chip is-special is-zero-chip"
                    :class="{ 'is-selected': selectedZeroFinals.has(zero) }"
                    @click="toggleZeroFinal(zero)"
                  >
                    零 {{ zero }}
                  </button>
                </SetupGroup>

                <SetupGroup title="韵母" group="final">
                  <template #count>
                    已选 {{ selectedFinals.size }}/{{ atomOptions.finals.length }}
                  </template>
                  <template #actions>
                    <button type="button" @click="selectGroup('final')">全选</button>
                    <button type="button" @click="invertGroup('final')">反选</button>
                    <button type="button" @click="clearGroup('final')">全不选</button>
                  </template>
                  <button
                    v-for="final in atomOptions.finals"
                    :key="final"
                    type="button"
                    class="chip"
                    :class="{ 'is-selected': selectedFinals.has(final) }"
                    @click="toggleFinal(final)"
                  >
                    {{ final }}
                  </button>
                </SetupGroup>
              </template>
            </SetupCard>

            <SetupCard pill="隐藏" tone="hidden" subtitle="练习时不显示映射">
              <SetupGroup
                v-if="drillHiddenInitialCandidates.length || drillHiddenZeroCandidates.length"
                title="声母"
                group="initial"
              >
                <template #count>
                  已隐藏 {{ hiddenInitials.size }}/{{ drillHiddenInitialCandidates.length }} · 零 {{ hiddenZeroFinals.size }}/{{ drillHiddenZeroCandidates.length }}
                </template>
                <template #actions>
                  <button type="button" @click="selectHiddenGroup('drill', 'initial')">全选</button>
                  <button type="button" @click="invertHiddenGroup('drill', 'initial')">反选</button>
                  <button type="button" @click="clearHiddenGroup('drill', 'initial')">全不选</button>
                </template>
                <button
                  v-for="initial in drillHiddenInitialCandidates"
                  :key="initial"
                  type="button"
                  class="chip is-hidden-chip"
                  :class="{ 'is-selected': hiddenInitials.has(initial) }"
                  @click="toggleHidden('drill', 'initial', initial)"
                >
                  {{ initial }}
                </button>
                <button
                  v-for="zero in drillHiddenZeroCandidates"
                  :key="`hidden-zero-${zero}`"
                  type="button"
                  class="chip is-special is-zero-chip is-hidden-chip"
                  :class="{ 'is-selected': hiddenZeroFinals.has(zero) }"
                  @click="toggleHiddenZeroFinal('drill', zero)"
                >
                  零 {{ zero }}
                </button>
              </SetupGroup>

              <SetupGroup v-if="drillHiddenFinalCandidates.length" title="韵母" group="final">
                <template #count>
                  已隐藏 {{ hiddenFinals.size }}/{{ drillHiddenFinalCandidates.length }}
                </template>
                <template #actions>
                  <button type="button" @click="selectHiddenGroup('drill', 'final')">全选</button>
                  <button type="button" @click="invertHiddenGroup('drill', 'final')">反选</button>
                  <button type="button" @click="clearHiddenGroup('drill', 'final')">全不选</button>
                </template>
                <button
                  v-for="final in drillHiddenFinalCandidates"
                  :key="final"
                  type="button"
                  class="chip is-hidden-chip"
                  :class="{ 'is-selected': hiddenFinals.has(final) }"
                  @click="toggleHidden('drill', 'final', final)"
                >
                  {{ final }}
                </button>
              </SetupGroup>

              <p
                v-if="!drillHiddenInitialCandidates.length && !drillHiddenFinalCandidates.length && !drillHiddenZeroCandidates.length"
                class="setup-empty"
              >
                先在「出现」中选择声母或韵母。
              </p>
            </SetupCard>
          </div>

          <div class="setup-actions">
            <div class="setup-bar-info">
              <strong>可用{{ drillMode === 'char' ? '字' : '词' }} {{ availableCount }} 条</strong>
              <span v-if="availableCount > 0" class="setup-bar-sub" :title="previewSample">
                示例：{{ previewSample }}
              </span>
              <span v-else class="setup-bar-sub is-warning">
                当前选择下没有匹配的{{ drillMode === 'char' ? '字' : '词' }}，请调整声母 / 韵母选择。
              </span>
            </div>
            <button
              class="btn btn--primary setup-start"
              type="button"
              :disabled="!canStartDrill"
              @click="startDrill"
            >
              开始练习
              <kbd>Enter</kbd>
            </button>
          </div>
        </section>

        <!-- 文章练习 -->
        <section v-else class="training-panel">
          <div class="setup-grid">
            <SetupCard tone="input">
              <template #head>
                <div class="article-mode-switch" role="tablist" aria-label="文章输入方式">
                  <span
                    class="article-mode-thumb"
                    :class="{ 'is-import': articleInputMode === 'import' }"
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    role="tab"
                    :aria-selected="articleInputMode === 'input'"
                    class="article-mode-btn"
                    :class="{ 'is-active': articleInputMode === 'input' }"
                    @click="articleInputMode = 'input'"
                  >
                    输入
                  </button>
                  <button
                    type="button"
                    role="tab"
                    :aria-selected="articleInputMode === 'import'"
                    class="article-mode-btn"
                    :class="{ 'is-active': articleInputMode === 'import' }"
                    @click="articleInputMode = 'import'"
                  >
                    导入
                  </button>
                </div>
                <span class="setup-card-sub">
                  {{ parsed ? `${parsed.chars.length} 个汉字 · ${parsed.lines.length} 行` : '粘贴文章或导入 .txt' }}
                </span>
                <button
                  v-if="articleText"
                  class="article-clear"
                  type="button"
                  @click="clearArticle"
                >
                  清空
                </button>
              </template>

              <div v-if="bankStatus === 'loading'" class="training-state">正在加载训练字库…</div>
              <template v-else>
                <input
                  ref="fileInput"
                  type="file"
                  accept=".txt,text/plain"
                  class="sr-only"
                  @change="onFileChange"
                />
                <textarea
                  v-if="articleInputMode === 'input'"
                  v-model="articleText"
                  class="article-input"
                  placeholder="粘贴文章内容…"
                  aria-label="文章内容"
                />
                <div
                  v-else
                  class="article-drop"
                  :class="{ 'is-drag': articleDragActive }"
                  role="button"
                  tabindex="0"
                  @click="fileInput?.click()"
                  @keydown.enter.prevent="fileInput?.click()"
                  @dragover.prevent="articleDragActive = true"
                  @dragleave.prevent="articleDragActive = false"
                  @drop.prevent="onArticleDrop"
                >
                  <span class="article-drop-icon" aria-hidden="true">＋</span>
                  <strong>{{ articleFileName || '点击选择或拖拽 .txt 文件' }}</strong>
                  <span class="article-drop-meta">
                    {{ articleFileName ? '已载入，切换到「输入」可继续编辑' : '支持 UTF-8 编码的 .txt；导入后可切换回「输入」继续编辑' }}
                  </span>
                </div>
                <ul class="article-notes">
                  <li>多音字按常用读音处理，不结合上下文消歧。</li>
                  <li>标点、引号、括号、字母、数字与空白都不显示，并作为断行；每行最多 5 个汉字。</li>
                </ul>
              </template>
            </SetupCard>

            <SetupCard pill="隐藏" tone="hidden" subtitle="练习时不显示映射">
              <SetupGroup title="声母" group="initial">
                <template #count>
                  已隐藏 {{ articleHiddenInitials.size }}/{{ articleHiddenInitialCandidates.length }} · 零 {{ articleHiddenZeroFinals.size }}/{{ articleHiddenZeroCandidates.length }}
                </template>
                <template #actions>
                  <button type="button" @click="selectHiddenGroup('article', 'initial')">全选</button>
                  <button type="button" @click="invertHiddenGroup('article', 'initial')">反选</button>
                  <button type="button" @click="clearHiddenGroup('article', 'initial')">全不选</button>
                </template>
                <button
                  v-for="initial in articleHiddenInitialCandidates"
                  :key="initial"
                  type="button"
                  class="chip is-hidden-chip"
                  :class="{ 'is-selected': articleHiddenInitials.has(initial) }"
                  @click="toggleHidden('article', 'initial', initial)"
                >
                  {{ initial }}
                </button>
                <button
                  v-for="zero in articleHiddenZeroCandidates"
                  :key="`article-hidden-zero-${zero}`"
                  type="button"
                  class="chip is-special is-zero-chip is-hidden-chip"
                  :class="{ 'is-selected': articleHiddenZeroFinals.has(zero) }"
                  @click="toggleHiddenZeroFinal('article', zero)"
                >
                  零 {{ zero }}
                </button>
              </SetupGroup>

              <SetupGroup title="韵母" group="final">
                <template #count>
                  已隐藏 {{ articleHiddenFinals.size }}/{{ articleHiddenFinalCandidates.length }}
                </template>
                <template #actions>
                  <button type="button" @click="selectHiddenGroup('article', 'final')">全选</button>
                  <button type="button" @click="invertHiddenGroup('article', 'final')">反选</button>
                  <button type="button" @click="clearHiddenGroup('article', 'final')">全不选</button>
                </template>
                <button
                  v-for="final in articleHiddenFinalCandidates"
                  :key="final"
                  type="button"
                  class="chip is-hidden-chip"
                  :class="{ 'is-selected': articleHiddenFinals.has(final) }"
                  @click="toggleHidden('article', 'final', final)"
                >
                  {{ final }}
                </button>
              </SetupGroup>
            </SetupCard>
          </div>

          <div class="setup-actions">
            <div class="setup-bar-info">
              <strong v-if="parsed">将练习 {{ articleMappedCount }} 字 · 跳过 {{ articleSkippedCount }} 字</strong>
              <strong v-else>等待输入文章…</strong>
            </div>
            <button
              class="btn btn--primary setup-start"
              type="button"
              :disabled="!canStartArticle"
              @click="startArticle"
            >
              开始练习
              <kbd>Enter</kbd>
            </button>
          </div>
        </section>
      </div>
    </template>

    <!-- 练习会话 -->
    <template v-else>
      <div class="training-session">
        <div class="training-toolbar">
          <div class="toolbar-left">
            <button class="training-exit" type="button" @click="exitSession">
              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19.5 12h-15" /><path d="m10.5 6-6 6 6 6" />
              </svg>
              退出
              <kbd>Esc</kbd>
            </button>
            <span class="toolbar-divider" aria-hidden="true" />
            <strong class="training-title">{{ sessionTitle }}</strong>
            <span class="training-stat is-primary">已练 {{ completedWords }} {{ countUnit }}</span>
            <span class="training-stat">正确率 {{ accuracyPercent }}%</span>
          </div>
          <div class="toolbar-right">
            <span
              v-if="sessionHiddenCount"
              class="training-stat is-hidden-stat"
              :title="sessionHiddenTitle"
              role="status"
            >隐藏 {{ sessionHiddenCount }} 项</span>
            <span class="speed-readout is-primary">
              <span class="speed-dot" aria-hidden="true" />
              {{ liveSpeed }} 字/分
            </span>
          </div>
        </div>

        <template v-if="kind === 'drill' && session">
          <PracticeStream
            :session="session"
            :live-message="liveMessage"
            :mode="drillMode === 'char' ? 'grid' : 'list'"
            :tier="1"
            :wrong-inputs="wrongInputs"
            :revealed="revealed"
            :hidden-atoms="sessionHiddenAtomIds"
          />
        </template>

        <template v-else-if="kind === 'article' && session">
          <div v-if="articleDone && articleSummary" class="article-summary-wrap">
            <StageSummaryCard
              kicker="文章练习"
              :title="`完成 ${articleSummary.words} 字`"
              tone="success"
              :stats="[
                { value: articleSummary.words, unit: '字', label: '字数' },
                { value: articleSummary.accuracy, unit: '%', label: '正确率' },
                { value: Math.round(articleSummary.cpm), unit: '字/分', label: '速度' },
                { value: articleSummary.errors, label: '错误次数' },
                { value: articleSummary.durationSec, unit: '秒', label: '用时' },
              ]"
              :key-errors="articleSummary.keyErrors"
            >
              <template #actions>
                <button class="btn btn--primary" type="button" @click="replayArticle">再来一遍</button>
                <button class="btn" type="button" @click="changeArticle">换文章</button>
              </template>
            </StageSummaryCard>
          </div>
          <ArticleGrid
            v-else-if="articlePlan"
            :plan="articlePlan"
            :session="session"
            :revealed="revealed"
            :wrong-inputs="wrongInputs"
            :hidden-atoms="sessionHiddenAtomIds"
          />
        </template>

        <KeyboardDock
          v-if="keyMapRows.length"
          :rows="keyMapRows"
          :show-backspace="true"
          :hidden-atom-ids="sessionHiddenAtomIds"
          :pressed="pressedKeys"
          @key="onDockKey"
          @backspace="onBackspace"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.training-page {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.training-config {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding: 22px 20px 32px;
}
.training-head {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}
.training-head h1 {
  margin: 2px 0 0;
  font-size: 28px;
  letter-spacing: -0.02em;
}
.training-sub {
  margin: 0;
  max-width: 720px;
  color: var(--ink-3);
  font-size: var(--text-sm);
  line-height: 1.7;
}
.training-scheme {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  color: var(--ink-3);
  font-size: 12px;
}
.scheme-select {
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--surface);
  color: var(--ink);
  font-size: 12px;
}
.training-tabs {
  display: flex;
  gap: 6px;
  margin: 14px 0 4px;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--surface-2);
}
.training-tab {
  height: 32px;
  padding: 0 18px;
  border-radius: var(--r-md);
  color: var(--ink-3);
  font-size: 12px;
  font-weight: 600;
}
.training-tab.is-active {
  color: var(--brand-ink);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}
.training-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 16px;
}
.training-mode {
  display: inline-flex;
  align-self: flex-start;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface-2);
}
.mode-btn {
  min-width: 56px;
  height: 28px;
  border-radius: var(--r-sm);
  color: var(--ink-3);
  font-size: 12px;
  font-weight: 650;
}
.mode-btn.is-active {
  color: var(--brand-ink);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}
.chip-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--line-faint);
  border-radius: var(--r-lg);
  background: var(--surface);
}
.chip-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.chip-head strong {
  font-size: 12px;
  color: var(--ink-2);
}
.chip-count {
  color: var(--ink-3);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}
.chip-actions {
  display: flex;
  gap: 2px;
  margin-left: auto;
}
.chip-actions button {
  padding: 3px 7px;
  border-radius: var(--r-sm);
  color: var(--ink-3);
  font-size: 10.5px;
}
.chip-actions button:hover {
  color: var(--brand-ink);
  background: var(--brand-soft);
}
.chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  min-width: 34px;
  height: 28px;
  padding: 0 9px;
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  background: var(--surface);
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
}
.chip:hover {
  border-color: var(--brand);
}
.chip.is-selected {
  border-color: var(--brand-soft-2);
  background: var(--brand-soft);
  color: var(--brand-ink);
}
.chip.is-special {
  font-family: var(--font-ui);
  font-size: 11px;
}
.training-preview {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  padding: 10px 14px;
  border: 1px solid var(--line-faint);
  border-radius: var(--r-lg);
  background: color-mix(in srgb, var(--surface-2) 70%, transparent);
}
.preview-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 10px;
}
.preview-head strong {
  font-size: 12px;
  color: var(--ink-2);
}
.preview-sample {
  min-width: 0;
  overflow: hidden;
  color: var(--ink-3);
  font-size: 11px;
  line-height: 1.55;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview-warning {
  margin: 6px 0 0;
  color: var(--danger);
  font-size: 11px;
}
.training-state {
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--surface);
  color: var(--ink-3);
  font-size: 12px;
}
.training-state.is-error {
  border-color: var(--danger-line);
  color: var(--danger);
}
.training-state p {
  margin: 4px 0 0;
}
.article-input {
  width: 100%;
  min-height: 168px;
  resize: vertical;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--surface);
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: 13px;
  line-height: 1.75;
}
.article-input:focus {
  outline: none;
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-soft);
}
.article-drop {
  flex: 1;
  min-height: 180px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 20px;
  border: 1.5px dashed var(--line-strong);
  border-radius: var(--r-lg);
  background: color-mix(in srgb, var(--surface-2) 55%, transparent);
  color: var(--ink-3);
  text-align: center;
  cursor: pointer;
  transition: border-color 120ms, background 120ms;
}
.article-drop:hover,
.article-drop.is-drag {
  border-color: var(--brand);
  background: var(--brand-soft);
}
.article-drop-icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--brand-ink);
  font-size: 18px;
  font-weight: 700;
}
.article-drop strong {
  color: var(--ink-2);
  font-size: 12.5px;
  font-weight: 700;
}
.article-drop-meta {
  max-width: 300px;
  color: var(--ink-4);
  font-size: 10.5px;
  line-height: 1.55;
}
.article-meta {
  color: var(--ink-3);
  font-size: 11px;
}
.article-notes {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  color: var(--ink-3);
  font-size: 11px;
  line-height: 1.6;
}
.training-session {
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding: 12px 20px 0;
  display: flex;
  flex-direction: column;
}
.training-toolbar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  max-width: 860px;
  width: 100%;
  height: 48px;
  margin: 0 auto 8px;
  padding: 7px 10px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}
.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.toolbar-left {
  flex: 1;
}
.toolbar-right {
  flex: none;
}
.toolbar-divider {
  width: 1px;
  height: 16px;
  margin: 0 4px;
  flex: none;
  background: var(--line);
}
.training-exit {
  flex: none;
  height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 8px 0 5px;
  border-radius: var(--r-sm);
  color: var(--ink-3);
  font-size: 11px;
  font-weight: 600;
}
.training-exit .icon {
  width: 14px;
  height: 14px;
}
.training-exit:hover {
  color: var(--ink);
  background: var(--surface-2);
}
.training-title {
  font-size: 12px;
  font-weight: 650;
  color: var(--ink-2);
  white-space: nowrap;
}
.training-stat {
  flex: none;
  color: var(--ink-3);
  font-size: 10px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.speed-readout {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  color: var(--ink-3);
  font-size: 10px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.speed-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--success);
}
.training-stat.is-primary,
.speed-readout.is-primary {
  color: var(--ink);
  font-size: 13px;
  font-weight: 780;
  letter-spacing: -0.01em;
}
.article-summary-wrap {
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
  overflow-y: auto;
  display: flex;
  align-items: flex-start;
  justify-content: center;
}
.article-summary-wrap > * {
  max-width: 860px;
}
.stream-shell {
  flex: 1;
  min-height: 0;
}
@media (max-width: 640px) {
  .training-config {
    padding: 16px 14px 28px;
  }
  .training-head h1 {
    font-size: 22px;
  }
  .training-session {
    padding: 8px 10px 0;
  }
  .training-toolbar {
    height: 44px;
    gap: 6px;
    padding: 5px 7px;
  }
  .training-title {
    display: none;
  }
  .training-stat,
  .speed-readout {
    font-size: 9.5px;
  }
  .training-stat.is-primary,
  .speed-readout.is-primary {
    font-size: 11.5px;
    font-weight: 720;
  }
  .training-tab {
    padding: 0 12px;
  }
  .chip-actions button {
    padding: 2px 5px;
  }
  .chip {
    height: 26px;
    min-width: 30px;
    padding: 0 7px;
  }
}

/* ── v15：统一卡片 + 固定底栏 + 两栏内部滚动 ─────────────── */
.training-page {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.training-config {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  width: 100%;
  max-width: 1160px;
  margin: 0 auto;
  padding: 22px 24px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.training-hero {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.training-hero h1 {
  margin: 0;
  font-size: 32px;
  letter-spacing: -0.025em;
}
.training-sub {
  margin: 4px 0 0;
  max-width: 780px;
  color: var(--ink-3);
  font-size: 13px;
  line-height: 1.7;
}
.training-controls {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px 18px;
  margin-top: 2px;
}
.training-controls-left {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 14px;
}
.training-controls .training-scheme {
  margin-top: 0;
}
.training-controls .training-tabs {
  margin: 0;
}
.training-scheme {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ink-3);
  font-size: 12px;
}
.scheme-select {
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--surface);
  color: var(--ink);
  font-size: 12px;
}
.training-tabs {
  display: flex;
  gap: 4px;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--surface-2);
}
.training-tab {
  height: 32px;
  padding: 0 18px;
  border-radius: var(--r-md);
  color: var(--ink-3);
  font-size: 12px;
  font-weight: 600;
}
.training-tab.is-active {
  color: var(--brand-ink);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}
.training-mode {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface-2);
}
.mode-btn {
  min-width: 50px;
  height: 26px;
  border-radius: var(--r-sm);
  color: var(--ink-3);
  font-size: 12px;
  font-weight: 650;
}
.mode-btn.is-active {
  color: var(--brand-ink);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}
.training-state {
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--surface);
  color: var(--ink-3);
  font-size: 12px;
}
.training-state.is-error {
  border-color: var(--danger-line);
  color: var(--danger);
}
.training-state p {
  margin: 4px 0 0;
}
.training-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin: 0;
}
.setup-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: minmax(0, 1fr);
  align-items: stretch;
  gap: 18px;
}
.chip {
  height: 30px;
  min-width: 36px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  background: var(--surface);
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
}
.chip:hover {
  border-color: var(--brand);
}
.chip.is-selected {
  border-color: var(--brand-soft-2);
  background: var(--brand-soft);
  color: var(--brand-ink);
}
.chip.is-special {
  font-family: var(--font-ui);
  font-size: 11px;
}
.chip.is-zero-chip {
  font-family: var(--font-ui);
  letter-spacing: 0.01em;
}
.setup-empty {
  margin: 0;
  padding: 14px 12px;
  border: 1px dashed var(--line);
  border-radius: var(--r-md);
  color: var(--ink-4);
  font-size: 11px;
  text-align: center;
}
.chip.is-hidden-chip {
  font-family: var(--font-mono);
}
.chip.is-hidden-chip.is-special {
  font-family: var(--font-ui);
}
.chip.is-hidden-chip.is-selected {
  border-color: var(--danger-line);
  background: var(--danger-soft);
  color: var(--danger);
}
.setup-actions {
  flex: none;
  height: 72px;
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 0 18px;
  border: 1px solid var(--line);
  border-radius: var(--r-xl);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}
.setup-bar-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.setup-bar-info strong {
  color: var(--ink);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.3;
}
.setup-bar-sub {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink-3);
  font-size: 11px;
  line-height: 1.4;
}
.setup-bar-sub.is-warning {
  color: var(--danger);
}
.setup-start {
  flex: none;
  height: 40px;
  padding: 0 20px;
  font-size: 13px;
}
.article-mode-switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex: none;
  padding: 3px;
  border-radius: var(--r-md);
  background: var(--surface-2);
  border: 1px solid var(--line);
}
.article-mode-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: calc(50% - 3px);
  height: calc(100% - 6px);
  border-radius: var(--r-sm);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  transition: transform 160ms var(--ease);
}
.article-mode-thumb.is-import {
  transform: translateX(100%);
}
.article-mode-btn {
  position: relative;
  z-index: 1;
  min-width: 56px;
  height: 26px;
  border-radius: var(--r-sm);
  color: var(--ink-3);
  font-size: 11.5px;
  font-weight: 650;
}
.article-mode-btn.is-active {
  color: var(--brand-ink);
}
.article-clear {
  margin-left: auto;
  padding: 4px 9px;
  border-radius: var(--r-sm);
  color: var(--ink-3);
  font-size: 11px;
}
.article-clear:hover {
  color: var(--danger);
  background: var(--danger-soft);
}
.article-input {
  flex: 1;
  width: 100%;
  min-height: 180px;
  resize: none;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--surface);
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: 13px;
  line-height: 1.75;
}
.article-input:focus {
  outline: none;
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-soft);
}
.article-drop {
  flex: 1;
  min-height: 180px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 20px;
  border: 1.5px dashed var(--line-strong);
  border-radius: var(--r-lg);
  background: color-mix(in srgb, var(--surface-2) 55%, transparent);
  color: var(--ink-3);
  text-align: center;
  cursor: pointer;
  transition: border-color 120ms, background 120ms;
}
.article-drop:hover,
.article-drop.is-drag {
  border-color: var(--brand);
  background: var(--brand-soft);
}
.article-drop-icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--brand-ink);
  font-size: 18px;
  font-weight: 700;
}
.article-drop strong {
  color: var(--ink-2);
  font-size: 12.5px;
  font-weight: 700;
}
.article-drop-meta {
  max-width: 300px;
  color: var(--ink-4);
  font-size: 10.5px;
  line-height: 1.55;
}
.article-notes {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--ink-3);
  font-size: 11px;
  line-height: 1.6;
}
@media (max-width: 980px) {
  .training-config {
    padding: 16px 14px 12px;
  }
  .training-hero h1 {
    font-size: 26px;
  }
  .training-sub {
    font-size: 12px;
  }
  .setup-grid {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    gap: 14px;
  }
  .setup-grid > .setup-card {
    height: auto;
    flex: none;
  }
  .setup-actions {
    height: auto;
    min-height: 64px;
    padding: 10px 14px;
    gap: 12px;
  }
  .setup-start {
    height: 38px;
    padding: 0 16px;
  }
}
@media (max-width: 640px) {
  .training-controls {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }
  .training-tabs {
    width: 100%;
  }
  .training-tab {
    flex: 1;
    padding: 0 10px;
  }
  .training-mode {
    order: 2;
  }
  .setup-actions {
    align-items: stretch;
    flex-direction: column;
    gap: 8px;
  }
  .setup-start {
    width: 100%;
  }
  .setup-bar-info {
    width: 100%;
  }
  .setup-bar-sub {
    white-space: normal;
    overflow: visible;
  }
}
</style>
