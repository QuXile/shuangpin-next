/**
 * 练习场设置响应式层：出现范围 / 焦点 / 隐藏映射 / 组选 / 全拼沿用胶囊 / 课程预设 / 持久化。
 * 纯逻辑（组态、配置、候选、已学原子、预设、集合更新、存储读写）在 lib/trainingSelection.ts。
 */
import { computed, getCurrentScope, onScopeDispose, ref, watch } from 'vue'
import { atomOptionsOf, freeTrainingAtoms } from '@shuangpin/core'
import { getStorage } from '@/lib/storage'
import { useCourseStore } from '@/stores/course'
import {
  applyHiddenGroupSelection,
  appearGroupStateOf,
  atomSetOf,
  clearGroupSets,
  commonAllChecked as commonAllCheckedPure,
  commonCapsuleCountOf,
  commonEntriesFor as commonEntriesForPure,
  commonEntriesOf,
  configSnapshotOf,
  emptyScopedSets,
  focusAtomIdsOf,
  focusCandidatesOf,
  focusGroupStateOf,
  groupStateOf,
  hiddenCandidatesOf as hiddenCandidatesOfPure,
  hiddenGroupStateOf,
  hiddenSnapshotOf,
  learnedSelectionApplied,
  learnedSelectionSets,
  presetSelectionOf,
  readStoredTrainingConfig,
  restoreTrainingPreset,
  scopeSetsFor,
  selectAllSets,
  selectGroupSets,
  selectableAtomsOf,
  setsOfConfig,
  setsOfPreset,
  shrinkScopedSets,
  takeTrainingPreset,
  toggleAtomSet,
  toggleCommonSelection,
  trainingScopeOf,
  writeStoredTrainingConfig,
  type AtomOptions, type AtomSet, type GroupState,
  type HiddenSnapshot, type ScopedSets, type SelectionGroup,
  type SelectionScope, type TrainingInputMode, type TrainingTab,
} from '@/lib/trainingSelection'

const EMPTY_ATOMS: AtomOptions = { initials: [], finals: [], zeroFinals: [] }
const newSet = (): Set<string> => new Set<string>()
const sameSet = (left: ReadonlySet<string>, right: ReadonlySet<string>): boolean =>
  left.size === right.size && [...left].every((item) => right.has(item))
