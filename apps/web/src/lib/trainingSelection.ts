/**
 * 练习场选择的纯逻辑（无 Vue / Pinia 依赖，可独立单测）：
 * 配置解析与裁剪、组态（含「全拼沿用」胶囊）、焦点/隐藏候选与组态、已学原子、
 * 课程总结卡预设、作用域快照与映射行。
 *
 * 响应式状态与持久化在 composables/useTrainingSelection.ts。
 */
import {
  atomId,
  parseAtomId,
  type AtomId,
  type LessonDef,
  type LessonProgress,
  type TrainingAtomOptions,
  type TrainingCommonAtoms,
  type TrainingScope,
} from '@shuangpin/core'
import {
  STORAGE_KEYS,
  readJSON,
  readString,
  writeJSON,
  writeString,
  type StorageLike,
} from './storage'

export type TrainingTab = 'drill' | 'article'
export type TrainingInputMode = 'input' | 'import'
export type AtomKind = 'initial' | 'final' | 'zero'
/** 选择作用域：出现（专项/文章共用的范围）/ 专项隐藏 / 文章隐藏 */
export type SelectionScope = 'appear' | 'drill' | 'article'
export type SelectionGroup = 'initial' | 'final' | 'zero'
/** 方案可选声母/韵母/零声母音节（来自 core atomOptionsOf） */
export type AtomOptions = TrainingAtomOptions

export interface AtomSet {
  initials: ReadonlySet<string>
  finals: ReadonlySet<string>
  zeroFinals: ReadonlySet<string>
}

export interface TrainingConfigSnapshot {
  tab: TrainingTab
  articleInputMode: TrainingInputMode
  selectedInitials: string[]
  selectedFinals: string[]
  selectedZeroFinals: string[]
  focusInitials: string[]
  focusFinals: string[]
  focusZeroFinals: string[]
  hiddenInitials: string[]
  hiddenFinals: string[]
  hiddenZeroFinals: string[]
  articleHiddenInitials: string[]
  articleHiddenFinals: string[]
  articleHiddenZeroFinals: string[]
}

/** 一个组的选中状态：普通 chip 数量 + 可选 1 个「全拼沿用」胶囊。 */
export interface GroupState {
  selected: number
  total: number
  all: boolean
  indeterminate: boolean
}

interface CommonEntry {
  kind: AtomKind
  value: string
}

export interface HiddenSnapshot {
  atomIds: AtomId[]
  labels: string[]
  count: number
  title: string
}

interface PresetSelection {
  selectedInitials: string[]
  selectedFinals: string[]
  selectedZeroFinals: string[]
  hiddenInitials: string[]
  hiddenFinals: string[]
  hiddenZeroFinals: string[]
  /** 课程带入的焦点；没有时沿用当前焦点（如「已学」只改出现范围）。 */
  focusInitials?: string[]
  focusFinals?: string[]
  focusZeroFinals?: string[]
}

interface TrainingPreset {
  from: string
  stage: 'single' | 'word' | 'exam'
  scheme: string
}

// ── 集合构造 ─────────────────────────────────────────────────

export function emptyAtomSet(): AtomSet {
  return { initials: new Set(), finals: new Set(), zeroFinals: new Set() }
}

export function atomSetOf(
  initials: ReadonlySet<string>,
  finals: ReadonlySet<string>,
  zeroFinals: ReadonlySet<string>,
): AtomSet {
  return { initials, finals, zeroFinals }
}

/** 训练场的选中集合（出现 / 焦点 / 专项隐藏 / 文章隐藏）。 */
export interface ScopedSets {
  appear: AtomSet
  /** 专项至少命中一个的焦点原子；空集合表示不限。 */
  focus: AtomSet
  drill: AtomSet
  article: AtomSet
}


// ── 组选状态 ─────────────────────────────────────────────────

export function groupStateOf(
  specificSelected: number,
  specificCount: number,
  hasCapsule: boolean,
  capsuleSelected: boolean,
): GroupState {
  const total = specificCount + (hasCapsule ? 1 : 0)
  const selected = specificSelected + (hasCapsule && capsuleSelected ? 1 : 0)
  return {
    selected,
    total,
    all: total > 0 && selected === total,
    indeterminate: selected > 0 && selected < total,
  }
}

// ── 配置解析 / 裁剪 ──────────────────────────────────────────

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

