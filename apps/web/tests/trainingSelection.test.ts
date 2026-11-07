import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  freeTrainingAtoms,
  type Curriculum,
  type LessonDef,
  type LessonProgress,
  type SchemeDef,
} from '@shuangpin/core'
import {
  addedAppearanceAtoms,
  emptyAtomSet,
  focusAtomIdsOf,
  focusCandidatesOf,
  focusGroupStateOf,
  configSnapshotOf,
  groupStateOf,
  hiddenCandidatesOf,
  learnedSelectionApplied,
  learnedSelectionOf,
  learnedSelectionSets,
  parseTrainingConfig,
  parseTrainingPreset,
  passedFocusAtomsOf,
  presetSelectionOf,
  sanitizeTrainingConfig,
  selectableAtomsOf,
  setsOfConfig,
  isEmptyAtomSet,
  shrinkScopedSets,
  withAddedAtoms,
  type AtomOptions,
  type AtomSet,
  type ScopedSets,
  type TrainingConfigSnapshot,
} from '../src/lib/trainingSelection.ts'

const scheme = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../data/schemes/xiaohe/scheme.json', import.meta.url)), 'utf8'),
) as SchemeDef
const curriculum = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../data/schemes/xiaohe/curriculum.json', import.meta.url)),
    'utf8',
  ),
) as Curriculum

const options: AtomOptions = {
  initials: Object.keys(scheme.initials),
  finals: Object.keys(scheme.finals),
  zeroFinals: Object.keys(scheme.zeroInitial),
}
const common = freeTrainingAtoms(scheme)

function lessonOf(id: string): LessonDef {
  const lesson = curriculum.lessons.find((item) => item.id === id)
  if (!lesson) throw new Error(`lesson ${id} missing`)
  return lesson
}

function emptyConfig(): TrainingConfigSnapshot {
  return {
    tab: 'drill',
    articleInputMode: 'input',
    selectedInitials: [],
    selectedFinals: [],
    selectedZeroFinals: [],
    focusInitials: [],
    focusFinals: [],
    focusZeroFinals: [],
    hiddenInitials: [],
    hiddenFinals: [],
    hiddenZeroFinals: [],
    articleHiddenInitials: [],
    articleHiddenFinals: [],
    articleHiddenZeroFinals: [],
  }
}

describe('trainingSelection · 组选状态', () => {
  it('胶囊算作组内一个项目，参与全选与部分选中', () => {
    expect(groupStateOf(3, 3, true, false)).toEqual({
      selected: 3,
      total: 4,
      all: false,
      indeterminate: true,
    })
    expect(groupStateOf(3, 3, true, true)).toMatchObject({ selected: 4, all: true, indeterminate: false })
    expect(groupStateOf(0, 0, false, false)).toMatchObject({ total: 0, all: false, indeterminate: false })
    expect(groupStateOf(2, 5, false, false)).toMatchObject({ selected: 2, total: 5, indeterminate: true })
  })
})

