<script setup lang="ts">
/**
 * 练习场（/training）：专项词语练习（声母×韵母自由组合，无尽练习）
 * 与文章练习（粘贴/.txt 导入，core parseArticleText 断行，逐字练习 + 汇总）。
 *
 * 选择/焦点/隐藏/预设/持久化统一在 useTrainingSelection；判题交互在 useSessionRuntime；
 * 方案派生在 useSchemeView。本页只做模板编排、文章输入与快捷键。
 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import {
  atomId,
  filterTrainingEntries,
  parseArticleText,
  parseAtomId,
  type AtomId,
} from '@shuangpin/core'
import PracticeStream from '@/components/practice/PracticeStream.vue'
import SessionBar from '@/components/layout/SessionBar.vue'
import SchemeHero from '@/components/common/SchemeHero.vue'
import StateCard from '@/components/common/StateCard.vue'
import CardHeader from '@/components/common/CardHeader.vue'
import ArticleGrid from '@/components/training/ArticleGrid.vue'
import SetupCard from '@/components/training/SetupCard.vue'
import SetupGroup from '@/components/training/SetupGroup.vue'
import CommonCapsule from '@/components/training/CommonCapsule.vue'
import HiddenMappingGroups from '@/components/training/HiddenMappingGroups.vue'
import FocusMappingGroups from '@/components/training/FocusMappingGroups.vue'
import SelectionSummary from '@/components/training/SelectionSummary.vue'
import { useCourseStore } from '@/stores/course'
import { useLayoutStore, type DockContent } from '@/stores/layout'
import { useSoundStore } from '@/stores/sound'
import { useGlobalKeys, type KeyBinding } from '@/composables/useGlobalKeys'
import { useKeyInput } from '@/composables/useKeyInput'
import { useBottomDockContent } from '@/composables/useBottomDockContent'
import { useSchemeView } from '@/composables/useSchemeView'
import { useSessionRuntime } from '@/composables/useSessionRuntime'
import SessionSummaryCard from '@/components/practice/SessionSummaryCard.vue'
import SessionPauseOverlay from '@/components/practice/SessionPauseOverlay.vue'
import { useTrainingSelection } from '@/composables/useTrainingSelection'
import { isInteractiveTarget, focusElement } from '@/lib/dom'
import type { MappingTogglePayload } from '@/lib/keyboardView'
import { loadLexicon, type LexiconFile } from '@/lib/data'
import { buildSessionSummary, type SessionSummary } from '@/lib/sessionSummary'
import { buildTrainingBatch } from '@shuangpin/core'
import { buildArticlePractice, type ArticlePractice } from '@/lib/article'

type SessionKind = 'drill' | 'article' | null

const course = useCourseStore()
const layout = useLayoutStore()
const sound = useSoundStore()
const schemeView = useSchemeView()
const { engine } = schemeView
const selection = useTrainingSelection()
const trainer = useSessionRuntime()

const {
  session,
  revealed,
  wrongInputs,
  completedWords,
  accuracy,
  hasStarted,
  inError,
  cpm,
  paused,
  start: startSession,
  reset: resetSession,
  togglePause,
  apply,
  backspace: sessionBackspace,
  clearInput,
} = trainer
const liveMessage = trainer.liveMessage

// ── 选择与隐藏（全部来自 useTrainingSelection） ───────────────

const {
  tab,
  articleInputMode,
  atomOptions,
  scope,
  passedLessonCount,
  selectedInitials,
  selectedFinals,
  selectedZeroFinals,
  focusAtomIds,
  selectableInitials,
  selectableFinals,
  selectableZeroFinals,
  appearInitialGroup,
  appearFinalGroup,
  appearZeroGroup,
  commonAllChecked,
  commonEntriesFor,
  commonCapsuleCount,
  toggleCommonAll,
  toggleInitial,
  toggleFinal,
  toggleZeroFinal,
  selectAll,
  selectGroup,
  clearGroup,
  toggleAppearAll,
  selectLearnedAtoms,
  learnedApplied,
  clearAppear,
  hiddenInitials,
  hiddenFinals,
  hiddenZeroFinals,
  articleHiddenInitials,
  articleHiddenFinals,
  articleHiddenZeroFinals,
  hiddenCandidatesOf,
  hiddenGroupAllChecked,
  hiddenGroupPartial,
  hiddenGroupSelected,
  hiddenGroupTotal,
  hiddenGroupDisabled,
  toggleHidden,
  toggleHiddenZeroFinal,
  toggleHiddenAll,
  hiddenSnapshotOf,
} = selection

const appearInitialAll = computed(() => appearInitialGroup.value.all)
const appearInitialPartial = computed(() => appearInitialGroup.value.indeterminate)
const appearInitialSelectedCount = computed(() => appearInitialGroup.value.selected)
const appearInitialTotalCount = computed(() => appearInitialGroup.value.total)
const appearFinalAll = computed(() => appearFinalGroup.value.all)
const appearFinalPartial = computed(() => appearFinalGroup.value.indeterminate)
const appearFinalSelectedCount = computed(() => appearFinalGroup.value.selected)
const appearFinalTotalCount = computed(() => appearFinalGroup.value.total)
const appearZeroAll = computed(() => appearZeroGroup.value.all)
const appearZeroPartial = computed(() => appearZeroGroup.value.indeterminate)
const appearZeroSelectedCount = computed(() => appearZeroGroup.value.selected)
const appearZeroTotalCount = computed(() => appearZeroGroup.value.total)
const appearSelectedCount = computed(
  () =>
    appearInitialSelectedCount.value +
    appearFinalSelectedCount.value +
    appearZeroSelectedCount.value,
)

const drillHiddenCandidates = computed(() => hiddenCandidatesOf('drill'))
const articleHiddenCandidates = computed(() => hiddenCandidatesOf('article'))
const drillHiddenInitialCandidates = computed(() => drillHiddenCandidates.value.initials)
const drillHiddenFinalCandidates = computed(() => drillHiddenCandidates.value.finals)
const drillHiddenZeroCandidates = computed(() => drillHiddenCandidates.value.zeroFinals)
const articleHiddenInitialCandidates = computed(() => articleHiddenCandidates.value.initials)
const articleHiddenFinalCandidates = computed(() => articleHiddenCandidates.value.finals)
const articleHiddenZeroCandidates = computed(() => articleHiddenCandidates.value.zeroFinals)

// ── 方案切换 ─────────────────────────────────────────────────

const schemeOptions = computed(() => course.allSchemeOptions)
const primarySchemeIds = computed(() => course.primarySchemeIds)
const primarySchemeOptions = computed(() => course.schemeOptions)
const schemeBusy = ref(false)
const schemeError = ref('')
const schemeRetryId = ref('')
const failedSchemeName = computed(
  () =>
    course.allSchemeOptions.find((option) => option.id === schemeRetryId.value)?.name ??
    schemeRetryId.value,
)
const courseLoading = computed(
  () => !course.scheme && (course.status === 'loading' || course.status === 'idle'),
)
const courseFailed = computed(() => !course.scheme && course.status === 'error')

async function chooseScheme(id: string): Promise<void> {
  if (id === course.schemeId || schemeBusy.value) return
  sound.playKey()
  schemeBusy.value = true
  schemeError.value = ''
  try {
    await course.selectScheme(id)
  } finally {
    schemeBusy.value = false
  }
  if (course.status === 'error') {
    schemeError.value = course.error || '方案加载失败'
    schemeRetryId.value = id
  }
}

function retryScheme(): void {
  const id = schemeRetryId.value
  if (!id || schemeBusy.value) return
  schemeError.value = ''
  void chooseScheme(id)
}

async function retryCourse(): Promise<void> {
  await course.init()
}

// ── 词库 ─────────────────────────────────────────────────────

const lexicon = shallowRef<LexiconFile | null>(null)
const bankStatus = ref<'loading' | 'ready' | 'error'>('loading')
const bankError = ref('')

async function loadBank(): Promise<void> {
  bankStatus.value = 'loading'
  bankError.value = ''
  try {
    lexicon.value = await loadLexicon()
    bankStatus.value = 'ready'
  } catch (cause) {
    bankStatus.value = 'error'
    bankError.value = cause instanceof Error ? cause.message : String(cause)
  }
}

const availableEntries = computed(() =>
  lexicon.value
    ? filterTrainingEntries(lexicon.value.words, scope.value, focusAtomIds.value)
    : [],
)
const availableCount = computed(() => availableEntries.value.length)
const canStartDrill = computed(
  () => bankStatus.value === 'ready' && Boolean(engine.value) && availableCount.value > 0,
)

function makeDrillBatch() {
  const schemeEngine = engine.value
  if (!schemeEngine) return []
  return buildTrainingBatch(schemeEngine, availableEntries.value, 10)
}

// ── 会话 ─────────────────────────────────────────────────────

const kind = ref<SessionKind>(null)
const playing = computed(() => kind.value !== null && session.value !== null)
const endedSummary = ref<SessionSummary | null>(null)
const ended = computed(() => endedSummary.value !== null)
const pausedSummary = computed<SessionSummary | null>(() => {
  if (!paused.value || ended.value || !session.value) return null
  return buildSessionSummary(session.value, performance.now())
})

function endPractice(): void {
  const state = session.value
  if (!playing.value || !state || state.phase === 'finished') return
  endedSummary.value = buildSessionSummary(state, performance.now())
  if (!paused.value) togglePause()
}

const sessionHiddenAtomIds = shallowRef<readonly AtomId[]>([])
const sessionHiddenCount = computed(() => sessionHiddenAtomIds.value.length)
const sessionHiddenTitle = ref('')

function freezeHidden(scopeName: 'drill' | 'article'): void {
  const snapshot = hiddenSnapshotOf(scopeName)
  sessionHiddenAtomIds.value = snapshot.atomIds
  sessionHiddenTitle.value = snapshot.title
}

function startDrill(): void {
  if (!canStartDrill.value) return
  freezeHidden('drill')
  if (!startSession(makeDrillBatch(), { extend: makeDrillBatch })) return
  kind.value = 'drill'
}

function startArticle(): void {
  const schemeEngine = engine.value
  const practice = articlePractice.value
  if (!schemeEngine || !practice || !canStartArticle.value) return
  freezeHidden('article')
  if (!startSession(practice.words)) return
  kind.value = 'article'
}

const sessionTitle = computed(() => (kind.value === 'article' ? '文章练习' : '专项练习 · 词语'))
watch(
  [playing, sessionTitle],
  () => layout.setStageLabel(playing.value ? sessionTitle.value : ''),
  { immediate: true },
)
onBeforeUnmount(() => {
  layout.clearStageLabel()
})

const countUnit = computed(() => (kind.value === 'article' ? '字' : '词'))
const accuracyPercent = computed(() => Math.round(accuracy.value * 100))
const liveSpeed = computed(() => Math.round(cpm.value))

function exitSession(): void {
  endedSummary.value = null
  resetSession()
  kind.value = null
}

function restartSession(): void {
  endedSummary.value = null
  if (kind.value === 'drill') startDrill()
  else if (kind.value === 'article') startArticle()
}

function onLetter(raw: string): void {
  if (!playing.value) return
  const feedback = apply(raw)
  if (feedback?.kind === 'wrong') sound.playError()
  else if (feedback?.kind === 'word-complete') sound.playComplete()
  else sound.playKey()
}
function onBackspace(): void {
  if (!playing.value) return
  sound.playKey()
  sessionBackspace()
}
function onClearInput(): void {
  if (!playing.value) return
  sound.playKey()
  clearInput()
}
useKeyInput((input) => {
  // 配置页只让键位图/键帽响应；开始练习后才把输入送入判题。
  if (!playing.value || paused.value) {
    if (!paused.value) sound.playKey()
    return
  }
  if (input.type === 'backspace') onBackspace()
  else onLetter(input.key)
})

/**
 * 出现范围 → 键位图的高亮原子：与课程 focus 同一套强调规则，
 * 选择范围变化时底栏键位图实时联动。
 */