/** 解析持久化配置；损坏/缺省返回 null，由调用方回退默认全选。 */
export function parseTrainingConfig(raw: unknown): TrainingConfigSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const value = raw as Partial<TrainingConfigSnapshot>
  return {
    tab: value.tab === 'article' ? 'article' : 'drill',
    articleInputMode: value.articleInputMode === 'import' ? 'import' : 'input',
    selectedInitials: stringList(value.selectedInitials),
    selectedFinals: stringList(value.selectedFinals),
    selectedZeroFinals: stringList(value.selectedZeroFinals),
    focusInitials: stringList(value.focusInitials),
    focusFinals: stringList(value.focusFinals),
    focusZeroFinals: stringList(value.focusZeroFinals),
    hiddenInitials: stringList(value.hiddenInitials),
    hiddenFinals: stringList(value.hiddenFinals),
    hiddenZeroFinals: stringList(value.hiddenZeroFinals),
    articleHiddenInitials: stringList(value.articleHiddenInitials),
    articleHiddenFinals: stringList(value.articleHiddenFinals),
    articleHiddenZeroFinals: stringList(value.articleHiddenZeroFinals),
  }
}

/** 把持久化配置裁剪到当前方案实际存在的原子上（隐藏项还要属于出现集合）。 */
export function sanitizeTrainingConfig(
  config: TrainingConfigSnapshot,
  options: AtomOptions,
): TrainingConfigSnapshot {
  const allowedInitials = new Set(options.initials)
  const allowedFinals = new Set(options.finals)
  const allowedZeros = new Set(options.zeroFinals)
  const selectedInitials = config.selectedInitials.filter((item) => allowedInitials.has(item))
  const selectedFinals = config.selectedFinals.filter((item) => allowedFinals.has(item))
  const selectedZeroFinals = config.selectedZeroFinals.filter((item) => allowedZeros.has(item))
  const selectedInitialSet = new Set(selectedInitials)
  const selectedFinalSet = new Set(selectedFinals)
  const selectedZeroSet = new Set(selectedZeroFinals)
  return {
    tab: config.tab,
    articleInputMode: config.articleInputMode,
    selectedInitials,
    selectedFinals,
    selectedZeroFinals,
    focusInitials: config.focusInitials.filter(
      (item) => allowedInitials.has(item) && selectedInitialSet.has(item),
    ),
    focusFinals: config.focusFinals.filter(
      (item) => allowedFinals.has(item) && selectedFinalSet.has(item),
    ),
    focusZeroFinals: config.focusZeroFinals.filter(
      (item) => allowedZeros.has(item) && selectedZeroSet.has(item),
    ),
    hiddenInitials: config.hiddenInitials.filter(
      (item) => allowedInitials.has(item) && selectedInitialSet.has(item),
    ),
    hiddenFinals: config.hiddenFinals.filter(
      (item) => allowedFinals.has(item) && selectedFinalSet.has(item),
    ),
    hiddenZeroFinals: config.hiddenZeroFinals.filter(
      (item) => allowedZeros.has(item) && selectedZeroSet.has(item),
    ),
    articleHiddenInitials: config.articleHiddenInitials.filter((item) => allowedInitials.has(item)),
    articleHiddenFinals: config.articleHiddenFinals.filter((item) => allowedFinals.has(item)),
    articleHiddenZeroFinals: config.articleHiddenZeroFinals.filter((item) => allowedZeros.has(item)),
  }
}

// ── 可选原子 / 全拼沿用 ──────────────────────────────────────

/** 普通 chip 候选：方案原子去掉「全拼沿用」胶囊覆盖的 free 原子。 */
export function selectableAtomsOf(
  options: AtomOptions,
  common: TrainingCommonAtoms,
): AtomOptions {
  const commonInitials = new Set(common.initials)
  const commonFinals = new Set(common.finals)
  const commonZeros = new Set(common.zeroFinals)
  return {
    initials: options.initials.filter((item) => !commonInitials.has(item)),
    finals: options.finals.filter((item) => !commonFinals.has(item)),
    zeroFinals: options.zeroFinals.filter((item) => !commonZeros.has(item)),
  }
}

export function commonEntriesOf(common: TrainingCommonAtoms): CommonEntry[] {
  return [
    ...common.initials.map((value) => ({ kind: 'initial' as const, value })),
    ...common.finals.map((value) => ({ kind: 'final' as const, value })),
    ...common.zeroFinals.map((value) => ({ kind: 'zero' as const, value })),
  ]
}

function groupEntries(entries: readonly CommonEntry[], group: SelectionGroup): CommonEntry[] {
  return entries.filter((entry) =>
    group === 'zero' ? entry.kind === 'zero' : entry.kind === group,
  )
}

/** 某作用域某组可用的「全拼沿用」原子；专项隐藏只显示出现范围里选中的公共原子。 */
export function commonEntriesFor(
  common: TrainingCommonAtoms,
  scope: SelectionScope,
  group: SelectionGroup,
  appearSelected: AtomSet,
): CommonEntry[] {
  const entries = groupEntries(commonEntriesOf(common), group)
  if (scope !== 'drill') return entries
  return entries.filter((entry) => selectedSetOf(appearSelected, entry.kind).has(entry.value))
}