describe('trainingSelection · 配置解析/裁剪', () => {
  it('损坏/缺省配置回退默认值', () => {
    expect(parseTrainingConfig(null)).toBeNull()
    expect(parseTrainingConfig('x')).toBeNull()
    expect(parseTrainingConfig([])).toBeNull()
    const parsed = parseTrainingConfig({ tab: 'article', articleInputMode: 'import', selectedInitials: ['zh', 1, null] })
    expect(parsed).toMatchObject({
      tab: 'article',
      articleInputMode: 'import',
      selectedInitials: ['zh'],
      selectedFinals: [],
    })
  })

  it('裁剪掉当前方案不存在的原子；隐藏项必须属于出现集合', () => {
    const config = {
      ...emptyConfig(),
      selectedInitials: ['zh', 'not-an-initial'],
      hiddenInitials: ['zh', 'not-an-initial', 'b'],
      articleHiddenInitials: ['zh', 'not-an-initial'],
    }
    const sanitized = sanitizeTrainingConfig(config, options)
    expect(sanitized.selectedInitials).toEqual(['zh'])
    // b 未被出现集合选中 → 专项隐藏被丢弃；文章隐藏只要求是合法原子
    expect(sanitized.hiddenInitials).toEqual(['zh'])
    expect(sanitized.articleHiddenInitials).toEqual(['zh'])
  })

  it('配置快照 round-trip 包含焦点', () => {
    const sets: ScopedSets = {
      appear: {
        initials: new Set(['zh']),
        finals: new Set(['ai']),
        zeroFinals: new Set<string>(),
      },
      focus: {
        initials: new Set(['zh']),
        finals: new Set<string>(),
        zeroFinals: new Set<string>(),
      },
      drill: {
        initials: new Set<string>(),
        finals: new Set<string>(),
        zeroFinals: new Set<string>(),
      },
      article: {
        initials: new Set<string>(),
        finals: new Set<string>(),
        zeroFinals: new Set<string>(),
      },
    }
    const snapshot = configSnapshotOf({ tab: 'drill', articleInputMode: 'input', sets })
    expect(snapshot.focusInitials).toEqual(['zh'])
    const restored = setsOfConfig(snapshot)
    expect([...restored.focus.initials]).toEqual(['zh'])
  })

  it('焦点裁剪到合法原子且必须属于出现集合；旧配置缺字段回退空', () => {
    const parsed = parseTrainingConfig({ tab: 'drill', selectedInitials: ['zh'] })
    expect(parsed?.focusInitials).toEqual([])
    expect(parsed?.focusFinals).toEqual([])
    expect(parsed?.focusZeroFinals).toEqual([])
    const config = {
      ...emptyConfig(),
      selectedInitials: ['zh'],
      selectedFinals: ['ai'],
      focusInitials: ['zh', 'ch', 'nope'],
      focusFinals: ['ai', 'ei'],
      focusZeroFinals: ['a'],
    }
    const sanitized = sanitizeTrainingConfig(config, options)
    expect(sanitized.focusInitials).toEqual(['zh'])
    expect(sanitized.focusFinals).toEqual(['ai'])
    expect(sanitized.focusZeroFinals).toEqual([])
  })
})

describe('trainingSelection · 已学原子', () => {
  it('只统计已通过课程的 focus 原子', () => {
    const passLesson = lessonOf('L2.1')
    expect(passLesson.focusAtoms).toContain('initial:zh')
    const progress: Record<string, LessonProgress> = {
      [passLesson.id]: {
        passed: true,
        stars: 3,
        bestAccuracy: 1,
        attempts: 1,
        updatedAt: 1,
      },
      L9_9: {
        passed: false,
        stars: 0,
        bestAccuracy: 0,
        attempts: 1,
        updatedAt: 1,
      },
    }
    const passed = passedFocusAtomsOf(curriculum.lessons, progress)
    expect(passed.initials.has('zh')).toBe(true)
    expect(passed.finals.size).toBe(0)
    expect(passed.zeroFinals.size).toBe(0)
  })
})

describe('trainingSelection · 课程预设', () => {
  const lesson = lessonOf('L2.1')

  it('single：出现范围 = 全拼沿用 ∪ 已学 focus，无隐藏', () => {
    const preset = presetSelectionOf({
      lesson,
      lessons: curriculum.lessons,
      stage: 'single',
      common,
      options,
    })
    for (const item of common.initials) expect(preset.selectedInitials).toContain(item)
    expect(preset.selectedInitials).toContain('zh')
    expect(preset.hiddenInitials).toEqual([])
    expect(preset.hiddenFinals).toEqual([])
    expect(preset.hiddenZeroFinals).toEqual([])
    expect(preset.focusInitials).toEqual(['zh'])
    expect(preset.focusFinals).toEqual([])
    expect(preset.focusZeroFinals).toEqual([])
  })

  it('word：隐藏本课新学映射，零声母包含全拼沿用与已教音节', () => {
    const preset = presetSelectionOf({
      lesson,
      lessons: curriculum.lessons,
      stage: 'word',
      common,
      options,
    })
    expect(preset.hiddenInitials).toEqual(['zh'])
    expect(preset.hiddenFinals).toEqual([])
    // 免费零声母属于全拼沿用，必须与其它全拼沿用一样进入出现集合
    for (const item of common.zeroFinals) expect(preset.selectedZeroFinals).toContain(item)
    for (const item of preset.hiddenZeroFinals) {
      expect(preset.selectedZeroFinals).toContain(item)
    }
  })

  it('exam：隐藏全部出现项', () => {
    const preset = presetSelectionOf({
      lesson,
      lessons: curriculum.lessons,
      stage: 'exam',
      common,
      options,
    })
    expect([...preset.hiddenInitials].sort()).toEqual([...preset.selectedInitials].sort())
    expect([...preset.hiddenFinals].sort()).toEqual([...preset.selectedFinals].sort())
    expect([...preset.hiddenZeroFinals].sort()).toEqual([...preset.selectedZeroFinals].sort())
  })

  it('所有出现项都来自当前方案原子表，隐藏项是出现项子集', () => {
    for (const stage of ['single', 'word', 'exam'] as const) {
      const preset = presetSelectionOf({
        lesson,
        lessons: curriculum.lessons,
        stage,
        common,
        options,
      })
      expect(preset.selectedInitials.every((item) => options.initials.includes(item))).toBe(true)
      expect(preset.selectedFinals.every((item) => options.finals.includes(item))).toBe(true)
      expect(preset.selectedZeroFinals.every((item) => options.zeroFinals.includes(item))).toBe(true)
      expect(preset.hiddenInitials.every((item) => preset.selectedInitials.includes(item))).toBe(true)
      expect(preset.hiddenFinals.every((item) => preset.selectedFinals.includes(item))).toBe(true)
      expect(preset.hiddenZeroFinals.every((item) => preset.selectedZeroFinals.includes(item))).toBe(true)
    }
  })
})