const appearHighlightAtomIds = computed<AtomId[]>(() => [
  ...[...selectedInitials.value].map((key) => atomId('initial', key)),
  ...[...selectedFinals.value].map((key) => atomId('final', key)),
  ...[...selectedZeroFinals.value].map((key) => atomId('zero', key)),
])

/** 键位图映射点击：只切换声母 / 韵母 / 零声母的「出现范围」选择。 */
function onMappingToggle(payload: MappingTogglePayload): void {
  const ref = parseAtomId(payload.atomId)
  if (!ref) return
  sound.playKey()
  if (ref.type === 'initial') toggleInitial(ref.key)
  else if (ref.type === 'final') toggleFinal(ref.key)
  else toggleZeroFinal(ref.key)
}

const dockContent = computed<DockContent>(() => ({
  ...schemeView.baseDockContent.value,
  schemeName: course.scheme?.name,
  highlightAtomIds: appearHighlightAtomIds.value,
  hiddenAtomIds: playing.value ? sessionHiddenAtomIds.value : [],
  // 练习会话一旦设置了隐藏项，就和课程考核阶段一样收起整层映射提示。
  conceal: playing.value && sessionHiddenAtomIds.value.length > 0,
  // 配置页允许直接点击键位图上的映射来调整范围；练习进行中冻结。
  interactiveMappings: !playing.value,
  onMappingToggle,
}))
useBottomDockContent(() => dockContent.value)