export function commonCapsuleCountOf(entries: readonly CommonEntry[]): number {
  return entries.length > 0 ? 1 : 0
}

export function commonAllChecked(
  common: TrainingCommonAtoms,
  scope: SelectionScope,
  group: SelectionGroup,
  sets: ScopedSets,
): boolean {
  const entries = commonEntriesFor(common, scope, group, sets.appear)
  const scoped = scopeSetsFor(sets, scope)
  return (
    entries.length > 0 &&
    entries.every((entry) => selectedSetOf(scoped, entry.kind).has(entry.value))
  )
}

function selectedSetOf(set: AtomSet, kind: AtomKind): ReadonlySet<string> {
  if (kind === 'initial') return set.initials
  if (kind === 'final') return set.finals
  return set.zeroFinals
}

/** 作用域 → 该作用域的三组集合 */
export function scopeSetsFor(sets: ScopedSets, scope: SelectionScope): AtomSet {
  return scope === 'appear' ? sets.appear : scope === 'drill' ? sets.drill : sets.article
}

// ── 隐藏候选 / 组态 ─────────────────────────────────────────

/** 隐藏候选项：专项只列出现范围内选中的非公共原子；文章列全部普通候选。 */
export function hiddenCandidatesOf(
  scope: 'drill' | 'article',
  options: AtomOptions,
  common: TrainingCommonAtoms,
  appearSelected: AtomSet,
): AtomOptions {
  if (scope === 'article') return selectableAtomsOf(options, common)
  const commonInitials = new Set(common.initials)
  const commonFinals = new Set(common.finals)
  const commonZeros = new Set(common.zeroFinals)
  return {
    initials: options.initials.filter(
      (item) => appearSelected.initials.has(item) && !commonInitials.has(item),
    ),
    finals: options.finals.filter(
      (item) => appearSelected.finals.has(item) && !commonFinals.has(item),
    ),
    zeroFinals: options.zeroFinals.filter(
      (item) => appearSelected.zeroFinals.has(item) && !commonZeros.has(item),
    ),
  }
}

/** 焦点候选：出现范围内已选中的非全拼原子（与专项隐藏候选同一集合）。 */
export function focusCandidatesOf(
  options: AtomOptions,
  common: TrainingCommonAtoms,
  appearSelected: AtomSet,
): AtomOptions {
  return hiddenCandidatesOf('drill', options, common, appearSelected)
}

/** 焦点原子 id 列表，供训练过滤使用。 */
export function focusAtomIdsOf(focus: AtomSet): AtomId[] {
  return atomIdsOf(focus)
}

function candidateList(candidates: AtomOptions, group: SelectionGroup): readonly string[] {
  return group === 'initial'
    ? candidates.initials
    : group === 'final'
      ? candidates.finals
      : candidates.zeroFinals
}

export function hiddenGroupStateOf(input: {
  scope: 'drill' | 'article'
  group: SelectionGroup
  options: AtomOptions
  common: TrainingCommonAtoms
  sets: ScopedSets
}): GroupState {
  const { scope, group, options, common, sets } = input
  const candidates = candidateList(
    hiddenCandidatesOf(scope, options, common, sets.appear),
    group,
  )
  const hidden = selectedSetOf(scopeSetsFor(sets, scope), group)
  return groupStateOf(
    candidates.filter((item) => hidden.has(item)).length,
    candidates.length,
    commonCapsuleCountOf(commonEntriesFor(common, scope, group, sets.appear)) > 0,
    commonAllChecked(common, scope, group, sets),
  )
}

/** 焦点的分组选中状态（焦点没有「全拼沿用」胶囊）。 */
export function focusGroupStateOf(input: {
  group: SelectionGroup
  focus: AtomSet
  candidates: AtomOptions
}): GroupState {
  const { group, focus, candidates } = input
  const list = candidateList(candidates, group)
  const selected = selectedSetOf(focus, group)
  return groupStateOf(list.filter((item) => selected.has(item)).length, list.length, false, false)
}

