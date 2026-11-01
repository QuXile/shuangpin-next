<script setup lang="ts">
/**
 * 练习场（/training）：专项练习（字/词，声母×韵母自由组合，无尽练习）
 * 与文章练习（粘贴/.txt 导入，core parseArticleText 断行，逐字练习 + 汇总）。
 *
 * 判题、错误锁定、退格、清空、按下高亮复用 useTrainingSession（内部共享 lib/sessionInput），
 * 不写课程进度/星级。
 */
import { computed, onBeforeUnmount, onMounted, onScopeDispose, ref, shallowRef, watch } from 'vue'
import {
  createSchemeEngine,
  filterTrainingEntries,
  freeTrainingAtoms,
  parseAtomId,
  parseArticleText,
  sessionMetrics,
  type AtomId,
  type SchemeEngine,
  type TrainingCommonAtoms,
  type TrainingScope,
  type WordEntry,
} from '@shuangpin/core'
import PracticeStream from '@/components/practice/PracticeStream.vue'
import SessionBar from '@/components/layout/SessionBar.vue'
import StageSummaryCard from '@/components/practice/StageSummaryCard.vue'
import SchemeKeycaps from '@/components/keyboard/SchemeKeycaps.vue'
import SchemeSelector from '@/components/keyboard/SchemeSelector.vue'
import HeroLayout from '@/components/common/HeroLayout.vue'
import CardHeader from '@/components/common/CardHeader.vue'
import ArticleGrid from '@/components/training/ArticleGrid.vue'
import SetupCard from '@/components/training/SetupCard.vue'
import SetupGroup from '@/components/training/SetupGroup.vue'
import CommonCapsule from '@/components/training/CommonCapsule.vue'
import { useCourseStore } from '@/stores/course'
import { useLayoutStore, type DockContent } from '@/stores/layout'
import { useSoundStore } from '@/stores/sound'
import { useGlobalKeys, type KeyBinding } from '@/composables/useGlobalKeys'
import { useKeyInput } from '@/composables/useKeyInput'
import { useBottomDockContent } from '@/composables/useBottomDockContent'
import { useTrainingSession } from '@/composables/useTrainingSession'
import { loadLexicon, type CommonWordsFile, type TrainingBank } from '@/lib/data'
import {
  groupAllChecked,
  groupIndeterminate,
  groupSelected,
  groupTotal,
} from '@/lib/trainingGroups'
import {
  readTrainingConfig,
  writeTrainingConfig,
  type TrainingConfigSnapshot,
} from '@/lib/trainingConfig'
import {
  articlesToPracticeWords,
  buildArticlePlan,
  buildTrainingBatch,
  entriesToPracticeWords,
  trainingAtomOptions,
  type CommonAtomEntry,
} from '@/lib/training'

type Tab = 'drill' | 'article'
type DrillMode = 'char' | 'word'
type SessionKind = 'drill' | 'article' | null