// ── 文章 ─────────────────────────────────────────────────────

const articleText = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const parsed = computed(() => (articleText.value.trim() ? parseArticleText(articleText.value) : null))
const articlePractice = ref<ArticlePractice | null>(null)
const articleAnalyzing = ref(false)
const articlePlan = computed(() => articlePractice.value?.plan ?? null)
const articleMappedCount = computed(() => {
  const plan = articlePlan.value
  return plan ? plan.chars.length - plan.skipped : 0
})
const articleSkippedCount = computed(() => articlePlan.value?.skipped ?? 0)
const canStartArticle = computed(
  () => Boolean(engine.value) && !articleAnalyzing.value && (articlePractice.value?.words.length ?? 0) > 0,
)

let articleSequence = 0
let articleAnalyzeTimer: number | undefined
watch(
  [articleText, engine],
  ([text, schemeEngine]) => {
    const sequence = ++articleSequence
    if (articleAnalyzeTimer !== undefined) window.clearTimeout(articleAnalyzeTimer)
    if (!text.trim() || !schemeEngine) {
      articlePractice.value = null
      articleAnalyzing.value = false
      return
    }
    articleAnalyzing.value = true
    articleAnalyzeTimer = window.setTimeout(async () => {
      try {
        const practice = await buildArticlePractice(schemeEngine, text)
        if (sequence === articleSequence) articlePractice.value = practice
      } catch {
        if (sequence === articleSequence) articlePractice.value = null
      } finally {
        if (sequence === articleSequence) articleAnalyzing.value = false
      }
    }, 120)
  },
  { immediate: true },
)
const articleDone = computed(() => kind.value === 'article' && session.value?.phase === 'finished')
watch(articleDone, (done) => {
  if (done) sound.playComplete()
})