/** 收缩集合：专项隐藏与焦点只保留仍在出现范围里的项，文章隐藏只保留合法原子。 */
export function shrinkScopedSets(sets: ScopedSets, options: AtomOptions): ScopedSets {
  const drill = {
    initials: new Set([...sets.drill.initials].filter((item) => sets.appear.initials.has(item))),
    finals: new Set([...sets.drill.finals].filter((item) => sets.appear.finals.has(item))),
    zeroFinals: new Set(
      [...sets.drill.zeroFinals].filter((item) => sets.appear.zeroFinals.has(item)),
    ),
  }
  const article = {
    initials: new Set(
      [...sets.article.initials].filter((item) => options.initials.includes(item)),
    ),
    finals: new Set([...sets.article.finals].filter((item) => options.finals.includes(item))),
    zeroFinals: new Set(
      [...sets.article.zeroFinals].filter((item) => options.zeroFinals.includes(item)),
    ),
  }
  const focus = {
    initials: new Set([...sets.focus.initials].filter((item) => sets.appear.initials.has(item))),
    finals: new Set([...sets.focus.finals].filter((item) => sets.appear.finals.has(item))),
    zeroFinals: new Set(
      [...sets.focus.zeroFinals].filter((item) => sets.appear.zeroFinals.has(item)),
    ),
  }
  return { appear: sets.appear, focus, drill, article }
}

// ── 作用域快照 ───────────────────────────────────────────────

export function trainingScopeOf(selected: AtomSet): TrainingScope {
  return {
    initials: [...selected.initials],
    finals: [...selected.finals],
    zeroFinals: [...selected.zeroFinals],
  }
}

function atomIdsOf(selected: AtomSet): AtomId[] {
  return [
    ...[...selected.initials].map((item) => atomId('initial', item)),
    ...[...selected.finals].map((item) => atomId('final', item)),
    ...[...selected.zeroFinals].map((item) => atomId('zero', item)),
  ]
}

function hiddenLabelsOf(selected: AtomSet): string[] {
  return [
    ...[...selected.initials].map((item) => `声母 ${item}`),
    ...[...selected.finals].map((item) => `韵母 ${item}`),
    ...[...selected.zeroFinals].map((item) => `零声母 ${item}`),
  ]
}

/** 开始练习时冻结的隐藏快照：会话中再改设置不影响本局。 */
export function hiddenSnapshotOf(selected: AtomSet): HiddenSnapshot {
  const labels = hiddenLabelsOf(selected)
  return {
    atomIds: atomIdsOf(selected),
    labels,
    count: labels.length,
    title: labels.length > 0 ? `已隐藏：${labels.join('、')}` : '',
  }
}

// ── 已学原子 / 课程预设 ──────────────────────────────────────

/** 已通过课程的 focus 原子累计。 */
export function passedFocusAtomsOf(
  lessons: readonly LessonDef[],
  progress: Readonly<Record<string, LessonProgress>>,
): AtomSet {
  const initials = new Set<string>()
  const finals = new Set<string>()
  const zeroFinals = new Set<string>()
  for (const lesson of lessons) {
    if (!progress[lesson.id]?.passed) continue
    for (const id of lesson.focusAtoms) {
      const ref = parseAtomId(id)
      if (!ref) continue
      if (ref.type === 'initial') initials.add(ref.key)
      else if (ref.type === 'final') finals.add(ref.key)
      else zeroFinals.add(ref.key)
    }
  }
  return { initials, finals, zeroFinals }
}

/** 「选中已学」：全部全拼沿用 + 已通过课程的 focus 原子。 */
export function learnedSelectionOf(input: {
  lessons: readonly LessonDef[]
  progress: Readonly<Record<string, LessonProgress>>
  common: TrainingCommonAtoms
  options: AtomOptions
}): PresetSelection {
  const { lessons, progress, common, options } = input
  const passed = passedFocusAtomsOf(lessons, progress)
  const initialKeys = new Set(options.initials)
  const finalKeys = new Set(options.finals)
  const zeroKeys = new Set(options.zeroFinals)
  const initialSet = new Set(common.initials.filter((item) => initialKeys.has(item)))
  const finalSet = new Set(common.finals.filter((item) => finalKeys.has(item)))
  const zeroSet = new Set(common.zeroFinals.filter((item) => zeroKeys.has(item)))
  for (const item of passed.initials) if (initialKeys.has(item)) initialSet.add(item)
  for (const item of passed.finals) if (finalKeys.has(item)) finalSet.add(item)
  for (const item of passed.zeroFinals) if (zeroKeys.has(item)) zeroSet.add(item)
  return {
    selectedInitials: [...initialSet],
    selectedFinals: [...finalSet],
    selectedZeroFinals: [...zeroSet],
    hiddenInitials: [],
    hiddenFinals: [],
    hiddenZeroFinals: [],
  }
}

/** 两个 AtomSet 的三组集合是否完全相等。 */
function atomSetsEqual(left: AtomSet, right: AtomSet): boolean {
  const same = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean =>
    a.size === b.size && [...a].every((item) => b.has(item))
  return (
    same(left.initials, right.initials) &&
    same(left.finals, right.finals) &&
    same(left.zeroFinals, right.zeroFinals)
  )
}