describe('trainingSelection · 原子集合派生', () => {
  it('selectableAtomsOf 去掉全拼沿用覆盖的 free 原子', () => {
    const selectable = selectableAtomsOf(options, common)
    expect(selectable.initials).toHaveLength(options.initials.length - common.initials.length)
    for (const item of common.initials) expect(selectable.initials).not.toContain(item)
    expect(selectable.initials.every((item) => options.initials.includes(item))).toBe(true)
  })

  it('hiddenCandidatesOf：专项只列出现范围选中的非公共原子，文章列全部普通候选', () => {
    const allSelected = {
      initials: new Set(options.initials),
      finals: new Set(options.finals),
      zeroFinals: new Set(options.zeroFinals),
    }
    const drill = hiddenCandidatesOf('drill', options, common, allSelected)
    for (const item of common.initials) expect(drill.initials).not.toContain(item)

    const partial = {
      initials: new Set([...common.initials, 'zh']),
      finals: new Set<string>(),
      zeroFinals: new Set<string>(),
    }
    const scoped = hiddenCandidatesOf('drill', options, common, partial)
    expect(scoped.initials).toEqual(['zh'])

    const article = hiddenCandidatesOf('article', options, common, allSelected)
    expect(article.initials).toHaveLength(options.initials.length - common.initials.length)
  })

  it('焦点候选与分组状态：只取出现范围内的非公共原子', () => {
    const appear: AtomSet = {
      initials: new Set([...common.initials, 'zh']),
      finals: new Set<string>(),
      zeroFinals: new Set<string>(),
    }
    const candidates = focusCandidatesOf(options, common, appear)
    expect(candidates.initials).toEqual(['zh'])
    const focus: AtomSet = {
      initials: new Set(['zh']),
      finals: new Set<string>(),
      zeroFinals: new Set<string>(),
    }
    expect(focusGroupStateOf({ group: 'initial', focus, candidates })).toEqual({
      selected: 1,
      total: 1,
      all: true,
      indeterminate: false,
    })
    expect(focusAtomIdsOf(focus)).toEqual(['initial:zh'])
  })

  it('shrinkScopedSets 把隐藏与焦点集合收缩到出现范围/合法原子内', () => {
    const sets: ScopedSets = {
      appear: {
        initials: new Set(['zh']),
        finals: new Set(['ai']),
        zeroFinals: new Set<string>(),
      },
      focus: {
        initials: new Set(['zh', 'ch']),
        finals: new Set(['ai', 'ei']),
        zeroFinals: new Set(['a']),
      },
      drill: {
        initials: new Set(['zh', 'ch']),
        finals: new Set(['ai', 'ei']),
        zeroFinals: new Set(['a']),
      },
      article: {
        initials: new Set(['zh', 'not-an-atom']),
        finals: new Set(['ai']),
        zeroFinals: new Set<string>(),
      },
    }
    const shrunk = shrinkScopedSets(sets, options)
    expect([...shrunk.focus.initials]).toEqual(['zh'])
    expect([...shrunk.focus.finals]).toEqual(['ai'])
    expect([...shrunk.focus.zeroFinals]).toEqual([])
    expect([...shrunk.drill.initials]).toEqual(['zh'])
    expect([...shrunk.drill.finals]).toEqual(['ai'])
    expect([...shrunk.drill.zeroFinals]).toEqual([])
    expect([...shrunk.article.initials]).toEqual(['zh'])
  })

  it('learnedSelectionOf 在全拼沿用上叠加已通过课程的 focus', () => {
    const passLesson = lessonOf('L2.1')
    const progress: Record<string, LessonProgress> = {
      [passLesson.id]: { passed: true, stars: 3, bestAccuracy: 1, attempts: 1, updatedAt: 1 },
    }
    const learned = learnedSelectionOf({ lessons: curriculum.lessons, progress, common, options })
    expect(learned.selectedInitials).toContain('zh')
    expect(learned.selectedInitials).toEqual(expect.arrayContaining([...common.initials]))
    expect(learned.selectedFinals).toEqual(expect.arrayContaining([...common.finals]))
    expect(learned.selectedZeroFinals).toEqual(expect.arrayContaining([...common.zeroFinals]))
  })

  it('learnedSelectionApplied 只在出现范围完全等于已学范围时为 true', () => {
    const passLesson = lessonOf('L2.1')
    const learned = learnedSelectionOf({
      lessons: curriculum.lessons,
      progress: { [passLesson.id]: { passed: true, stars: 3, bestAccuracy: 1, attempts: 1, updatedAt: 1 } },
      common,
      options,
    })
    const target: AtomSet = {
      initials: new Set(learned.selectedInitials),
      finals: new Set(learned.selectedFinals),
      zeroFinals: new Set(learned.selectedZeroFinals),
    }
    const input = {
      lessons: curriculum.lessons,
      progress: { [passLesson.id]: { passed: true, stars: 3, bestAccuracy: 1, attempts: 1, updatedAt: 1 } },
      common,
      options,
    }
    expect(learnedSelectionApplied({ ...input, current: target })).toBe(true)
    expect(
      learnedSelectionApplied({
        ...input,
        current: { ...target, initials: new Set([...target.initials].filter((item) => item !== 'zh')) },
      }),
    ).toBe(false)
  })

  it('已学保留仍在出现范围内的焦点与隐藏', () => {
    const passLesson = lessonOf('L2.1')
    const current: ScopedSets = {
      appear: {
        initials: new Set([...common.initials, 'zh']),
        finals: new Set(common.finals),
        zeroFinals: new Set<string>(),
      },
      focus: {
        initials: new Set(['zh']),
        finals: new Set<string>(),
        zeroFinals: new Set<string>(),
      },
      drill: {
        initials: new Set<string>(),
        finals: new Set<string>(),
        zeroFinals: new Set<string>(),
      },
      article: {
        initials: new Set<string>(),
        finals: new Set<string>(),
        zeroFinals: new Set<string>(),
      },
    }
    const next = learnedSelectionSets({
      lessons: curriculum.lessons,
      progress: { [passLesson.id]: { passed: true, stars: 3, bestAccuracy: 1, attempts: 1, updatedAt: 1 } },
      common,
      options,
      current,
    })
    expect([...next.focus.initials]).toEqual(['zh'])
    expect(next.appear.initials).toContain('zh')
  })

  it('已学对齐出现范围，新增原子同步焦点/隐藏并移除未学原子', () => {
    const passLesson = lessonOf('L2.1')
    const unlearnedInitial = selectableAtomsOf(options, common).initials.find(
      (item) => item !== 'zh',
    )
    expect(unlearnedInitial).toBeTruthy()
    const current: ScopedSets = {
      appear: {
        initials: new Set([...common.initials, unlearnedInitial as string]),
        finals: new Set(common.finals),
        zeroFinals: new Set(common.zeroFinals),
      },
      focus: {
        initials: new Set([unlearnedInitial as string]),
        finals: new Set<string>(),
        zeroFinals: new Set<string>(),
      },
      drill: {
        initials: new Set([unlearnedInitial as string]),
        finals: new Set<string>(),
        zeroFinals: new Set<string>(),
      },
      article: {
        initials: new Set<string>(),
        finals: new Set<string>(),
        zeroFinals: new Set<string>(),
      },
    }
    const next = learnedSelectionSets({
      lessons: curriculum.lessons,
      progress: { [passLesson.id]: { passed: true, stars: 3, bestAccuracy: 1, attempts: 1, updatedAt: 1 } },
      common,
      options,
      current,
    })
    expect(next.appear.initials.has('zh')).toBe(true)
    expect(next.appear.initials.has(unlearnedInitial as string)).toBe(false)
    expect([...next.focus.initials]).toEqual(['zh'])
    expect([...next.drill.initials]).toEqual(['zh'])
    expect(next.article).toEqual(current.article)
  })

  it('parseTrainingPreset 校验缺字段/非法阶段', () => {
    expect(parseTrainingPreset(null)).toBeNull()
    expect(parseTrainingPreset('{bad')).toBeNull()
    expect(parseTrainingPreset(JSON.stringify({ from: 'L2.1', stage: 'nope', scheme: '' }))).toBeNull()
    expect(parseTrainingPreset(JSON.stringify({ from: '', stage: 'word', scheme: '' }))).toBeNull()
    expect(parseTrainingPreset(JSON.stringify({ from: 'L2.1', stage: 'word', scheme: 'xiaohe' }))).toEqual({
      from: 'L2.1',
      stage: 'word',
      scheme: 'xiaohe',
    })
  })
})