const articleSummary = computed(() => {
  const state = session.value
  if (kind.value !== 'article' || !state) return null
  return buildSessionSummary(state, performance.now())
})

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

function switchTab(next: 'drill' | 'article'): void {
  if (playing.value) exitSession()
  tab.value = next
}

// ── 快捷键（唯一入口） ────────────────────────────────────────

function focusOtherScheme(): void {
  focusElement(document.querySelector('.scheme-more select'))
}

const bindings = computed<KeyBinding[]>(() => {
  if (!playing.value) {
    return [
      {
        key: 'Enter',
        when: (event) =>
          !isInteractiveTarget(event.target) &&
          (tab.value === 'drill' ? canStartDrill.value : canStartArticle.value),
        run: () => {
          if (tab.value === 'drill') startDrill()
          else startArticle()
        },
      },
      { key: 'd', alt: true, run: () => switchTab('drill') },
      { key: 'a', alt: true, run: () => switchTab('article') },
      ...primarySchemeOptions.value.map((option, index) => ({
        key: String(index + 1),
        alt: true,
        run: () => void chooseScheme(option.id),
      })),
      { key: '6', alt: true, run: () => focusOtherScheme() },
    ]
  }
  return [
    { key: ' ', shift: true, when: () => playing.value, run: togglePause },
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
    { key: 'e', alt: true, when: () => !ended.value, run: () => endPractice() },
    { key: 'r', alt: true, run: () => restartSession() },
  ]
})
useGlobalKeys(bindings)

onMounted(async () => {
  await course.init()
  await loadBank()
})
</script>