/** 当前出现范围是否已经等于「已学」会得到的范围（焦点 / 隐藏不影响按钮）。 */
export function learnedSelectionApplied(input: {
  lessons: readonly LessonDef[]
  progress: Readonly<Record<string, LessonProgress>>
  common: TrainingCommonAtoms
  options: AtomOptions
  current: AtomSet
}): boolean {
  const learned = learnedSelectionOf({
    lessons: input.lessons,
    progress: input.progress,
    common: input.common,
    options: input.options,
  })
  return atomSetsEqual(input.current, {
    initials: new Set(learned.selectedInitials),
    finals: new Set(learned.selectedFinals),
    zeroFinals: new Set(learned.selectedZeroFinals),
  })
}

/**
 * 从课程总结卡 / 顶栏「进入练习」跳转来的预设：
 * - 出现范围 = 全拼沿用 ∪ 到本课为止学过的原子（零声母同样包含全拼沿用）；
 * - 隐藏 = exam 隐藏全部出现项，word 隐藏本课新学映射，single 不隐藏。
 */
export function presetSelectionOf(input: {
  lesson: LessonDef
  lessons: readonly LessonDef[]
  stage: 'single' | 'word' | 'exam'
  common: TrainingCommonAtoms
  options: AtomOptions
}): PresetSelection {
  const { lesson, lessons, stage, common, options } = input
  const currentIndex = lessons.findIndex((item) => item.id === lesson.id)
  const lastIndex = currentIndex >= 0 ? currentIndex : lessons.length - 1
  const allowed = {
    initials: new Set(options.initials),
    finals: new Set(options.finals),
    zeroFinals: new Set(options.zeroFinals),
  }
  const learned = { initials: new Set<string>(), finals: new Set<string>(), zeros: new Set<string>() }
  for (let index = 0; index <= lastIndex; index += 1) {
    const item = lessons[index]
    if (!item) continue
    for (const id of item.focusAtoms) {
      const ref = parseAtomId(id)
      if (!ref) continue
      if (ref.type === 'initial') learned.initials.add(ref.key)
      else if (ref.type === 'final') learned.finals.add(ref.key)
      else learned.zeros.add(ref.key)
    }
  }
  const focus = { initials: new Set<string>(), finals: new Set<string>(), zeros: new Set<string>() }
  for (const id of lesson.focusAtoms) {
    const ref = parseAtomId(id)
    if (!ref) continue
    if (ref.type === 'initial') focus.initials.add(ref.key)
    else if (ref.type === 'final') focus.finals.add(ref.key)
    else focus.zeros.add(ref.key)
  }

  const selectedInitials = [...new Set([...common.initials, ...learned.initials])].filter((item) =>
    allowed.initials.has(item),
  )
  const selectedFinals = [...new Set([...common.finals, ...learned.finals])].filter((item) =>
    allowed.finals.has(item),
  )
  const selectedZeroFinals = [...new Set([...common.zeroFinals, ...learned.zeros])].filter((item) =>
    allowed.zeroFinals.has(item),
  )
  const selectedInitialSet = new Set(selectedInitials)
  const selectedFinalSet = new Set(selectedFinals)
  const selectedZeroSet = new Set(selectedZeroFinals)

  const hideAll = stage === 'exam'
  const hideFocus = stage === 'word' || hideAll
  return {
    selectedInitials,
    selectedFinals,
    selectedZeroFinals,
    hiddenInitials: hideAll
      ? selectedInitials
      : hideFocus
        ? [...focus.initials].filter((item) => selectedInitialSet.has(item))
        : [],
    hiddenFinals: hideAll
      ? selectedFinals
      : hideFocus
        ? [...focus.finals].filter((item) => selectedFinalSet.has(item))
        : [],
    hiddenZeroFinals: hideAll
      ? selectedZeroFinals
      : hideFocus
        ? [...focus.zeros].filter((item) => selectedZeroSet.has(item))
        : [],
    focusInitials: [...focus.initials].filter((item) => selectedInitialSet.has(item)),
    focusFinals: [...focus.finals].filter((item) => selectedFinalSet.has(item)),
    focusZeroFinals: [...focus.zeros].filter((item) => selectedZeroSet.has(item)),
  }
}