const course = useCourseStore()
const layout = useLayoutStore()
const sound = useSoundStore()
const trainer = useTrainingSession()
const {
  session,
  revealed,
  wrongInputs,
  keyErrors: sessionKeyErrors,
  completedWords,
  accuracy,
  hasStarted,
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
const drillMode = ref<DrillMode>('word')
const articleInputMode = ref<'input' | 'import'>('input')
const bank = shallowRef<TrainingBank | null>(null)
const commonWords = shallowRef<CommonWordsFile | null>(null)
const bankStatus = ref<'loading' | 'ready' | 'error'>('loading')
const bankError = ref('')
const selectedInitials = ref<ReadonlySet<string>>(new Set())
const selectedFinals = ref<ReadonlySet<string>>(new Set())
const selectedZeroFinals = ref<ReadonlySet<string>>(new Set())
const schemeId = ref('')
let hydratedScheme = ''
let readyToPersist = false
let coursePresetApplied = false
// 隐藏映射选择（出现/隐藏双选栏）；必须在下方 immediate watch 之前初始化
const hiddenInitials = ref<ReadonlySet<string>>(new Set())
const hiddenFinals = ref<ReadonlySet<string>>(new Set())
const hiddenZeroFinals = ref<ReadonlySet<string>>(new Set())
const articleHiddenInitials = ref<ReadonlySet<string>>(new Set())
const articleHiddenFinals = ref<ReadonlySet<string>>(new Set())
const articleHiddenZeroFinals = ref<ReadonlySet<string>>(new Set())

const schemeOptions = computed(() => course.allSchemeOptions)
const primarySchemeIds = computed(() => course.schemeOptions.map((option) => option.id))
const primarySchemeOptions = computed(() => course.schemeOptions)
const schemeBusy = ref(false)
const heroKeycapsRef = ref<InstanceType<typeof SchemeKeycaps> | null>(null)

/** 方案切换/预览失败的反馈：保留当前可用方案，提供重试，不静默。 */
const schemeError = ref('')
const schemeRetryId = ref('')
const failedSchemeName = computed(
  () =>
    course.allSchemeOptions.find((option) => option.id === schemeRetryId.value)?.name ??
    schemeRetryId.value,
)
/** 课程数据首次加载中 / 加载失败（尚未有可用方案时）。 */
const courseLoading = computed(
  () => !course.scheme && (course.status === 'loading' || course.status === 'idle'),
)
const courseFailed = computed(() => !course.scheme && course.status === 'error')

async function chooseScheme(id: string): Promise<void> {
  // 重复点击当前方案时重新散落；真正切换方案由 SchemeKeycaps 的 watch 启动新一轮。
  if (id === course.schemeId) {
    heroKeycapsRef.value?.refreshKeycaps()
    return
  }
  if (schemeBusy.value) return
  sound.playKey()
  schemeBusy.value = true
  schemeError.value = ''
  try {
    await course.selectScheme(id)
  } finally {
    schemeBusy.value = false
  }
  if (course.status === 'error') {
    // 课程方案 / 纯练习方案加载失败：记录失败方案并提示重试（当前方案仍可用）。
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

const atomOptions = computed(() => (course.scheme ? trainingAtomOptions(course.scheme) : null))
const engine = computed<SchemeEngine | null>(() =>
  course.scheme ? createSchemeEngine(course.scheme) : null,
)

/** 当前方案与全拼一致的 free atoms；在声母/韵母组内各聚合为一个「全拼沿用」胶囊。 */
const EMPTY_COMMON_ATOMS: TrainingCommonAtoms = { initials: [], finals: [], zeroFinals: [] }
/** 当前方案相对全拼的 free atoms：随方案切换自动重算，不手写固定集合。 */
const commonAtoms = computed<TrainingCommonAtoms>(() =>
  course.scheme ? freeTrainingAtoms(course.scheme) : EMPTY_COMMON_ATOMS,
)
const commonInitialSet = computed(() => new Set(commonAtoms.value.initials))
const commonFinalSet = computed(() => new Set(commonAtoms.value.finals))
const commonZeroSet = computed(() => new Set(commonAtoms.value.zeroFinals))
const selectableInitials = computed(() =>
  (atomOptions.value?.initials ?? []).filter((item) => !commonInitialSet.value.has(item)),
)
const selectableFinals = computed(() =>
  (atomOptions.value?.finals ?? []).filter((item) => !commonFinalSet.value.has(item)),
)
const selectableZeroFinals = computed(() =>
  (atomOptions.value?.zeroFinals ?? []).filter((item) => !commonZeroSet.value.has(item)),
)
const selectedSelectableInitialCount = computed(
  () => selectableInitials.value.filter((item) => selectedInitials.value.has(item)).length,
)
const selectedSelectableFinalCount = computed(
  () => selectableFinals.value.filter((item) => selectedFinals.value.has(item)).length,
)
const selectedSelectableZeroCount = computed(
  () => selectableZeroFinals.value.filter((item) => selectedZeroFinals.value.has(item)).length,
)

type CommonAtomKind = CommonAtomEntry['kind']
type CommonScope = 'appear' | 'drill' | 'article'
type CommonGroup = 'initial' | 'final' | 'zero'

const commonAtomEntries = computed<CommonAtomEntry[]>(() => [
  ...commonAtoms.value.initials.map((value) => ({ kind: 'initial' as const, value })),
  ...commonAtoms.value.finals.map((value) => ({ kind: 'final' as const, value })),
  ...commonAtoms.value.zeroFinals.map((value) => ({ kind: 'zero' as const, value })),
])

function commonSetOf(scope: CommonScope, kind: CommonAtomKind): ReadonlySet<string> {
  const initial =
    scope === 'appear' ? selectedInitials : scope === 'drill' ? hiddenInitials : articleHiddenInitials
  const final =
    scope === 'appear' ? selectedFinals : scope === 'drill' ? hiddenFinals : articleHiddenFinals
  const zero =
    scope === 'appear' ? selectedZeroFinals : scope === 'drill' ? hiddenZeroFinals : articleHiddenZeroFinals
  return kind === 'initial' ? initial.value : kind === 'final' ? final.value : zero.value
}

function commonEntriesFor(scope: CommonScope, group: CommonGroup): CommonAtomEntry[] {
  const entries = commonAtomEntries.value.filter((entry) =>
    group === 'zero' ? entry.kind === 'zero' : entry.kind === group,
  )
  if (scope !== 'drill') return entries
  return entries.filter((entry) => commonSetOf('appear', entry.kind).has(entry.value))
}

function commonAllChecked(scope: CommonScope, group: CommonGroup): boolean {
  const entries = commonEntriesFor(scope, group)
  return entries.length > 0 && entries.every((entry) => commonSetOf(scope, entry.kind).has(entry.value))
}

function writeCommonSet(scope: CommonScope, kind: CommonAtomKind, next: ReadonlySet<string>): void {
  if (scope === 'appear') {
    if (kind === 'initial') selectedInitials.value = next
    else if (kind === 'final') selectedFinals.value = next
    else selectedZeroFinals.value = next
  } else if (scope === 'drill') {
    if (kind === 'initial') hiddenInitials.value = next
    else if (kind === 'final') hiddenFinals.value = next
    else hiddenZeroFinals.value = next
  } else {
    if (kind === 'initial') articleHiddenInitials.value = next
    else if (kind === 'final') articleHiddenFinals.value = next
    else articleHiddenZeroFinals.value = next
  }
}


function toggleCommonAll(scope: CommonScope, group: CommonGroup): void {
  const entries = commonEntriesFor(scope, group)
  const add = !commonAllChecked(scope, group)
  for (const kind of ['initial', 'final', 'zero'] as const) {
    const next = new Set(commonSetOf(scope, kind))
    for (const entry of entries) {
      if (entry.kind !== kind) continue
      if (add) next.add(entry.value)
      else next.delete(entry.value)
    }
    writeCommonSet(scope, kind, next)
  }
}

function selectAll(): void {
  // 默认全部开启：普通键位 + 「全拼沿用」胶囊代表的公共键位。
  const options = atomOptions.value
  if (!options) return
  selectedInitials.value = new Set(options.initials)
  selectedFinals.value = new Set(options.finals)
  selectedZeroFinals.value = new Set(options.zeroFinals)
}

function applyTrainingConfig(config: TrainingConfigSnapshot): void {
  const options = atomOptions.value
  if (!options) return
  const allowedInitials = new Set(options.initials)
  const allowedFinals = new Set(options.finals)
  const allowedZeros = new Set(options.zeroFinals)
  tab.value = config.tab
  drillMode.value = config.drillMode
  articleInputMode.value = config.articleInputMode
  selectedInitials.value = new Set(config.selectedInitials.filter((item) => allowedInitials.has(item)))
  selectedFinals.value = new Set(config.selectedFinals.filter((item) => allowedFinals.has(item)))
  selectedZeroFinals.value = new Set(config.selectedZeroFinals.filter((item) => allowedZeros.has(item)))
  hiddenInitials.value = new Set(
    config.hiddenInitials.filter(
      (item) => allowedInitials.has(item) && selectedInitials.value.has(item),
    ),
  )
  hiddenFinals.value = new Set(
    config.hiddenFinals.filter((item) => allowedFinals.has(item) && selectedFinals.value.has(item)),
  )
  hiddenZeroFinals.value = new Set(
    config.hiddenZeroFinals.filter(
      (item) => allowedZeros.has(item) && selectedZeroFinals.value.has(item),
    ),
  )
  articleHiddenInitials.value = new Set(
    config.articleHiddenInitials.filter((item) => allowedInitials.has(item)),
  )
  articleHiddenFinals.value = new Set(
    config.articleHiddenFinals.filter((item) => allowedFinals.has(item)),
  )
  articleHiddenZeroFinals.value = new Set(
    config.articleHiddenZeroFinals.filter((item) => allowedZeros.has(item)),
  )
}

/** 从课程总结卡跳转过来的无尽练习：把本课 focus 与当前阶段的遮挡档位映射成训练设置。 */
function applyCoursePreset(): void {
  if (coursePresetApplied || course.previewMode) return
  const presetKey = 'shuangpin-next:training-preset'
  let raw: string | null = null
  try {
    raw = sessionStorage.getItem(presetKey)
    sessionStorage.removeItem(presetKey)
  } catch {
    return
  }
  if (!raw) return
  let preset: { from?: unknown; stage?: unknown; scheme?: unknown }
  try {
    preset = JSON.parse(raw) as { from?: unknown; stage?: unknown; scheme?: unknown }
  } catch {
    return
  }
  const from = typeof preset.from === 'string' ? preset.from : ''
  const stage = typeof preset.stage === 'string' ? preset.stage : ''
  const presetScheme = typeof preset.scheme === 'string' ? preset.scheme : ''
  if (!from || !['single', 'word', 'exam'].includes(stage)) return
  if (presetScheme && presetScheme !== course.schemeId) {
    // 极端情况下训练页仍停留在另一个方案：先把方案切回来，再重新读取一次性预设。
    try {
      sessionStorage.setItem(presetKey, raw)
    } catch {
      return
    }
    void course.selectScheme(presetScheme)
    return
  }
  const lesson = course.getLesson(from)
  const options = atomOptions.value
  if (!lesson || !options) return
  coursePresetApplied = true

  const focusInitials = new Set<string>()
  const focusFinals = new Set<string>()
  const focusZeros = new Set<string>()
  const learnedInitials = new Set<string>()
  const learnedFinals = new Set<string>()
  const learnedZeros = new Set<string>()
  const currentIndex = course.lessons.findIndex((item) => item.id === lesson.id)
  const lastIndex = currentIndex >= 0 ? currentIndex : course.lessons.length - 1
  for (let index = 0; index <= lastIndex; index += 1) {
    const item = course.lessons[index]
    if (!item) continue
    for (const atomId of item.focusAtoms) {
      const parsed = parseAtomId(atomId)
      if (!parsed) continue
      if (parsed.type === 'initial') learnedInitials.add(parsed.key)
      else if (parsed.type === 'final') learnedFinals.add(parsed.key)
      else learnedZeros.add(parsed.key)
    }
  }
  // 当前课的 focus 单独保存，用于 word 阶段只隐藏本课新学的映射。
  for (const atomId of lesson.focusAtoms) {
    const parsed = parseAtomId(atomId)
    if (!parsed) continue
    if (parsed.type === 'initial') focusInitials.add(parsed.key)
    else if (parsed.type === 'final') focusFinals.add(parsed.key)
    else focusZeros.add(parsed.key)
  }

  // 全拼沿用 + 已学课程 focus 构成本课已学范围；零声母只取课程真正教过的部分，
  // 避免 L2.1 这种早期课程提前带入未学的零声母。
  const nextInitials = new Set([...commonAtoms.value.initials, ...learnedInitials])
  const nextFinals = new Set([...commonAtoms.value.finals, ...learnedFinals])
  const nextZeros = new Set(learnedZeros)

  tab.value = 'drill'
  drillMode.value = stage === 'single' ? 'char' : 'word'
  selectedInitials.value = new Set([...nextInitials].filter((item) => options.initials.includes(item)))
  selectedFinals.value = new Set([...nextFinals].filter((item) => options.finals.includes(item)))
  selectedZeroFinals.value = new Set([...nextZeros].filter((item) => options.zeroFinals.includes(item)))

  const hideAll = stage === 'exam'
  const hideFocus = stage === 'word' || hideAll
  hiddenInitials.value = new Set(
    [...(hideAll ? selectedInitials.value : hideFocus ? focusInitials : new Set<string>())].filter(
      (item) => selectedInitials.value.has(item),
    ),
  )
  hiddenFinals.value = new Set(
    [...(hideAll ? selectedFinals.value : hideFocus ? focusFinals : new Set<string>())].filter(
      (item) => selectedFinals.value.has(item),
    ),
  )
  hiddenZeroFinals.value = new Set(
    [...(hideAll ? selectedZeroFinals.value : hideFocus ? focusZeros : new Set<string>())].filter(
      (item) => selectedZeroFinals.value.has(item),
    ),
  )

  // 一次性预设从 sessionStorage 取出后已删除，刷新不会再次覆盖用户后续修改。
}

watch(
  [() => course.schemeId, atomOptions],
  ([id, options]) => {
    if (!id || !options || hydratedScheme === id) return
    hydratedScheme = id
    schemeId.value = id
    readyToPersist = false
    tab.value = 'drill'
    drillMode.value = 'word'
    hiddenInitials.value = new Set()
    hiddenFinals.value = new Set()
    hiddenZeroFinals.value = new Set()
    articleHiddenInitials.value = new Set()
    articleHiddenFinals.value = new Set()
    articleHiddenZeroFinals.value = new Set()
    const config = readTrainingConfig(window.localStorage, id)
    if (config) applyTrainingConfig(config)
    else selectAll()
    applyCoursePreset()
    readyToPersist = true
  },
  { immediate: true, flush: 'post' },
)

/** 加载练习字库（失败可重试；数据层不缓存失败结果）。 */
async function loadBank(): Promise<void> {
  bankStatus.value = 'loading'
  bankError.value = ''
  try {
    const lexicon = await loadLexicon()
    bank.value = {
      schemaVersion: '1',
      dataVersion: lexicon.dataVersion,
      chars: lexicon.chars,
    }
    commonWords.value = {
      dataVersion: lexicon.dataVersion,
      count: lexicon.words.length,
      words: lexicon.words,
    }
    bankStatus.value = 'ready'
  } catch (cause) {
    bankStatus.value = 'error'
    bankError.value = cause instanceof Error ? cause.message : String(cause)
  }
}

onMounted(async () => {
  await course.init()
  await loadBank()
})

function currentTrainingConfig(): TrainingConfigSnapshot {
  return {
    tab: tab.value,
    drillMode: drillMode.value,
    articleInputMode: articleInputMode.value,
    selectedInitials: [...selectedInitials.value],
    selectedFinals: [...selectedFinals.value],
    selectedZeroFinals: [...selectedZeroFinals.value],
    hiddenInitials: [...hiddenInitials.value],
    hiddenFinals: [...hiddenFinals.value],
    hiddenZeroFinals: [...hiddenZeroFinals.value],
    articleHiddenInitials: [...articleHiddenInitials.value],
    articleHiddenFinals: [...articleHiddenFinals.value],
    articleHiddenZeroFinals: [...articleHiddenZeroFinals.value],
  }
}

function persistTrainingConfig(): void {
  if (!readyToPersist || !schemeId.value || !atomOptions.value) return
  writeTrainingConfig(window.localStorage, schemeId.value, currentTrainingConfig())
}

watch(
  [
    tab,
    drillMode,
    articleInputMode,
    selectedInitials,
    selectedFinals,
    selectedZeroFinals,
    hiddenInitials,
    hiddenFinals,
    hiddenZeroFinals,
    articleHiddenInitials,
    articleHiddenFinals,
    articleHiddenZeroFinals,
  ],
  () => {
    persistTrainingConfig()
  },
  { flush: 'post' },
)

const scope = computed<TrainingScope>(() => ({
  initials: [...selectedInitials.value],
  finals: [...selectedFinals.value],
  zeroFinals: [...selectedZeroFinals.value],
}))

const baseEntries = computed<readonly WordEntry[]>(() => {
  if (drillMode.value === 'char') return bank.value?.chars ?? []
  return commonWords.value?.words ?? []
})
const availableEntries = computed<readonly WordEntry[]>(() =>
  bank.value ? filterTrainingEntries(baseEntries.value, scope.value) : [],
)
const availableCount = computed(() => availableEntries.value.length)
const previewTexts = computed(() => availableEntries.value.slice(0, 16).map((entry) => entry.text))
const previewSample = computed(
  () => previewTexts.value.join('、') + (availableCount.value > previewTexts.value.length ? '…' : ''),
)
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
type Group = 'initial' | 'final' | 'zero'
function selectGroup(group: Group): void {
  if (group === 'initial') {
    selectedInitials.value = new Set([...commonInitialSet.value, ...selectableInitials.value])
  } else if (group === 'final') {
    selectedFinals.value = new Set([...commonFinalSet.value, ...selectableFinals.value])
  } else {
    selectedZeroFinals.value = new Set([...commonZeroSet.value, ...selectableZeroFinals.value])
  }
}
function clearGroup(group: Group): void {
  if (group === 'initial') selectedInitials.value = new Set()
  else if (group === 'final') selectedFinals.value = new Set()
  else selectedZeroFinals.value = new Set()
}


// ── 当前学习进度 → 选中已学完课程覆盖的音 ─────────────────────
const passedLessons = computed(() =>
  course.lessons.filter((lesson) => course.progress[lesson.id]?.passed),
)
const passedLessonCount = computed(() => passedLessons.value.length)

function selectLearnedAtoms(): void {
  const options = atomOptions.value
  if (!options || passedLessons.value.length === 0) return
  const initialSet = new Set(
    [...selectedInitials.value].filter((item) => commonInitialSet.value.has(item)),
  )
  const finalSet = new Set(
    [...selectedFinals.value].filter((item) => commonFinalSet.value.has(item)),
  )
  const zeroSet = new Set(
    [...selectedZeroFinals.value].filter((item) => commonZeroSet.value.has(item)),
  )
  const initialKeys = new Set(options.initials)
  const finalKeys = new Set(options.finals)
  const zeroKeys = new Set(options.zeroFinals)
  for (const lesson of passedLessons.value) {
    for (const atom of lesson.focusAtoms) {
      const [type, key] = atom.split(':', 2)
      if (type === 'initial' && initialKeys.has(key ?? '')) initialSet.add(key ?? '')
      else if (type === 'final' && finalKeys.has(key ?? '')) finalSet.add(key ?? '')
      else if (type === 'zero' && zeroKeys.has(key ?? '')) zeroSet.add(key ?? '')
    }
  }
  selectedInitials.value = initialSet
  selectedFinals.value = finalSet
  selectedZeroFinals.value = zeroSet
}

function toggleAppearAll(group: Group): void {
  const all =
    group === 'initial'
      ? appearInitialAll.value
      : group === 'final'
        ? appearFinalAll.value
        : appearZeroAll.value
  if (all) clearGroup(group)
  else selectGroup(group)
}

function commonCapsuleCount(scope: CommonScope, group: CommonGroup): number {
  return commonEntriesFor(scope, group).length > 0 ? 1 : 0
}

const appearInitialGroup = computed(() => ({
  specificCount: selectableInitials.value.length,
  specificSelected: selectedSelectableInitialCount.value,
  hasCapsule: commonCapsuleCount('appear', 'initial') > 0,
  capsuleSelected: commonAllChecked('appear', 'initial'),
}))
const appearZeroGroup = computed(() => ({
  specificCount: selectableZeroFinals.value.length,
  specificSelected: selectedSelectableZeroCount.value,
  hasCapsule: commonCapsuleCount('appear', 'zero') > 0,
  capsuleSelected: commonAllChecked('appear', 'zero'),
}))
const appearFinalGroup = computed(() => ({
  specificCount: selectableFinals.value.length,
  specificSelected: selectedSelectableFinalCount.value,
  hasCapsule: commonCapsuleCount('appear', 'final') > 0,
  capsuleSelected: commonAllChecked('appear', 'final'),
}))
const appearInitialTotalCount = computed(() => groupTotal(appearInitialGroup.value))
const appearInitialSelectedCount = computed(() => groupSelected(appearInitialGroup.value))
const appearFinalTotalCount = computed(() => groupTotal(appearFinalGroup.value))
const appearFinalSelectedCount = computed(() => groupSelected(appearFinalGroup.value))
const appearInitialAll = computed(() => groupAllChecked(appearInitialGroup.value))
const appearFinalAll = computed(() => groupAllChecked(appearFinalGroup.value))
const appearZeroAll = computed(() => groupAllChecked(appearZeroGroup.value))
const appearInitialPartial = computed(() => groupIndeterminate(appearInitialGroup.value))
const appearFinalPartial = computed(() => groupIndeterminate(appearFinalGroup.value))
const appearZeroPartial = computed(() => groupIndeterminate(appearZeroGroup.value))
const appearZeroTotalCount = computed(() => groupTotal(appearZeroGroup.value))
const appearZeroSelectedCount = computed(() => groupSelected(appearZeroGroup.value))

// ── 练习时隐藏映射（出现 / 隐藏双选栏） ──────────────────────

type HiddenScope = 'drill' | 'article'

// 公共 free atoms 在声母/韵母组内以「全拼沿用」胶囊展示，不混入普通 chips。
const drillHiddenInitialCandidates = computed(() =>
  atomOptions.value
    ? atomOptions.value.initials.filter(
        (item) => selectedInitials.value.has(item) && !commonInitialSet.value.has(item),
      )
    : [],
)
const drillHiddenFinalCandidates = computed(() =>
  atomOptions.value
    ? atomOptions.value.finals.filter(
        (item) => selectedFinals.value.has(item) && !commonFinalSet.value.has(item),
      )
    : [],
)
const drillHiddenZeroCandidates = computed(() =>
  atomOptions.value
    ? atomOptions.value.zeroFinals.filter(
        (item) => selectedZeroFinals.value.has(item) && !commonZeroSet.value.has(item),
      )
    : [],
)
const articleHiddenInitialCandidates = computed(() =>
  atomOptions.value ? selectableInitials.value : [],
)
const articleHiddenFinalCandidates = computed(() =>
  atomOptions.value ? selectableFinals.value : [],
)
const articleHiddenZeroCandidates = computed(() =>
  atomOptions.value ? selectableZeroFinals.value : [],
)

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
  return group === 'initial'
    ? candidates.initials
    : group === 'final'
      ? candidates.finals
      : candidates.zeroFinals
}

/** 隐藏组把「全拼沿用」胶囊也算作一个可全选项目。 */
function hiddenGroupState(scope: HiddenScope, group: Group): {
  specificCount: number
  specificSelected: number
  hasCapsule: boolean
  capsuleSelected: boolean
} {
  const candidates = hiddenCandidatesOf(scope)
  if (group === 'initial') {
    return {
      specificCount: candidates.initials.length,
      specificSelected: candidates.initials.filter((item) => hiddenInitialsOf(scope).value.has(item)).length,
      hasCapsule: commonCapsuleCount(scope, 'initial') > 0,
      capsuleSelected: commonAllChecked(scope, 'initial'),
    }
  }
  if (group === 'final') {
    return {
      specificCount: candidates.finals.length,
      specificSelected: candidates.finals.filter((item) => hiddenFinalsOf(scope).value.has(item)).length,
      hasCapsule: commonCapsuleCount(scope, 'final') > 0,
      capsuleSelected: commonAllChecked(scope, 'final'),
    }
  }
  return {
    specificCount: candidates.zeroFinals.length,
    specificSelected: candidates.zeroFinals.filter((item) => hiddenZeroFinalsOf(scope).value.has(item)).length,
    hasCapsule: commonCapsuleCount(scope, 'zero') > 0,
    capsuleSelected: commonAllChecked(scope, 'zero'),
  }
}

function hiddenGroupTotal(scope: HiddenScope, group: Group): number {
  return groupTotal(hiddenGroupState(scope, group))
}

function hiddenGroupSelected(scope: HiddenScope, group: Group): number {
  return groupSelected(hiddenGroupState(scope, group))
}

function hiddenGroupAllChecked(scope: HiddenScope, group: Group): boolean {
  return groupAllChecked(hiddenGroupState(scope, group))
}

function hiddenGroupDisabled(scope: HiddenScope, group: Group): boolean {
  return hiddenGroupTotal(scope, group) === 0
}

function hiddenGroupPartial(scope: HiddenScope, group: Group): boolean {
  return groupIndeterminate(hiddenGroupState(scope, group))
}

function toggleHiddenAll(scope: HiddenScope, group: Group): void {
  if (hiddenGroupAllChecked(scope, group)) clearHiddenGroup(scope, group)
  else selectHiddenGroup(scope, group)
}

/** 隐藏组按组选中/清除：普通候选与「全拼沿用」胶囊对应的公共原子一起处理，避免全不选后胶囊仍选中。 */
function applyHiddenGroup(scope: HiddenScope, group: Group, selected: boolean): void {
  const target =
    group === 'initial'
      ? hiddenInitialsOf(scope)
      : group === 'final'
        ? hiddenFinalsOf(scope)
        : hiddenZeroFinalsOf(scope)
  target.value = selected ? new Set(hiddenGroupCandidates(scope, group)) : new Set()
  for (const entry of commonEntriesFor(scope, group)) {
    const current = commonSetOf(scope, entry.kind)
    const has = current.has(entry.value)
    if (selected === has) continue
    const next = new Set(current)
    if (selected) next.add(entry.value)
    else next.delete(entry.value)
    writeCommonSet(scope, entry.kind, next)
  }
}

/** 隐藏栏同样按组全选：普通键位 + 全拼沿用胶囊一起处理。 */
function selectHiddenGroup(scope: HiddenScope, group: Group): void {
  applyHiddenGroup(scope, group, true)
}

function clearHiddenGroup(scope: HiddenScope, group: Group): void {
  applyHiddenGroup(scope, group, false)
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
const specialInitials = computed(() => engine.value?.diff().learnInitials ?? [])
const sessionTitle = computed(() =>
  kind.value === 'article' ? '文章练习' : `专项练习 · ${drillMode.value === 'char' ? '单字' : '词语'}`,
)
watch(
  [playing, sessionTitle],
  () => layout.setStageLabel(playing.value ? sessionTitle.value : ''),
  { immediate: true },
)
onBeforeUnmount(() => {
  layout.clearStageLabel()
})
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

function restartSession(): void {
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
  if (!playing.value) return
  if (input.type === 'backspace') onBackspace()
  else onLetter(input.key)
})

const dockContent = computed<DockContent>(() => ({
  rows: keyMapRows.value,
  schemeName: course.scheme?.name,
  specialInitials: specialInitials.value,
  zeroInitials: course.scheme?.zeroInitial,
  compatCodes: course.scheme?.compatCodes,
  hiddenAtomIds: playing.value ? sessionHiddenAtomIds.value : [],
  // 练习会话一旦设置了隐藏项，就和课程考核阶段一样收起整层映射提示。
  conceal: playing.value && sessionHiddenAtomIds.value.length > 0,
}))
useBottomDockContent(() => dockContent.value)

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
watch(articleDone, (done) => {
  if (done) sound.playComplete()
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

/** 配置页的 Enter 不抢按钮/输入框/下拉/文件拖拽区的默认行为。 */
function isConfigInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest('button, a, input, textarea, select, [role="button"]'))
  )
}

function focusOtherScheme(): void {
  const select = document.querySelector<HTMLSelectElement>('.scheme-more select')
  if (!select) return
  select.focus()
  try {
    select.showPicker()
  } catch {
    /* 部分浏览器不支持 showPicker，聚焦后仍可用方向键/回车 */
  }
}

const bindings = computed<KeyBinding[]>(() => {
  if (!playing.value) {
    return [
      {
        key: 'Enter',
        when: (event) =>
          !isConfigInteractiveTarget(event.target) &&
          (tab.value === 'drill' ? canStartDrill.value : canStartArticle.value),
        run: () => {
          if (tab.value === 'drill') startDrill()
          else startArticle()
        },
      },
      {
        key: 'd',
        alt: true,
        run: () => switchTab('drill'),
      },
      {
        key: 'a',
        alt: true,
        run: () => switchTab('article'),
      },
      {
        key: 'm',
        alt: true,
        when: () => tab.value === 'drill',
        run: () => {
          drillMode.value = drillMode.value === 'char' ? 'word' : 'char'
        },
      },
      ...primarySchemeOptions.value.map((option, index) => ({
        key: String(index + 1),
        alt: true,
        run: () => chooseScheme(option.id),
      })),
      {
        key: '6',
        alt: true,
        run: () => focusOtherScheme(),
      },
    ]
  }
  return [
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
    { key: 'r', alt: true, run: () => restartSession() },
  ]
})
useGlobalKeys(bindings)

onScopeDispose(() => {
  // 路由切换/离开页面时兜底写入，避免最后一次设置只停在 debounce 队列里。
  persistTrainingConfig()
})
</script>

<template>
  <div class="training-page">
    <template v-if="!playing">
      <div class="training-config">
        <HeroLayout class="training-brand">
          <template #eyebrow>
            <span class="eyebrow">PRACTICE GROUND</span>
          </template>
          <template #title>
            <h1>练习场</h1>
          </template>
          <template #visual>
            <SchemeKeycaps
              v-if="course.scheme"
              ref="heroKeycapsRef"
              :scheme="course.scheme"
              text="练习场"
              single-row
            />
          </template>
          <template #bottom>
            <SchemeSelector
              v-if="schemeOptions.length > 1"
              :options="schemeOptions"
              :primary-ids="primarySchemeIds"
              :model-value="course.schemeId"
              :busy="schemeBusy"
              show-keys
              @select="chooseScheme"
            />
          </template>
        </HeroLayout>

        <aside class="training-side panel">
          <CardHeader title="练习设置">
            <span class="count-badge">{{ tab === 'drill' ? '专项 · 无尽练习' : '文章 · 逐字练习' }}</span>
          </CardHeader>
          <div class="side-controls">
            <div class="side-controls-row">
              <div class="segmented training-tabs" role="tablist" aria-label="练习类型">
                <button
                  type="button"
                  role="tab"
                  :aria-selected="tab === 'drill'"
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
                  role="tab"
                  :aria-selected="tab === 'article'"
                  class="segmented-btn"
                  :class="{ 'is-active': tab === 'article' }"
                  aria-keyshortcuts="Alt+A"
                  @click="switchTab('article')"
                >
                  文章练习
                  <kbd>Alt+A</kbd>
                </button>
              </div>

              <div
                v-if="tab === 'drill'"
                class="segmented training-mode"
                role="group"
                aria-label="练习类型"
              >
                <button
                  type="button"
                  class="segmented-btn"
                  :class="{ 'is-active': drillMode === 'char' }"
                  :aria-pressed="drillMode === 'char'"
                  aria-keyshortcuts="Alt+M"
                  title="单字模式（Alt+M 切换）"
                  @click="drillMode = 'char'"
                >
                  字
                  <kbd>Alt+M</kbd>
                </button>
                <button
                  type="button"
                  class="segmented-btn"
                  :class="{ 'is-active': drillMode === 'word' }"
                  :aria-pressed="drillMode === 'word'"
                  aria-keyshortcuts="Alt+M"
                  title="词语模式（Alt+M 切换）"
                  @click="drillMode = 'word'"
                >
                  词
                  <kbd>Alt+M</kbd>
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
                <strong>可用{{ drillMode === 'char' ? '字' : '词' }} {{ availableCount }} 条</strong>
                <span v-if="availableCount === 0" class="side-info-sub is-warning">当前选择下没有匹配的{{ drillMode === 'char' ? '字' : '词' }}，请调整声母 / 韵母选择。</span>
              </template>
              <template v-else>
                <strong v-if="parsed">将练习 {{ articleMappedCount }} 字 · 跳过 {{ articleSkippedCount }} 字</strong>
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

        <div v-if="courseFailed" class="training-state panel is-error training-state--wide">
          <strong>课程数据加载失败</strong>
          <p>{{ course.error || '无法加载课程数据，请重试。' }}</p>
          <button class="btn btn--sm" type="button" @click="retryCourse">重试</button>
        </div>

        <div v-else-if="courseLoading" class="training-state panel training-state--wide">
          正在加载课程数据…
        </div>

        <div v-else-if="bankStatus === 'error'" class="training-state panel is-error training-state--wide">
          <strong>练习字库加载失败</strong>
          <p>{{ bankError }}</p>
          <button class="btn btn--sm" type="button" @click="loadBank">重试</button>
        </div>

        <!-- 专项练习 -->
        <section v-else-if="tab === 'drill'" :key="tab" class="training-panel">
          <div class="setup-grid">
            <SetupCard pill="出现" tone="appear" subtitle="本局练习范围">
              <template #head-extra>
                <div class="setup-progress">
                  <span class="setup-progress-label">当前进度 {{ passedLessonCount }}/{{ course.lessons.length }} 课</span>
                  <button
                    type="button"
                    class="meta-btn"
                    :disabled="passedLessonCount === 0"
                    title="选中已学完课程包含的声母、韵母与零声母"
                    @click="selectLearnedAtoms"
                  >
                    已学
                  </button>
                </div>
              </template>
              <div v-if="bankStatus === 'loading'" class="training-state panel">正在加载练习字库…</div>
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

            <SetupCard pill="隐藏" tone="hidden" subtitle="练习时不显示映射">

              <SetupGroup
                v-if="hiddenGroupTotal('drill', 'initial') > 0"
                title="声母"
                :all-checked="hiddenGroupAllChecked('drill', 'initial')"
                :indeterminate="hiddenGroupPartial('drill', 'initial')"
                :all-disabled="hiddenGroupDisabled('drill', 'initial')"
                @toggle-all="toggleHiddenAll('drill', 'initial')"
              >
                <template #count>
                  已隐藏 {{ hiddenGroupSelected('drill', 'initial') }}/{{ hiddenGroupTotal('drill', 'initial') }}
                </template>
                <CommonCapsule
                  v-if="commonEntriesFor('drill', 'initial').length > 0"
                  :selected="commonAllChecked('drill', 'initial')"
                  @toggle="toggleCommonAll('drill', 'initial')"
                />
                <button
                  v-for="initial in drillHiddenInitialCandidates"
                  :key="initial"
                  type="button"
                  class="chip"
                  :class="{ 'is-selected': hiddenInitials.has(initial) }"
                  :aria-pressed="hiddenInitials.has(initial)"
                  @click="toggleHidden('drill', 'initial', initial)"
                >
                  {{ initial }}
                </button>
              </SetupGroup>

              <SetupGroup
                v-if="hiddenGroupTotal('drill', 'final') > 0"
                title="韵母"
                :all-checked="hiddenGroupAllChecked('drill', 'final')"
                :indeterminate="hiddenGroupPartial('drill', 'final')"
                :all-disabled="hiddenGroupDisabled('drill', 'final')"
                @toggle-all="toggleHiddenAll('drill', 'final')"
              >
                <template #count>
                  已隐藏 {{ hiddenGroupSelected('drill', 'final') }}/{{ hiddenGroupTotal('drill', 'final') }}
                </template>
                <CommonCapsule
                  v-if="commonEntriesFor('drill', 'final').length > 0"
                  :selected="commonAllChecked('drill', 'final')"
                  @toggle="toggleCommonAll('drill', 'final')"
                />
                <button
                  v-for="final in drillHiddenFinalCandidates"
                  :key="final"
                  type="button"
                  class="chip"
                  :class="{ 'is-selected': hiddenFinals.has(final) }"
                  :aria-pressed="hiddenFinals.has(final)"
                  @click="toggleHidden('drill', 'final', final)"
                >
                  {{ final }}
                </button>
              </SetupGroup>

              <SetupGroup
                v-if="hiddenGroupTotal('drill', 'zero') > 0"
                title="零声母"
                :all-checked="hiddenGroupAllChecked('drill', 'zero')"
                :indeterminate="hiddenGroupPartial('drill', 'zero')"
                :all-disabled="hiddenGroupDisabled('drill', 'zero')"
                @toggle-all="toggleHiddenAll('drill', 'zero')"
              >
                <template #count>
                  已隐藏 {{ hiddenGroupSelected('drill', 'zero') }}/{{ hiddenGroupTotal('drill', 'zero') }}
                </template>
                <CommonCapsule
                  v-if="commonEntriesFor('drill', 'zero').length > 0"
                  :selected="commonAllChecked('drill', 'zero')"
                  @toggle="toggleCommonAll('drill', 'zero')"
                />
                <button
                  v-for="zero in drillHiddenZeroCandidates"
                  :key="`hidden-zero-${zero}`"
                  type="button"
                  class="chip is-special is-zero-chip"
                  :class="{ 'is-selected': hiddenZeroFinals.has(zero) }"
                  :aria-pressed="hiddenZeroFinals.has(zero)"
                  @click="toggleHiddenZeroFinal('drill', zero)"
                >
                  零 {{ zero }}
                </button>
              </SetupGroup>

              <p
                v-if="hiddenGroupTotal('drill', 'initial') === 0 && hiddenGroupTotal('drill', 'final') === 0 && hiddenGroupTotal('drill', 'zero') === 0"
                class="setup-empty"
              >
                先在「出现」中选择声母或韵母。
              </p>
            </SetupCard>
          </div>
        </section>

        <!-- 文章练习 -->
        <section v-else :key="tab" class="training-panel">
          <div class="setup-grid">
            <SetupCard tone="input">
              <template #head>
                <div class="segmented segmented--sm" role="tablist" aria-label="文章输入方式">
                  <button
                    type="button"
                    role="tab"
                    :aria-selected="articleInputMode === 'input'"
                    class="segmented-btn"
                    :class="{ 'is-active': articleInputMode === 'input' }"
                    @click="articleInputMode = 'input'"
                  >
                    输入
                  </button>
                  <button
                    type="button"
                    role="tab"
                    :aria-selected="articleInputMode === 'import'"
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

              <div v-if="bankStatus === 'loading'" class="training-state panel">正在加载练习字库…</div>
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

            <SetupCard pill="隐藏" tone="hidden" subtitle="练习时不显示映射">

              <SetupGroup
                title="声母"
                :all-checked="hiddenGroupAllChecked('article', 'initial')"
                :indeterminate="hiddenGroupPartial('article', 'initial')"
                :all-disabled="hiddenGroupDisabled('article', 'initial')"
                @toggle-all="toggleHiddenAll('article', 'initial')"
              >
                <template #count>
                  已隐藏 {{ hiddenGroupSelected('article', 'initial') }}/{{ hiddenGroupTotal('article', 'initial') }}
                </template>
                <CommonCapsule
                  v-if="commonEntriesFor('article', 'initial').length > 0"
                  :selected="commonAllChecked('article', 'initial')"
                  @toggle="toggleCommonAll('article', 'initial')"
                />
                <button
                  v-for="initial in articleHiddenInitialCandidates"
                  :key="initial"
                  type="button"
                  class="chip"
                  :class="{ 'is-selected': articleHiddenInitials.has(initial) }"
                  :aria-pressed="articleHiddenInitials.has(initial)"
                  @click="toggleHidden('article', 'initial', initial)"
                >
                  {{ initial }}
                </button>
              </SetupGroup>

              <SetupGroup
                title="韵母"
                :all-checked="hiddenGroupAllChecked('article', 'final')"
                :indeterminate="hiddenGroupPartial('article', 'final')"
                :all-disabled="hiddenGroupDisabled('article', 'final')"
                @toggle-all="toggleHiddenAll('article', 'final')"
              >
                <template #count>
                  已隐藏 {{ hiddenGroupSelected('article', 'final') }}/{{ hiddenGroupTotal('article', 'final') }}
                </template>
                <CommonCapsule
                  v-if="commonEntriesFor('article', 'final').length > 0"
                  :selected="commonAllChecked('article', 'final')"
                  @toggle="toggleCommonAll('article', 'final')"
                />
                <button
                  v-for="final in articleHiddenFinalCandidates"
                  :key="final"
                  type="button"
                  class="chip"
                  :class="{ 'is-selected': articleHiddenFinals.has(final) }"
                  :aria-pressed="articleHiddenFinals.has(final)"
                  @click="toggleHidden('article', 'final', final)"
                >
                  {{ final }}
                </button>
              </SetupGroup>

              <SetupGroup
                v-if="hiddenGroupTotal('article', 'zero') > 0"
                title="零声母"
                :all-checked="hiddenGroupAllChecked('article', 'zero')"
                :indeterminate="hiddenGroupPartial('article', 'zero')"
                :all-disabled="hiddenGroupDisabled('article', 'zero')"
                @toggle-all="toggleHiddenAll('article', 'zero')"
              >
                <template #count>
                  已隐藏 {{ hiddenGroupSelected('article', 'zero') }}/{{ hiddenGroupTotal('article', 'zero') }}
                </template>
                <CommonCapsule
                  v-if="commonEntriesFor('article', 'zero').length > 0"
                  :selected="commonAllChecked('article', 'zero')"
                  @toggle="toggleCommonAll('article', 'zero')"
                />
                <button
                  v-for="zero in articleHiddenZeroCandidates"
                  :key="`article-hidden-zero-${zero}`"
                  type="button"
                  class="chip is-special is-zero-chip"
                  :class="{ 'is-selected': articleHiddenZeroFinals.has(zero) }"
                  :aria-pressed="articleHiddenZeroFinals.has(zero)"
                  @click="toggleHiddenZeroFinal('article', zero)"
                >
                  零 {{ zero }}
                </button>
              </SetupGroup>
            </SetupCard>
          </div>
        </section>
      </div>

    </template>

    <!-- 练习会话 -->
    <template v-else>
      <div class="training-session">
        <SessionBar>
          <template #left>
            <button class="session-btn" type="button" @click="exitSession">
              <svg class="icon session-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19.5 12h-15" /><path d="m10.5 6-6 6 6 6" />
              </svg>
              退出
              <kbd>Esc</kbd>
            </button>
            <button class="session-btn" type="button" @click="restartSession">
              重新开始
              <kbd>Alt+R</kbd>
            </button>
          </template>

          <span class="session-item">已练 {{ completedWords }} {{ countUnit }}</span>
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
        </SessionBar>

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
                { value: Math.round(articleSummary.cpm), unit: 'WPM', label: '速度' },
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
  animation: ui-fade-up 220ms var(--ease);
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
.setup-start {
  flex: none;
}
.setup-progress {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  min-width: 0;
}
.setup-progress-label {
  color: var(--ink-4);
  font-size: var(--text-xs);
  white-space: nowrap;
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
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--surface-2) 55%, var(--surface));
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: var(--text-base);
  line-height: 1.75;
  transition: border-color var(--dur-fast), box-shadow var(--dur-fast), background var(--dur-fast);
  animation: ui-fade-in 180ms var(--ease);
}
.article-input::placeholder {
  color: var(--ink-4);
}
.article-input:focus {
  outline: none;
  border-color: var(--brand);
  background: var(--surface);
  box-shadow: 0 0 0 3px var(--brand-soft);
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
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--surface-2) 55%, var(--surface));
  color: var(--ink-3);
  text-align: center;
  cursor: pointer;
  transition: border-color var(--dur-fast), background var(--dur-fast), box-shadow var(--dur-fast);
  animation: ui-fade-in 180ms var(--ease);
}
.article-drop:hover,
.article-drop.is-drag {
  border-color: var(--brand);
  background: var(--brand-soft);
}
.article-drop:focus-visible {
  outline: none;
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-soft);
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
  font-size: 17px;
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
  border: 1px solid var(--line-faint);
  border-radius: var(--r-md);
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
.training-state {
  padding: 16px 18px;
  border: 1px solid var(--line-faint);
  border-radius: var(--r-md);
  background: var(--surface-2);
  color: var(--ink-3);
  font-size: var(--text-sm);
  line-height: 1.6;
}
.training-state.is-error {
  border-color: var(--danger-line);
  border-radius: var(--r-xl);
  background: var(--danger-soft);
  color: var(--danger);
}
.training-state strong {
  display: block;
  margin-bottom: 4px;
  color: var(--danger);
  font-size: var(--text-base);
  font-weight: 750;
}
.training-state p {
  margin: 0;
  color: var(--ink-2);
}
.training-state .btn {
  margin-top: 12px;
}
.setup-empty {
  margin: 0;
  padding: 24px 16px;
  border: 1px dashed var(--line);
  border-radius: var(--r-md);
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
  max-width: 1080px;
  margin: 0 auto;
  padding: 14px 20px 0;
  display: flex;
  flex-direction: column;
  animation: ui-fade-up 220ms var(--ease);
}
.article-summary-wrap {
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
  overflow-y: auto;
  scrollbar-gutter: stable;
  display: flex;
  align-items: flex-start;
  justify-content: center;
}
.article-summary-wrap > * {
  max-width: 860px;
}

@media (max-width: 1050px) and (min-width: 981px) {
  .training-config {
    grid-template-columns: minmax(0, 1.15fr) minmax(340px, 0.95fr);
  }
}

@media (max-width: 980px) {
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
  .article-summary-wrap {
    padding: 12px 2px calc(18px + env(safe-area-inset-bottom));
  }
}
</style>