<template>
  <div class="training-page">
    <template v-if="!playing">
      <div class="training-config">
        <SchemeHero
          class="training-brand"
          eyebrow="PRACTICE GROUND"
          :title-lines="['练习场']"
          keycap-text="练习场"
          :scheme-options="schemeOptions"
          :primary-scheme-ids="primarySchemeIds"
          :scheme-id="course.schemeId"
          :scheme="course.scheme"
          :busy="schemeBusy"
          single-row
          :show-selector="schemeOptions.length > 1"
          @change-scheme="chooseScheme"
        />

        <aside class="training-side panel">
          <CardHeader title="练习设置">
            <span class="count-badge">{{ tab === 'drill' ? '专项 · 无尽练习' : '文章 · 逐字练习' }}</span>
          </CardHeader>
          <div class="side-controls">
            <div class="side-controls-row">
              <div class="segmented training-tabs" role="group" aria-label="练习类型">
                <button
                  type="button"
                  role="button"
                  :aria-pressed="tab === 'drill'"
                  class="segmented-btn"
                  :class="{ 'is-active': tab === 'drill' }"
                  aria-keyshortcuts="Alt+D"
                  @click="switchTab('drill')"
                >
                  专项练习
                  <kbd>Alt+D</kbd>
                </button>
                <button
                  type="button"
                  role="button"
                  :aria-pressed="tab === 'article'"
                  class="segmented-btn"
                  :class="{ 'is-active': tab === 'article' }"
                  aria-keyshortcuts="Alt+A"
                  @click="switchTab('article')"
                >
                  文章练习
                  <kbd>Alt+A</kbd>
                </button>
              </div>

              <div v-if="tab === 'drill'" class="learned-block">
                <span class="learned-progress">当前进度 {{ passedLessonCount }}/{{ course.lessons.length }} 课</span>
                <button
                  type="button"
                  class="meta-btn learned-button"
                  :class="{ 'is-applied': learnedApplied }"
                  :disabled="passedLessonCount === 0 || learnedApplied"
                  :title="
                    learnedApplied
                      ? '当前出现范围已经是已学范围'
                      : '选中全部全拼沿用及已学完课程覆盖的声母、韵母与零声母'
                  "
                  @click="selectLearnedAtoms"
                >
                  已学
                </button>
              </div>
            </div>
          </div>

          <div v-if="schemeError" class="side-error" role="alert">
            <span>「{{ failedSchemeName }}」加载失败：{{ schemeError }}</span>
            <button class="meta-btn" type="button" @click="retryScheme">重试</button>
          </div>

          <div class="side-start">
            <div class="side-info">
              <template v-if="courseFailed">
                <strong>课程数据加载失败</strong>
                <span class="side-info-sub is-warning">请重试加载课程数据。</span>
              </template>
              <template v-else-if="courseLoading">
                <strong>正在加载课程数据…</strong>
              </template>
              <template v-else-if="bankStatus === 'loading'">
                <strong>正在加载练习字库…</strong>
              </template>
              <template v-else-if="bankStatus === 'error'">
                <strong>练习字库加载失败</strong>
                <span class="side-info-sub is-warning">请重试加载练习字库。</span>
              </template>
              <template v-else-if="tab === 'drill'">
                <strong>可用词 {{ availableCount }} 条</strong>
                <span v-if="availableCount === 0" class="side-info-sub is-warning">当前出现 / 焦点选择下没有匹配的词，请调整选择。</span>
              </template>
              <template v-else>
                <strong v-if="articleAnalyzing">正在分析拼音…</strong>
                <strong v-else-if="parsed">将练习 {{ articleMappedCount }} 字 · 跳过 {{ articleSkippedCount }} 字</strong>
                <strong v-else>等待输入文章…</strong>
              </template>
            </div>
            <button
              class="btn btn--primary setup-start"
              type="button"
              :disabled="tab === 'drill' ? !canStartDrill : !canStartArticle"
              @click="tab === 'drill' ? startDrill() : startArticle()"
            >
              开始练习
              <kbd>Enter</kbd>
            </button>
          </div>
        </aside>

        <StateCard
          v-if="courseFailed"
          variant="error"
          title="课程数据加载失败"
          :message="course.error || '无法加载课程数据，请重试。'"
          class="training-state--wide"
        >
          <button class="btn btn--sm" type="button" @click="retryCourse">重试</button>
        </StateCard>

        <StateCard
          v-else-if="courseLoading"
          variant="inline"
          message="正在加载课程数据…"
          class="training-state--wide"
        />

        <StateCard
          v-else-if="bankStatus === 'error'"
          variant="error"
          title="练习字库加载失败"
          :message="bankError"
          class="training-state--wide"
        >
          <button class="btn btn--sm" type="button" @click="loadBank">重试</button>
        </StateCard>

        <!-- 专项练习 -->
        <section v-else-if="tab === 'drill'" :key="tab" class="training-panel">
          <div class="setup-grid setup-grid--focus">
            <SetupCard pill="出现" tone="appear" subtitle="本局练习范围">
              <template #head-extra>
                <SelectionSummary
                  :count="appearSelectedCount"
                  :disabled="appearSelectedCount === 0"
                  clear-title="清空出现范围"
                  @clear="clearAppear"
                />
              </template>
              <StateCard v-if="bankStatus === 'loading'" variant="inline" message="正在加载练习字库…" />
              <template v-else-if="atomOptions">
                <SetupGroup
                  title="声母"
                  :all-checked="appearInitialAll"
                  :indeterminate="appearInitialPartial"
                  @toggle-all="toggleAppearAll('initial')"
                >
                  <template #count>
                    已选 {{ appearInitialSelectedCount }}/{{ appearInitialTotalCount }}
                  </template>
                  <CommonCapsule
                    v-if="commonEntriesFor('appear', 'initial').length > 0"
                    :selected="commonAllChecked('appear', 'initial')"
                    @toggle="toggleCommonAll('appear', 'initial')"
                  />
                  <button
                    v-for="initial in selectableInitials"
                    :key="initial"
                    type="button"
                    class="chip"
                    :class="{ 'is-selected': selectedInitials.has(initial) }"
                    :aria-pressed="selectedInitials.has(initial)"
                    @click="toggleInitial(initial)"
                  >
                    {{ initial }}
                  </button>
                </SetupGroup>

                <SetupGroup
                  title="韵母"
                  :all-checked="appearFinalAll"
                  :indeterminate="appearFinalPartial"
                  @toggle-all="toggleAppearAll('final')"
                >
                  <template #count>
                    已选 {{ appearFinalSelectedCount }}/{{ appearFinalTotalCount }}
                  </template>
                  <CommonCapsule
                    v-if="commonEntriesFor('appear', 'final').length > 0"
                    :selected="commonAllChecked('appear', 'final')"
                    @toggle="toggleCommonAll('appear', 'final')"
                  />
                  <button
                    v-for="final in selectableFinals"
                    :key="final"
                    type="button"
                    class="chip"
                    :class="{ 'is-selected': selectedFinals.has(final) }"
                    :aria-pressed="selectedFinals.has(final)"
                    @click="toggleFinal(final)"
                  >
                    {{ final }}
                  </button>
                </SetupGroup>

                <SetupGroup
                  v-if="appearZeroTotalCount > 0 || commonCapsuleCount('appear', 'zero') > 0"
                  title="零声母"
                  :all-checked="appearZeroAll"
                  :indeterminate="appearZeroPartial"
                  @toggle-all="toggleAppearAll('zero')"
                >
                  <template #count>
                    已选 {{ appearZeroSelectedCount }}/{{ appearZeroTotalCount }}
                  </template>
                  <CommonCapsule
                    v-if="commonEntriesFor('appear', 'zero').length > 0"
                    :selected="commonAllChecked('appear', 'zero')"
                    @toggle="toggleCommonAll('appear', 'zero')"
                  />
                  <button
                    v-for="zero in selectableZeroFinals"
                    :key="`zero-${zero}`"
                    type="button"
                    class="chip is-special is-zero-chip"
                    :class="{ 'is-selected': selectedZeroFinals.has(zero) }"
                    :aria-pressed="selectedZeroFinals.has(zero)"
                    @click="toggleZeroFinal(zero)"
                  >
                    零 {{ zero }}
                  </button>
                </SetupGroup>
              </template>
            </SetupCard>

            <FocusMappingGroups :selection="selection" />

            <HiddenMappingGroups scope="drill" :selection="selection" />
          </div>
        </section>

        <!-- 文章练习 -->
        <section v-else :key="tab" class="training-panel">
          <div class="setup-grid">
            <SetupCard tone="input">
              <template #head>
                <div class="segmented segmented--sm" role="group" aria-label="文章输入方式">
                  <button
                    type="button"
                    role="button"
                    :aria-pressed="articleInputMode === 'input'"
                    class="segmented-btn"
                    :class="{ 'is-active': articleInputMode === 'input' }"
                    @click="articleInputMode = 'input'"
                  >
                    输入
                  </button>
                  <button
                    type="button"
                    role="button"
                    :aria-pressed="articleInputMode === 'import'"
                    class="segmented-btn"
                    :class="{ 'is-active': articleInputMode === 'import' }"
                    @click="articleInputMode = 'import'"
                  >
                    导入
                  </button>
                </div>
                <span class="article-head-sub">
                  {{ parsed ? `${parsed.chars.length} 个汉字 · ${parsed.lines.length} 行` : '粘贴文章或导入 .txt' }}
                </span>
                <button
                  v-if="articleText"
                  class="meta-btn article-clear"
                  type="button"
                  @click="clearArticle"
                >
                  清空
                </button>
              </template>

              <StateCard v-if="bankStatus === 'loading'" variant="inline" message="正在加载练习字库…" />
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
                  @keydown.space.prevent="fileInput?.click()"
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

            <HiddenMappingGroups scope="article" :selection="selection" />
          </div>
        </section>
      </div>

    </template>

    <!-- 练习会话 -->
    <template v-else>
      <div class="training-session">
        <SessionBar :pausable="!ended" :paused="paused" @toggle-pause="togglePause">
          <template #left>
            <button class="session-btn" type="button" aria-keyshortcuts="Escape" @click="exitSession">
              <svg class="icon session-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19.5 12h-15" /><path d="m10.5 6-6 6 6 6" />
              </svg>
              退出
              <kbd>Esc</kbd>
            </button>
          </template>

          <span class="session-item">{{ completedWords }}</span>
          <span class="session-sep" aria-hidden="true">·</span>
          <span v-if="hasStarted" class="session-item">正确率 {{ accuracyPercent }}%</span>
          <span v-else class="session-item">正确率 --%</span>
          <template v-if="sessionHiddenCount">
            <span class="session-sep" aria-hidden="true">·</span>
            <span class="session-item session-danger" :title="sessionHiddenTitle" role="status">
              隐藏 {{ sessionHiddenCount }} 项
            </span>
          </template>
          <span class="session-sep" aria-hidden="true">·</span>
          <span v-if="hasStarted" class="session-item session-speed">速度 {{ liveSpeed }} WPM</span>
          <span v-else class="session-item">速度 -- WPM</span>

          <template #right>
            <button class="session-btn" type="button" aria-keyshortcuts="Alt+R" @click="restartSession">
              重新开始
              <kbd>Alt+R</kbd>
            </button>
            <button
              class="session-btn"
              type="button"
              aria-keyshortcuts="Alt+E"
              :disabled="ended || !session || session.phase === 'finished'"
              @click="endPractice"
            >
              结束练习
              <kbd>Alt+E</kbd>
            </button>
          </template>
        </SessionBar>

        <div class="session-stage">
          <template v-if="kind === 'drill' && session">
            <PracticeStream
              :session="session"
              :live-message="liveMessage"
              mode="list"
              :tier="1"
              :wrong-inputs="wrongInputs"
              :revealed="revealed"
              :hidden-atoms="sessionHiddenAtomIds"
              :end="ended"
            >
              <template v-if="ended && endedSummary" #end>
                <SessionSummaryCard mode="end" :summary="endedSummary">
                  <template #actions>
                    <button class="btn btn--primary" type="button" aria-keyshortcuts="Alt+R" @click="restartSession">
                      再来一次
                      <kbd>Alt+R</kbd>
                    </button>
                    <button class="btn" type="button" aria-keyshortcuts="Escape" @click="exitSession">
                      返回练习场
                      <kbd>Esc</kbd>
                    </button>
                  </template>
                </SessionSummaryCard>
              </template>
            </PracticeStream>
          </template>

          <template v-else-if="kind === 'article' && session && articlePlan">
            <ArticleGrid
              :plan="articlePlan"
              :session="session"
              :revealed="revealed"
              :wrong-inputs="wrongInputs"
              :hidden-atoms="sessionHiddenAtomIds"
              :end="Boolean(articleDone || ended)"
            >
              <template #end>
                <SessionSummaryCard
                  v-if="ended && endedSummary"
                  mode="end"
                  :summary="endedSummary"
                >
                  <template #actions>
                    <button class="btn btn--primary" type="button" aria-keyshortcuts="Alt+R" @click="restartSession">
                      再来一次
                      <kbd>Alt+R</kbd>
                    </button>
                    <button class="btn" type="button" aria-keyshortcuts="Escape" @click="exitSession">
                      返回练习场
                      <kbd>Esc</kbd>
                    </button>
                  </template>
                </SessionSummaryCard>
                <SessionSummaryCard
                  v-else-if="articleDone && articleSummary"
                  mode="end"
                  :summary="articleSummary"
                  :title="`完成 ${articleSummary.completedWords} 字`"
                >
                  <template #actions>
                    <button class="btn btn--primary" type="button" aria-keyshortcuts="Alt+R" @click="replayArticle">
                      再来一遍
                      <kbd>Alt+R</kbd>
                    </button>
                    <button class="btn" type="button" aria-keyshortcuts="Escape" @click="changeArticle">
                      换文章
                      <kbd>Esc</kbd>
                    </button>
                  </template>
                </SessionSummaryCard>
              </template>
            </ArticleGrid>
          </template>

          <SessionPauseOverlay
            :show="Boolean(session && paused && !ended && !articleDone && pausedSummary)"
            label="练习暂停"
          >
            <SessionSummaryCard
              v-if="paused && pausedSummary"
              mode="pause"
              :summary="pausedSummary"
            >
              <template #actions>
                <button class="btn btn--primary" type="button" aria-keyshortcuts="Shift+Space" @click="togglePause">
                  继续练习
                  <kbd>Shift+Space</kbd>
                </button>
                <button class="btn" type="button" aria-keyshortcuts="Alt+E" @click="endPractice">
                  结束练习
                  <kbd>Alt+E</kbd>
                </button>
              </template>
            </SessionSummaryCard>
          </SessionPauseOverlay>
        </div>
      </div>

    </template>
  </div>