/** 解析一次性预设；非法/缺字段返回 null。 */
export function parseTrainingPreset(raw: string | null): TrainingPreset | null {
  if (!raw) return null
  let parsed: { from?: unknown; stage?: unknown; scheme?: unknown }
  try {
    parsed = JSON.parse(raw) as { from?: unknown; stage?: unknown; scheme?: unknown }
  } catch {
    return null
  }
  const from = typeof parsed.from === 'string' ? parsed.from : ''
  const stage = typeof parsed.stage === 'string' ? parsed.stage : ''
  const scheme = typeof parsed.scheme === 'string' ? parsed.scheme : ''
  if (!from || (stage !== 'single' && stage !== 'word' && stage !== 'exam')) return null
  return { from, stage, scheme }
}

// ── 集合更新（纯函数，供响应式层写回 ref） ────────────────────

export function emptyScopedSets(): ScopedSets {
  return {
    appear: emptyAtomSet(),
    focus: emptyAtomSet(),
    drill: emptyAtomSet(),
    article: emptyAtomSet(),
  }
}

function atomSetFromOptions(options: AtomOptions): AtomSet {
  return {
    initials: new Set(options.initials),
    finals: new Set(options.finals),
    zeroFinals: new Set(options.zeroFinals),
  }
}

function withKind(set: AtomSet, kind: AtomKind, next: ReadonlySet<string>): AtomSet {
  if (kind === 'initial') return { ...set, initials: next }
  if (kind === 'final') return { ...set, finals: next }
  return { ...set, zeroFinals: next }
}