describe('trainingSelection · 出现新增联动口径', () => {
  const empty = emptyAtomSet()

  function atomSet(initials: string[], finals: string[], zeroFinals: string[]): AtomSet {
    return {
      initials: new Set(initials),
      finals: new Set(finals),
      zeroFinals: new Set(zeroFinals),
    }
  }

  it('addedAppearanceAtoms 只统计新增的可选普通原子（全拼沿用除外）', () => {
    const next = atomSet(options.initials, options.finals, options.zeroFinals)
    const added = addedAppearanceAtoms({ previous: empty, next, options, common })
    expect([...added.initials]).toEqual([...selectableAtomsOf(options, common).initials])
    expect([...added.finals]).toEqual([...selectableAtomsOf(options, common).finals])
    expect([...added.zeroFinals]).toEqual([...selectableAtomsOf(options, common).zeroFinals])
    // 全拼沿用集合本身不应出现在新增项里
    for (const key of common.initials) expect(added.initials.has(key)).toBe(false)
    for (const key of common.finals) expect(added.finals.has(key)).toBe(false)
    for (const key of common.zeroFinals) expect(added.zeroFinals.has(key)).toBe(false)
  })

  it('addedAppearanceAtoms 忽略移除项，取消勾选不会产生联动', () => {
    const previous = atomSet(['zh'], ['a'], [])
    const next = atomSet([], [], [])
    const added = addedAppearanceAtoms({ previous, next, options, common })
    expect(isEmptyAtomSet(added)).toBe(true)
    // 已存在项也不会重复计入
    const stable = addedAppearanceAtoms({ previous, next: previous, options, common })
    expect(isEmptyAtomSet(stable)).toBe(true)
  })

  it('withAddedAtoms 无新增时返回原对象，有新增时只并入新增项', () => {
    const current = atomSet(['b'], ['a'], [])
    expect(withAddedAtoms(current, empty)).toBe(current)

    const added = atomSet(['zh'], ['ang'], ['零'])
    const merged = withAddedAtoms(current, added)
    expect(merged).not.toBe(current)
    expect([...merged.initials].sort()).toEqual(['b', 'zh'])
    expect([...merged.finals].sort()).toEqual(['a', 'ang'])
    expect([...merged.zeroFinals]).toEqual(['零'])
    // 未新增的组保持原引用
    expect(merged.initials).not.toBe(current.initials)
  })

  it('learnedSelectionSets 与通用联动口径一致：新增项只镜像普通原子', () => {
    const base: ScopedSets = {
      appear: empty,
      focus: empty,
      drill: empty,
      article: empty,
    }
    const progress: Record<string, LessonProgress> = {
      'L1.1': { passed: true, stars: 3, bestAccuracy: 1, attempts: 1, updatedAt: 0 },
      'L2.1': { passed: true, stars: 3, bestAccuracy: 1, attempts: 1, updatedAt: 0 },
    }
    const next = learnedSelectionSets({
      lessons: curriculum.lessons,
      progress,
      common,
      options,
      current: base,
    })
    const expected = addedAppearanceAtoms({
      previous: empty,
      next: next.appear,
      options,
      common,
    })
    expect([...next.focus.initials].sort()).toEqual([...expected.initials].sort())
    expect([...next.focus.finals].sort()).toEqual([...expected.finals].sort())
    expect([...next.drill.initials].sort()).toEqual([...expected.initials].sort())
  })
})