</template>

<style scoped>
/* ── 页面骨架：桌面固定高度、卡内滚动；移动端单一滚动容器 ───── */
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
  max-width: var(--page-max);
  margin: 0 auto;
  padding: var(--page-top-gap) var(--page-pad-x) 16px;
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(390px, 0.95fr);
  grid-template-rows: auto minmax(0, 1fr);
  gap: 16px;
}

/* ── 左上：课程式品牌区（共用 HeroLayout） ────────────────── */
.training-brand {
  grid-column: 1;
  grid-row: 1;
  min-width: 0;
}

/* ── 右上：练习设置 + 开始 ───────────────────────────────── */
.training-side :deep(.card-header) {
  height: 42px;
  /* 保持标题在 58px 卡头里的原始垂直位置，只把标题下方的空白收紧。 */
  padding-top: 16px;
}
.training-side {
  grid-column: 2;
  grid-row: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 20px 18px;
}
.side-controls {
  min-width: 0;
}
.side-controls-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}
.learned-block {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin-left: auto;
}
.learned-progress {
  min-width: 0;
  overflow: hidden;
  color: var(--ink-4);
  font-size: var(--text-xs);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.learned-button.is-applied:disabled {
  background: var(--surface-3);
  color: var(--ink-4);
  opacity: 1;
}
.side-start {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.side-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.side-info strong {
  color: var(--ink);
  font-size: var(--text-base);
  font-weight: 700;
  line-height: 1.4;
}
.side-info-sub {
  min-width: 0;
  overflow: hidden;
  color: var(--ink-3);
  font-size: var(--text-xs);
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.side-info-sub.is-warning {
  color: var(--danger);
}
.side-start .setup-start {
  width: 100%;
  min-height: 40px;
  justify-content: center;
}
/* 方案切换/预览失败：内置在设置卡里的小型可重试提示。 */
.side-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--danger-line);
  border-radius: var(--r-control);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: var(--text-xs);
  line-height: 1.5;
}
.side-error span {
  flex: 1;
  min-width: 0;
}

/* ── 下排：出现 / 隐藏两张范围卡 ─────────────────────────── */
.training-panel {
  grid-column: 1 / -1;
  grid-row: 2;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0;
  animation: ui-fade-up var(--dur-mid) var(--ease);
}
.training-state--wide {
  grid-column: 1 / -1;
  grid-row: 2;
  margin: 0;
}
.setup-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: minmax(0, 1fr);
  align-items: stretch;
  gap: 16px;
}
.setup-grid--focus {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.setup-start {
  flex: none;
}

/* ── 文章练习 ───────────────────────────────────────────── */
.article-head-sub {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--ink-4);
  font-size: var(--text-xs);
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.article-clear {
  flex: none;
  margin-left: auto;
}
.article-input {
  flex: 1;
  width: 100%;
  min-height: 180px;
  resize: none;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: var(--r-card);
  background: color-mix(in srgb, var(--surface-2) 55%, var(--surface));
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: var(--text-base);
  line-height: 1.75;
  transition: border-color var(--dur-fast), box-shadow var(--dur-fast), background var(--dur-fast);
  animation: ui-fade-in var(--dur-mid) var(--ease);
}
.article-input::placeholder {
  color: var(--ink-4);
}
.article-input:focus {
  outline: none;
  border-color: var(--brand);
  background: var(--surface);
  box-shadow: var(--ring-brand);
}
.article-drop {
  flex: 1;
  min-height: 180px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 22px 18px;
  border: 1.5px dashed var(--line-strong);
  border-radius: var(--r-card);
  background: color-mix(in srgb, var(--surface-2) 55%, var(--surface));
  color: var(--ink-3);
  text-align: center;
  cursor: pointer;
  transition: border-color var(--dur-fast), background var(--dur-fast), box-shadow var(--dur-fast);
  animation: ui-fade-in var(--dur-mid) var(--ease);
}
.article-drop:hover,
.article-drop.is-drag {
  border-color: var(--brand);
  background: var(--brand-soft);
}
.article-drop:focus-visible {
  outline: none;
  border-color: var(--brand);
  box-shadow: var(--ring-brand);
}
.article-drop-icon {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  background: var(--surface);
  color: var(--brand-ink);
  font-size: var(--text-md);
  font-weight: 700;
}
.article-drop strong {
  color: var(--ink-2);
  font-size: var(--text-sm);
  font-weight: 700;
}
.article-drop-meta {
  max-width: 320px;
  color: var(--ink-4);
  font-size: var(--text-xs);
  line-height: 1.55;
}
.article-notes {
  margin: 0;
  padding: 10px 12px;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border: 1px solid var(--line);
  border-radius: var(--r-card);
  background: var(--surface-2);
  color: var(--ink-3);
  font-size: var(--text-xs);
  line-height: 1.6;
}
.article-notes li {
  position: relative;
  padding-left: 11px;
}
.article-notes li::before {
  content: '·';
  position: absolute;
  left: 0;
  color: var(--ink-4);
  font-weight: 800;
}

/* ── 加载 / 错误 / 空态 ─────────────────────────────────── */
.setup-empty {
  margin: 0;
  padding: 24px 16px;
  border: 1px dashed var(--line);
  border-radius: var(--r-card);
  background: color-mix(in srgb, var(--surface-2) 55%, var(--surface));
  color: var(--ink-4);
  font-size: var(--text-xs);
  line-height: 1.6;
  text-align: center;
}

/* ── 练习会话：只控制容器宽度与间距，皮肤由练习域负责 ─────── */
.training-session {
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: var(--content-narrow);
  margin: 0 auto;
  padding: 14px 20px 0;
  display: flex;
  flex-direction: column;
  animation: ui-fade-up var(--dur-mid) var(--ease);
}
@media (max-width: 1024px) {
  .training-config {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    overflow-y: auto;
    scrollbar-gutter: stable;
    padding: var(--page-top-gap) var(--page-pad-x) 12px;
  }
  .training-brand {
    flex: none;
  }
  .training-side {
    flex: none;
    min-height: auto;
    padding: 0 18px 18px;
  }
  .training-panel {
    flex: none;
    min-height: 0;
  }
  .setup-grid {
    flex: none;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: visible;
    gap: 14px;
  }
  .setup-grid > .setup-card {
    height: auto;
    flex: none;
  }
  .training-panel :deep(.setup-card-scroll) {
    overflow: visible;
  }
}

@media (max-width: 640px) {
  .training-config {
    padding: var(--page-top-gap) 10px 10px;
    gap: 10px;
  }
  .training-side {
    padding: 0 16px 14px;
    gap: 10px;
  }
  .side-controls-row {
    width: 100%;
    gap: 8px;
  }
  .training-tabs {
    flex: 1;
  }
  .training-tabs .segmented-btn {
    flex: 1;
    padding: 0 10px;
  }
  .training-tabs kbd {
    display: none;
  }
  .side-start {
    margin-top: 4px;
  }
  .setup-grid {
    gap: 12px;
    padding-bottom: 4px;
  }
  .setup-start {
    width: 100%;
  }
  .training-session {
    padding: 10px 10px 0;
  }
}
</style>