function toggleSetValue(current: ReadonlySet<string>, value: string): ReadonlySet<string> {
  const next = new Set(current)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

export function toggleAtomSet(set: AtomSet, kind: AtomKind, value: string): AtomSet {
  return withKind(set, kind, toggleSetValue(selectedSetOf(set, kind), value))
}

export function isEmptyAtomSet(set: AtomSet): boolean {
  return set.initials.size === 0 && set.finals.size === 0 && set.zeroFinals.size === 0
}

/**
 * 出现范围「新增的原子」（含全拼沿用）：所有主动扩大出现范围的入口（单项勾选、组内全选、
 * 全拼沿用胶囊、「已学」）都用这一份 diff 作为联动唯一口径。
 * - 专项隐藏：新增项全部同步（全拼沿用胶囊也算「新增的映射」）；
 * - 焦点：只取其中的普通键位（全拼沿用不能作为焦点，见 selectableSubsetOfAtoms）。
 */
export function addedAppearanceAtoms(input: { previous: AtomSet; next: AtomSet }): AtomSet {
  const addedIn = (
    previous: ReadonlySet<string>,
    next: ReadonlySet<string>,
  ): ReadonlySet<string> => new Set([...next].filter((item) => !previous.has(item)))
  return {
    initials: addedIn(input.previous.initials, input.next.initials),
    finals: addedIn(input.previous.finals, input.next.finals),
    zeroFinals: addedIn(input.previous.zeroFinals, input.next.zeroFinals),
  }
}

/** 把集合裁剪为「可选普通原子」（去掉全拼沿用），用于焦点方向的联动。 */
export function selectableSubsetOfAtoms(
  set: AtomSet,
  options: AtomOptions,
  common: TrainingCommonAtoms,
): AtomSet {
  const selectable = selectableAtomsOf(options, common)
  const initials = new Set(selectable.initials)
  const finals = new Set(selectable.finals)
  const zeroFinals = new Set(selectable.zeroFinals)
  return {
    initials: new Set([...set.initials].filter((item) => initials.has(item))),
    finals: new Set([...set.finals].filter((item) => finals.has(item))),
    zeroFinals: new Set([...set.zeroFinals].filter((item) => zeroFinals.has(item))),
  }
}

/** 把新增原子并入集合；没有任何新增时返回原对象，保持下游派生引用稳定。 */
export function withAddedAtoms(current: AtomSet, added: AtomSet): AtomSet {
  if (isEmptyAtomSet(added)) return current
  const merge = (base: ReadonlySet<string>, extra: ReadonlySet<string>): ReadonlySet<string> =>
    extra.size === 0 ? base : new Set([...base, ...extra])
  return {
    initials: merge(current.initials, added.initials),
    finals: merge(current.finals, added.finals),
    zeroFinals: merge(current.zeroFinals, added.zeroFinals),
  }
}

/** 出现组「全选 / 清除」：整组原子（普通 + 全拼沿用）一次写回。 */
function selectGroupSet(input: {
  group: SelectionGroup
  options: AtomOptions
  common: TrainingCommonAtoms
  current: AtomSet
}): AtomSet {
  const { group, options, common, current } = input
  const selectable = selectableAtomsOf(options, common)
  const list =
    group === 'initial'
      ? [...common.initials, ...selectable.initials]
      : group === 'final'
        ? [...common.finals, ...selectable.finals]
        : [...common.zeroFinals, ...selectable.zeroFinals]
  return withKind(current, group, new Set(list))
}

function clearGroupSet(current: AtomSet, group: SelectionGroup): AtomSet {
  return withKind(current, group, new Set())
}

/** 出现组态（普通 chip + 全拼沿用胶囊）。 */
export function appearGroupStateOf(input: {
  group: SelectionGroup
  options: AtomOptions
  common: TrainingCommonAtoms
  sets: ScopedSets
}): GroupState {
  const { group, options, common, sets } = input
  const candidates = candidateList(selectableAtomsOf(options, common), group)
  const selected = selectedSetOf(sets.appear, group)
  return groupStateOf(
    candidates.filter((item) => selected.has(item)).length,
    candidates.length,
    commonCapsuleCountOf(commonEntriesFor(common, 'appear', group, sets.appear)) > 0,
    commonAllChecked(common, 'appear', group, sets),
  )
}

/** 全拼沿用胶囊切换：只更新该作用域该组对应的公共原子。 */
export function toggleCommonSelection(input: {
  scope: SelectionScope
  group: SelectionGroup
  common: TrainingCommonAtoms
  sets: ScopedSets
}): ScopedSets {
  const { scope, group, common, sets } = input
  const entries = commonEntriesFor(common, scope, group, sets.appear)
  const add = !commonAllChecked(common, scope, group, sets)
  let next = scopeSetsFor(sets, scope)
  for (const kind of ['initial', 'final', 'zero'] as const) {
    const current = selectedSetOf(next, kind)
    const updated = new Set(current)
    for (const entry of entries) {
      if (entry.kind !== kind) continue
      if (add) updated.add(entry.value)
      else updated.delete(entry.value)
    }
    next = withKind(next, kind, updated)
  }
  return scope === 'appear' ? { ...sets, appear: next } : scope === 'drill' ? { ...sets, drill: next } : { ...sets, article: next }
}

/** 隐藏组「全选 / 清除」：目标组候选 + 全拼沿用胶囊一起处理，返回该作用域新集合。 */
export function applyHiddenGroupSelection(input: {
  scope: 'drill' | 'article'
  group: SelectionGroup
  selected: boolean
  options: AtomOptions
  common: TrainingCommonAtoms
  sets: ScopedSets
}): AtomSet {
  const { scope, group, selected, options, common, sets } = input
  const candidates = candidateList(hiddenCandidatesOf(scope, options, common, sets.appear), group)
  let next = withKind(scopeSetsFor(sets, scope), group, selected ? new Set(candidates) : new Set())
  for (const entry of commonEntriesFor(common, scope, group, sets.appear)) {
    const current = selectedSetOf(next, entry.kind)
    if (current.has(entry.value) === selected) continue
    const updated = new Set(current)
    if (selected) updated.add(entry.value)
    else updated.delete(entry.value)
    next = withKind(next, entry.kind, updated)
  }
  return next
}

// ── 配置快照 / 预设写回 ──────────────────────────────────────

export function configSnapshotOf(input: {
  tab: TrainingTab
  articleInputMode: TrainingInputMode
  sets: ScopedSets
}): TrainingConfigSnapshot {
  const { tab, articleInputMode, sets } = input
  return {
    tab,
    articleInputMode,
    selectedInitials: [...sets.appear.initials],
    selectedFinals: [...sets.appear.finals],
    selectedZeroFinals: [...sets.appear.zeroFinals],
    focusInitials: [...sets.focus.initials],
    focusFinals: [...sets.focus.finals],
    focusZeroFinals: [...sets.focus.zeroFinals],
    hiddenInitials: [...sets.drill.initials],
    hiddenFinals: [...sets.drill.finals],
    hiddenZeroFinals: [...sets.drill.zeroFinals],
    articleHiddenInitials: [...sets.article.initials],
    articleHiddenFinals: [...sets.article.finals],
    articleHiddenZeroFinals: [...sets.article.zeroFinals],
  }
}

export function setsOfConfig(config: TrainingConfigSnapshot): ScopedSets {
  return {
    appear: atomSetOf(
      new Set(config.selectedInitials),
      new Set(config.selectedFinals),
      new Set(config.selectedZeroFinals),
    ),
    focus: atomSetOf(
      new Set(config.focusInitials),
      new Set(config.focusFinals),
      new Set(config.focusZeroFinals),
    ),
    drill: atomSetOf(
      new Set(config.hiddenInitials),
      new Set(config.hiddenFinals),
      new Set(config.hiddenZeroFinals),
    ),
    article: atomSetOf(
      new Set(config.articleHiddenInitials),
      new Set(config.articleHiddenFinals),
      new Set(config.articleHiddenZeroFinals),
    ),
  }
}

/** 课程预设写回：出现范围与专项隐藏替换，文章隐藏保持不变。 */
export function setsOfPreset(preset: PresetSelection, current: ScopedSets): ScopedSets {
  return {
    appear: atomSetOf(
      new Set(preset.selectedInitials),
      new Set(preset.selectedFinals),
      new Set(preset.selectedZeroFinals),
    ),
    focus:
      preset.focusInitials === undefined
        ? current.focus
        : atomSetOf(
            new Set(preset.focusInitials),
            new Set(preset.focusFinals ?? []),
            new Set(preset.focusZeroFinals ?? []),
          ),
    drill: atomSetOf(
      new Set(preset.hiddenInitials),
      new Set(preset.hiddenFinals),
      new Set(preset.hiddenZeroFinals),
    ),
    article: current.article,
  }
}

// ── 整组操作 / 存储读写（供响应式层薄调用） ───────────────────

export function selectAllSets(current: ScopedSets, options: AtomOptions): ScopedSets {
  return { ...current, appear: atomSetFromOptions(options) }
}

export function selectGroupSets(input: {
  group: SelectionGroup
  options: AtomOptions
  common: TrainingCommonAtoms
  current: ScopedSets
}): ScopedSets {
  const { group, options, common, current } = input
  return {
    ...current,
    appear: selectGroupSet({ group, options, common, current: current.appear }),
  }
}

export function clearGroupSets(current: ScopedSets, group: SelectionGroup): ScopedSets {
  return { ...current, appear: clearGroupSet(current.appear, group) }
}

/**
 * 「选中已学」：把出现范围与已学集合对齐。
 * - 移除已选但未学的原子；
 * - 加入已学但未选的原子，并把新增项同步选中到专项隐藏（含全拼沿用）、
 *   其中普通键位同时同步到焦点；
 * - 仍在出现范围内的焦点 / 隐藏保留，范围外的由 shrink 自动收缩。
 */
export function learnedSelectionSets(input: {
  lessons: readonly LessonDef[]
  progress: Readonly<Record<string, LessonProgress>>
  common: TrainingCommonAtoms
  options: AtomOptions
  current: ScopedSets
}): ScopedSets {
  const learned = learnedSelectionOf({
    lessons: input.lessons,
    progress: input.progress,
    common: input.common,
    options: input.options,
  })
  const nextAppear: AtomSet = {
    initials: new Set(learned.selectedInitials),
    finals: new Set(learned.selectedFinals),
    zeroFinals: new Set(learned.selectedZeroFinals),
  }
  // 与所有「新增出现原子」入口共用同一口径：专项隐藏镜像全部新增项（含全拼沿用），
  // 焦点只接收其中的普通键位。
  const added = addedAppearanceAtoms({ previous: input.current.appear, next: nextAppear })
  const focus = withAddedAtoms(
    input.current.focus,
    selectableSubsetOfAtoms(added, input.options, input.common),
  )
  const drill = withAddedAtoms(input.current.drill, added)
  return shrinkScopedSets(
    { appear: nextAppear, focus, drill, article: input.current.article },
    input.options,
  )
}

/** 读取并裁剪持久化训练配置；缺失/损坏返回 null。 */
export function readStoredTrainingConfig(
  storage: StorageLike | null | undefined,
  schemeId: string,
  options: AtomOptions,
): TrainingConfigSnapshot | null {
  const config = readJSON(STORAGE_KEYS.trainingConfig(schemeId), parseTrainingConfig, storage)
  return config ? sanitizeTrainingConfig(config, options) : null
}

export function writeStoredTrainingConfig(
  storage: StorageLike | null | undefined,
  schemeId: string,
  snapshot: TrainingConfigSnapshot,
): void {
  writeJSON(STORAGE_KEYS.trainingConfig(schemeId), snapshot, storage)
}

interface StoredTrainingPreset {
  raw: string
  preset: TrainingPreset
}

/** 取出一次性预设（读取即清除）；无预设/损坏返回 null。 */
export function takeTrainingPreset(
  storage: StorageLike | null | undefined,
): StoredTrainingPreset | null {
  const raw = readString(STORAGE_KEYS.trainingPreset, storage)
  if (!raw) return null
  try {
    storage?.removeItem(STORAGE_KEYS.trainingPreset)
  } catch {
    /* 隐私模式：预设只在本次导航内生效 */
  }
  const preset = parseTrainingPreset(raw)
  return preset ? { raw, preset } : null
}

/** 预设与当前页面方案不一致时先放回，等方案切换后重新读取。 */
export function restoreTrainingPreset(
  storage: StorageLike | null | undefined,
  raw: string,
): void {
  writeString(STORAGE_KEYS.trainingPreset, raw, storage)
}