export function useTrainingSelection() {
  const course = useCourseStore()
  const local = getStorage('local')
  const presetStorage = getStorage('session')

  const tab = ref<TrainingTab>('drill')
  const articleInputMode = ref<TrainingInputMode>('input')
  const selectedInitials = ref<ReadonlySet<string>>(newSet())
  const selectedFinals = ref<ReadonlySet<string>>(newSet())
  const selectedZeroFinals = ref<ReadonlySet<string>>(newSet())
  const focusInitials = ref<ReadonlySet<string>>(newSet())
  const focusFinals = ref<ReadonlySet<string>>(newSet())
  const focusZeroFinals = ref<ReadonlySet<string>>(newSet())
  const hiddenInitials = ref<ReadonlySet<string>>(newSet())
  const hiddenFinals = ref<ReadonlySet<string>>(newSet())
  const hiddenZeroFinals = ref<ReadonlySet<string>>(newSet())
  const articleHiddenInitials = ref<ReadonlySet<string>>(newSet())
  const articleHiddenFinals = ref<ReadonlySet<string>>(newSet())
  const articleHiddenZeroFinals = ref<ReadonlySet<string>>(newSet())

  const atomOptions = computed<AtomOptions | null>(() =>
    course.scheme ? atomOptionsOf(course.scheme) : null,
  )
  const commonAtoms = computed(() =>
    course.scheme ? freeTrainingAtoms(course.scheme) : { initials: [], finals: [], zeroFinals: [] },
  )
  const selectable = computed<AtomOptions>(() =>
    atomOptions.value
      ? selectableAtomsOf(atomOptions.value, commonAtoms.value)
      : EMPTY_ATOMS,
  )
  const scopedSets = computed<ScopedSets>(() => ({
    appear: atomSetOf(selectedInitials.value, selectedFinals.value, selectedZeroFinals.value),
    focus: atomSetOf(focusInitials.value, focusFinals.value, focusZeroFinals.value),
    drill: atomSetOf(hiddenInitials.value, hiddenFinals.value, hiddenZeroFinals.value),
    article: atomSetOf(
      articleHiddenInitials.value,
      articleHiddenFinals.value,
      articleHiddenZeroFinals.value,
    ),
  }))
  const appearSet = computed(() => scopedSets.value.appear)
  const commonEntries = computed(() => commonEntriesOf(commonAtoms.value))
  const scope = computed(() => trainingScopeOf(appearSet.value))
  const passedLessonCount = computed(
    () => course.lessons.filter((lesson) => course.progress[lesson.id]?.passed).length,
  )
  /** 出现集合写回；隐藏集合由收缩 watch 统一维护 */
  function writeAppear(next: AtomSet): void {
    selectedInitials.value = next.initials; selectedFinals.value = next.finals; selectedZeroFinals.value = next.zeroFinals
  }

  /** 焦点集合写回；结构不变时不触发 ref 更新。 */
  function writeFocus(next: AtomSet): void {
    const refs = [focusInitials, focusFinals, focusZeroFinals]
    const olds = [scopedSets.value.focus.initials, scopedSets.value.focus.finals, scopedSets.value.focus.zeroFinals]
    const values = [next.initials, next.finals, next.zeroFinals]
    for (let index = 0; index < 3; index += 1) {
      if (!sameSet(olds[index]!, values[index]!)) refs[index]!.value = values[index]!
    }
  }

  /** 隐藏集合写回（仅目标作用域；结构不变时不触发 ref 更新） */
  function writeHidden(scopeKind: 'drill' | 'article', next: AtomSet): void {
    const refs =
      scopeKind === 'drill'
        ? [hiddenInitials, hiddenFinals, hiddenZeroFinals]
        : [articleHiddenInitials, articleHiddenFinals, articleHiddenZeroFinals]
    const current = scopeKind === 'drill' ? scopedSets.value.drill : scopedSets.value.article
    const values = [next.initials, next.finals, next.zeroFinals]
    const olds = [current.initials, current.finals, current.zeroFinals]
    for (let index = 0; index < 3; index += 1) {
      if (!sameSet(olds[index]!, values[index]!)) refs[index]!.value = values[index]!
    }
  }

  function applySets(next: ScopedSets): void {
    writeAppear(next.appear)
    writeFocus(next.focus)
    writeHidden('drill', next.drill)
    writeHidden('article', next.article)
  }

  const toggleInitial = (value: string): void =>
    writeAppear(toggleAtomSet(appearSet.value, 'initial', value))
  const toggleFinal = (value: string): void =>
    writeAppear(toggleAtomSet(appearSet.value, 'final', value))
  const toggleZeroFinal = (value: string): void =>
    writeAppear(toggleAtomSet(appearSet.value, 'zero', value))

  function selectAll(): void {
    if (atomOptions.value) applySets(selectAllSets(scopedSets.value, atomOptions.value))
  }

  function selectGroup(group: SelectionGroup): void {
    const options = atomOptions.value
    if (options) {
      applySets(selectGroupSets({ group, options, common: commonAtoms.value, current: scopedSets.value }))
    }
  }

  function clearGroup(group: SelectionGroup): void {
    applySets(clearGroupSets(scopedSets.value, group))
  }

  function clearAppear(): void {
    writeAppear({ initials: new Set(), finals: new Set(), zeroFinals: new Set() })
  }

  function selectLearnedAtoms(): void {
    if (!atomOptions.value) return
    applySets(
      learnedSelectionSets({
        lessons: course.lessons,
        progress: course.progress,
        common: commonAtoms.value,
        options: atomOptions.value,
        current: scopedSets.value,
      }),
    )
  }

  /** 当前出现范围已经等于「已学」范围时，按钮置灰。 */
  const learnedApplied = computed(() => {
    const options = atomOptions.value
    if (!options) return false
    return learnedSelectionApplied({
      lessons: course.lessons,
      progress: course.progress,
      common: commonAtoms.value,
      options,
      current: appearSet.value,
    })
  })

  const commonEntriesFor = (scopeKind: SelectionScope, group: SelectionGroup) =>
    commonEntriesForPure(commonAtoms.value, scopeKind, group, appearSet.value)
  const commonCapsuleCount = (scopeKind: SelectionScope, group: SelectionGroup): number =>
    commonCapsuleCountOf(commonEntriesFor(scopeKind, group))
  const commonAllChecked = (scopeKind: SelectionScope, group: SelectionGroup): boolean =>
    commonAllCheckedPure(commonAtoms.value, scopeKind, group, scopedSets.value)
  const toggleCommonAll = (scopeKind: SelectionScope, group: SelectionGroup): void =>
    applySets(
      toggleCommonSelection({
        scope: scopeKind,
        group,
        common: commonAtoms.value,
        sets: scopedSets.value,
      }),
    )

  const appearGroup = (group: SelectionGroup): GroupState =>
    atomOptions.value
      ? appearGroupStateOf({ group, options: atomOptions.value, common: commonAtoms.value, sets: scopedSets.value })
      : groupStateOf(0, 0, false, false)
  const appearInitialGroup = computed(() => appearGroup('initial'))
  const appearFinalGroup = computed(() => appearGroup('final'))
  const appearZeroGroup = computed(() => appearGroup('zero'))

  function toggleAppearAll(group: SelectionGroup): void {
    const state =
      group === 'initial'
        ? appearInitialGroup.value
        : group === 'final'
          ? appearFinalGroup.value
          : appearZeroGroup.value
    if (state.all) clearGroup(group)
    else selectGroup(group)
  }

  // ── 焦点（专项词级目标） ─────────────────────────────────
  const focusCandidates = computed<AtomOptions>(() =>
    focusCandidatesOf(atomOptions.value ?? EMPTY_ATOMS, commonAtoms.value, appearSet.value),
  )
  const focusAtomIds = computed(() => focusAtomIdsOf(scopedSets.value.focus))
  const focusCount = computed(() =>
    focusInitials.value.size + focusFinals.value.size + focusZeroFinals.value.size,
  )
  const focusGroup = (group: SelectionGroup): GroupState =>
    focusGroupStateOf({ group, focus: scopedSets.value.focus, candidates: focusCandidates.value })
  const focusInitialGroup = computed(() => focusGroup('initial'))
  const focusFinalGroup = computed(() => focusGroup('final'))
  const focusZeroGroup = computed(() => focusGroup('zero'))
  const toggleFocus = (group: SelectionGroup, value: string): void =>
    writeFocus(toggleAtomSet(scopedSets.value.focus, group, value))
  function toggleFocusAll(group: SelectionGroup): void {
    const state = focusGroup(group)
    const list =
      group === 'initial'
        ? focusCandidates.value.initials
        : group === 'final'
          ? focusCandidates.value.finals
          : focusCandidates.value.zeroFinals
    writeFocus({
      ...scopedSets.value.focus,
      ...(group === 'initial'
        ? { initials: new Set(state.all ? [] : list) }
        : group === 'final'
          ? { finals: new Set(state.all ? [] : list) }
          : { zeroFinals: new Set(state.all ? [] : list) }),
    })
  }
  function clearFocus(): void {
    writeFocus({ initials: new Set(), finals: new Set(), zeroFinals: new Set() })
  }

  const hiddenCandidatesOf = (scopeKind: 'drill' | 'article'): AtomOptions =>
    hiddenCandidatesOfPure(
      scopeKind,
      atomOptions.value ?? EMPTY_ATOMS,
      commonAtoms.value,
      appearSet.value,
    )

  const hiddenGroupState = (scopeKind: 'drill' | 'article', group: SelectionGroup): GroupState =>
    hiddenGroupStateOf({ scope: scopeKind, group, options: atomOptions.value ?? EMPTY_ATOMS, common: commonAtoms.value, sets: scopedSets.value })
  const hiddenGroupTotal = (scopeKind: 'drill' | 'article', group: SelectionGroup): number =>
    hiddenGroupState(scopeKind, group).total
  const hiddenGroupSelected = (scopeKind: 'drill' | 'article', group: SelectionGroup): number =>
    hiddenGroupState(scopeKind, group).selected
  const hiddenGroupAllChecked = (scopeKind: 'drill' | 'article', group: SelectionGroup): boolean =>
    hiddenGroupState(scopeKind, group).all
  const hiddenGroupPartial = (scopeKind: 'drill' | 'article', group: SelectionGroup): boolean =>
    hiddenGroupState(scopeKind, group).indeterminate
  const hiddenGroupDisabled = (scopeKind: 'drill' | 'article', group: SelectionGroup): boolean =>
    hiddenGroupState(scopeKind, group).total === 0

  const toggleHidden = (scopeKind: 'drill' | 'article', group: SelectionGroup, value: string): void =>
    writeHidden(scopeKind, toggleAtomSet(scopeSetsFor(scopedSets.value, scopeKind), group, value))
  const toggleHiddenZeroFinal = (scopeKind: 'drill' | 'article', value: string): void =>
    toggleHidden(scopeKind, 'zero', value)

  function clearHidden(scopeKind: 'drill' | 'article'): void {
    writeHidden(scopeKind, { initials: new Set(), finals: new Set(), zeroFinals: new Set() })
  }

  function toggleHiddenAll(scopeKind: 'drill' | 'article', group: SelectionGroup): void {
    writeHidden(
      scopeKind,
      applyHiddenGroupSelection({
        scope: scopeKind,
        group,
        selected: !hiddenGroupAllChecked(scopeKind, group),
        options: atomOptions.value ?? EMPTY_ATOMS,
        common: commonAtoms.value,
        sets: scopedSets.value,
      }),
    )
  }

  watch(
    [selectedInitials, selectedFinals, selectedZeroFinals],
    () => {
      const next = shrinkScopedSets(scopedSets.value, atomOptions.value ?? EMPTY_ATOMS)
      writeFocus(next.focus)
      writeHidden('drill', next.drill)
      writeHidden('article', next.article)
    },
    { flush: 'sync' },
  )

  /** 开始练习时冻结一份隐藏快照（会话中再改设置不影响本局） */
  const hiddenSnapshotOfScope = (scopeKind: 'drill' | 'article'): HiddenSnapshot =>
    hiddenSnapshotOf(scopeKind === 'drill' ? scopedSets.value.drill : scopedSets.value.article)

  let hydratedScheme = ''
  let readyToPersist = false
  let coursePresetApplied = false

  function persist(): void {
    if (!readyToPersist || !course.schemeId || !atomOptions.value) return
    writeStoredTrainingConfig(
      local,
      course.schemeId,
      configSnapshotOf({ tab: tab.value, articleInputMode: articleInputMode.value, sets: scopedSets.value }),
    )
  }

  function resetForScheme(): void {
    tab.value = 'drill'
    articleInputMode.value = 'input'
    applySets(emptyScopedSets())
  }

  /** 课程总结卡「无尽练习」一次性预设：读取后立即清除，刷新不会覆盖后续修改。 */
  function applyCoursePreset(): void {
    if (coursePresetApplied) return
    const taken = takeTrainingPreset(presetStorage)
    if (!taken) return
    if (taken.preset.scheme && taken.preset.scheme !== course.schemeId) {
      // 极端情况下训练页仍停留在另一个方案：先把方案切回来，再重新读取一次性预设。
      restoreTrainingPreset(presetStorage, taken.raw)
      void course.selectScheme(taken.preset.scheme)
      return
    }
    const lesson = course.getLesson(taken.preset.from)
    const options = atomOptions.value
    if (!lesson || !options) return
    coursePresetApplied = true
    tab.value = 'drill'
    applySets(
      setsOfPreset(
        presetSelectionOf({
          lesson,
          lessons: course.lessons,
          stage: taken.preset.stage,
          common: commonAtoms.value,
          options,
        }),
        scopedSets.value,
      ),
    )
  }

  watch(
    [() => course.schemeId, atomOptions],
    ([id, options]) => {
      if (!id || !options || hydratedScheme === id) return
      hydratedScheme = id
      readyToPersist = false
      resetForScheme()
      const config = readStoredTrainingConfig(local, id, options)
      if (config) {
        tab.value = config.tab
        articleInputMode.value = config.articleInputMode
        applySets(setsOfConfig(config))
      } else {
        selectAll()
      }
      applyCoursePreset()
      readyToPersist = true
    },
    { immediate: true, flush: 'post' },
  )

  watch(
    [
      tab,
      articleInputMode,
      selectedInitials,
      selectedFinals,
      selectedZeroFinals,
      focusInitials,
      focusFinals,
      focusZeroFinals,
      hiddenInitials,
      hiddenFinals,
      hiddenZeroFinals,
      articleHiddenInitials,
      articleHiddenFinals,
      articleHiddenZeroFinals,
    ],
    persist,
    { flush: 'post' },
  )

  if (getCurrentScope()) onScopeDispose(persist)

  return {
    tab, articleInputMode, atomOptions, commonAtoms, scope, passedLessonCount,
    selectedInitials, selectedFinals, selectedZeroFinals,
    focusInitials, focusFinals, focusZeroFinals,
    focusCandidates, focusAtomIds, focusCount,
    focusInitialGroup, focusFinalGroup, focusZeroGroup,
    toggleFocus, toggleFocusAll, clearFocus,
    selectableInitials: computed(() => selectable.value.initials),
    selectableFinals: computed(() => selectable.value.finals),
    selectableZeroFinals: computed(() => selectable.value.zeroFinals),
    appearInitialGroup, appearFinalGroup, appearZeroGroup,
    commonEntries, commonEntriesFor, commonCapsuleCount, commonAllChecked, toggleCommonAll,
    toggleInitial, toggleFinal, toggleZeroFinal, selectAll, selectGroup, clearGroup, clearAppear,
    toggleAppearAll, selectLearnedAtoms, learnedApplied,
    hiddenInitials, hiddenFinals, hiddenZeroFinals,
    articleHiddenInitials, articleHiddenFinals, articleHiddenZeroFinals,
    hiddenCandidatesOf, hiddenGroupState, hiddenGroupAllChecked, hiddenGroupPartial,
    hiddenGroupSelected, hiddenGroupTotal, hiddenGroupDisabled,
    toggleHidden, toggleHiddenZeroFinal, toggleHiddenAll, clearHidden,
    hiddenSnapshotOf: hiddenSnapshotOfScope, persist,
  }
}

export type TrainingSelection = ReturnType<typeof useTrainingSelection>
