import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, type EffectScope } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import type { SchemeDef, SchemeIndexFile, StoredCurriculum } from '@shuangpin/core'
import { createSchemeEngine, freeAtomIdsOf, hydrateCurriculum } from '@shuangpin/core'

vi.mock('@/lib/data', () => ({
  loadIndex: vi.fn(),
  loadScheme: vi.fn(),
  loadCurriculum: vi.fn(),
  loadLexicon: vi.fn(),
}))

import { loadCurriculum, loadIndex, loadLexicon, loadScheme } from '@/lib/data'
import { STORAGE_KEYS, writeString } from '../src/lib/storage.ts'
import { useCourseStore } from '../src/stores/course.ts'
import { useTrainingSelection, type TrainingSelection } from '../src/composables/useTrainingSelection.ts'
import { parseTrainingConfig } from '../src/lib/trainingSelection.ts'

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  }
}

const schemeDef = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../data/schemes/xiaohe/scheme.json', import.meta.url)), 'utf8'),
) as SchemeDef
const curriculum = hydrateCurriculum(
  'xiaohe',
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../../data/schemes/xiaohe/curriculum.json', import.meta.url)),
      'utf8',
    ),
  ) as StoredCurriculum,
  freeAtomIdsOf(createSchemeEngine(schemeDef)),
)

const indexFixture: SchemeIndexFile = {
  defaultScheme: 'xiaohe',
  schemes: [{ id: 'xiaohe', name: 'xiaohe' }],
  customCourses: ['xiaohe'],
}

const options = {
  initials: Object.keys(schemeDef.initials),
  finals: Object.keys(schemeDef.finals),
  zeroFinals: Object.keys(schemeDef.zeroInitial),
}

describe('useTrainingSelection', () => {
  let local: Storage
  let session: Storage
  let scope: EffectScope | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    local = memoryStorage()
    session = memoryStorage()
    vi.stubGlobal('window', { localStorage: local, sessionStorage: session })
    vi.stubGlobal('localStorage', local)
    // 词表预热使用 requestIdleCallback：测试里不执行，避免残留异步任务。
    vi.stubGlobal('requestIdleCallback', vi.fn())
    setActivePinia(createPinia())

    vi.mocked(loadIndex).mockResolvedValue(indexFixture)
    vi.mocked(loadScheme).mockImplementation(async (id: string) => ({ ...schemeDef, id }))
    vi.mocked(loadCurriculum).mockResolvedValue(curriculum)
    vi.mocked(loadLexicon).mockResolvedValue({ words: [], chars: [], syllableExamples: {} })
  })

  afterEach(() => {
    scope?.stop()
    scope = undefined
    vi.unstubAllGlobals()
  })

  async function setup(): Promise<TrainingSelection> {
    const course = useCourseStore()
    await course.init()
    scope = effectScope()
    const selection = scope.run(() => useTrainingSelection())
    if (!selection) throw new Error('selection missing')
    await nextTick()
    await nextTick()
    return selection
  }

  function storedConfig() {
    const raw = local.getItem(STORAGE_KEYS.trainingConfig('xiaohe'))
    return raw ? parseTrainingConfig(JSON.parse(raw)) : null
  }

  it('首次进入默认全选，出现组态含「全拼沿用」胶囊', async () => {
    const selection = await setup()
    expect(selection.selectedInitials.value.size).toBe(options.initials.length)
    expect(selection.selectedFinals.value.size).toBe(options.finals.length)
    expect(selection.selectedZeroFinals.value.size).toBe(options.zeroFinals.length)
    expect(selection.commonCapsuleCount('appear', 'initial')).toBe(1)
    expect(selection.appearInitialGroup.value).toMatchObject({ all: true, indeterminate: false })
    expect(selection.appearInitialGroup.value.total).toBe(
      selection.selectableInitials.value.length + 1,
    )

    selection.toggleCommonAll('appear', 'initial')
    expect(selection.commonAllChecked('appear', 'initial')).toBe(false)
    expect(selection.appearInitialGroup.value.indeterminate).toBe(true)
  })

  it('隐藏项随出现集合自动收缩', async () => {
    const selection = await setup()
    const learnInitial = selection.selectableInitials.value[0]
    expect(learnInitial).toBeTruthy()
    selection.toggleHidden('drill', 'initial', learnInitial as string)
    expect(selection.hiddenInitials.value.has(learnInitial as string)).toBe(true)
    expect(selection.hiddenGroupSelected('drill', 'initial')).toBe(1)

    selection.toggleInitial(learnInitial as string)
    expect(selection.hiddenInitials.value.has(learnInitial as string)).toBe(false)
  })

  it('隐藏映射变化不改变出现/焦点派生引用（练习场可用词不会无关重算）', async () => {
    const selection = await setup()
    const scopeBefore = selection.scope.value
    const focusBefore = selection.focusAtomIds.value
    const learnInitial = selection.selectableInitials.value[0] as string

    selection.toggleHidden('drill', 'initial', learnInitial)
    await nextTick()

    expect(selection.hiddenInitials.value.has(learnInitial)).toBe(true)
    expect(selection.scope.value).toBe(scopeBefore)
    expect(selection.focusAtomIds.value).toBe(focusBefore)
  })

  it('配置变化自动持久化到集中键名', async () => {
    const selection = await setup()
    const firstInitial = options.initials[0] as string
    selection.toggleInitial(firstInitial)
    await nextTick()
    await nextTick()

    const config = storedConfig()
    expect(config).not.toBeNull()
    expect(config?.selectedInitials).not.toContain(firstInitial)
    expect(config?.selectedFinals.length).toBe(options.finals.length)
    expect(config?.tab).toBe('drill')
  })

  it('课程总结卡一次性预设：word 阶段隐藏本课新学，读取后清除', async () => {
    writeString(
      STORAGE_KEYS.trainingPreset,
      JSON.stringify({ from: 'L2.1', stage: 'word', scheme: 'xiaohe' }),
      session,
    )
    const selection = await setup()
    expect(selection.tab.value).toBe('drill')
    expect(selection.hiddenInitials.value.has('zh')).toBe(true)
    expect(selection.selectedInitials.value.has('zh')).toBe(true)
    expect(session.getItem(STORAGE_KEYS.trainingPreset)).toBeNull()
  })

  it('exam 预设隐藏全部出现项', async () => {
    writeString(
      STORAGE_KEYS.trainingPreset,
      JSON.stringify({ from: 'L2.1', stage: 'exam', scheme: 'xiaohe' }),
      session,
    )
    const selection = await setup()
    expect([...selection.hiddenInitials.value].sort()).toEqual(
      [...selection.selectedInitials.value].sort(),
    )
    expect([...selection.hiddenFinals.value].sort()).toEqual(
      [...selection.selectedFinals.value].sort(),
    )
  })

  it('已持久化配置优先于默认全选', async () => {
    writeString(
      STORAGE_KEYS.trainingConfig('xiaohe'),
      JSON.stringify({
        tab: 'article',
        articleInputMode: 'import',
        selectedInitials: ['zh'],
        selectedFinals: ['a'],
        selectedZeroFinals: [],
        hiddenInitials: [],
        hiddenFinals: [],
        hiddenZeroFinals: [],
        articleHiddenInitials: ['zh'],
        articleHiddenFinals: [],
        articleHiddenZeroFinals: [],
      }),
      local,
    )
    const selection = await setup()
    expect(selection.tab.value).toBe('article')
    expect(selection.articleInputMode.value).toBe('import')
    expect([...selection.selectedInitials.value]).toEqual(['zh'])
    expect([...selection.selectedFinals.value]).toEqual(['a'])
    expect([...selection.articleHiddenInitials.value]).toEqual(['zh'])
  })

  // ── 出现范围联动（全选 / 逐项 / 默认） ───────────────────
  describe('出现范围联动（全选 / 逐项 / 默认）', () => {
  function atomSetOf(
    selection: TrainingSelection,
    field: 'focusInitials' | 'focusFinals' | 'focusZeroFinals' | 'hiddenInitials' | 'hiddenFinals' | 'hiddenZeroFinals',
  ): string[] {
    return [...selection[field].value].sort()
  }

  it('默认全选不联动焦点与隐藏（避免默认焦点=全部键位、默认隐藏全部映射）', async () => {
    const selection = await setup()
    expect(selection.selectedInitials.value.size).toBeGreaterThan(0)
    expect(atomSetOf(selection, 'focusInitials')).toEqual([])
    expect(atomSetOf(selection, 'focusFinals')).toEqual([])
    expect(atomSetOf(selection, 'focusZeroFinals')).toEqual([])
    expect(atomSetOf(selection, 'hiddenInitials')).toEqual([])
    expect(atomSetOf(selection, 'hiddenFinals')).toEqual([])
    expect(atomSetOf(selection, 'hiddenZeroFinals')).toEqual([])
  })

  it('组内全选：普通键位同步到焦点，专项隐藏镜像全部新增（含全拼沿用胶囊）', async () => {
    const selection = await setup()
    // 先清空声母组，再点「全选」重新加入
    selection.toggleAppearAll('initial')
    expect(selection.selectedInitials.value.size).toBe(0)
    selection.toggleAppearAll('initial')

    const selectable = [...selection.selectableInitials.value].sort()
    expect(selectable.length).toBeGreaterThan(0)
    // 焦点只接普通键位
    expect(atomSetOf(selection, 'focusInitials')).toEqual(selectable)
    // 专项隐藏镜像全部新增项：与出现范围一致（全拼沿用胶囊跟随选中）
    expect(atomSetOf(selection, 'hiddenInitials')).toEqual(
      [...selection.selectedInitials.value].sort(),
    )
    for (const commonInitial of selection.commonAtoms.value.initials) {
      expect(selection.hiddenInitials.value.has(commonInitial)).toBe(true)
      expect(selection.focusInitials.value.has(commonInitial)).toBe(false)
    }
    // 隐藏组态：普通键位 + 全拼沿用胶囊全部选中
    expect(selection.hiddenGroupAllChecked('drill', 'initial')).toBe(true)
  })

  it('清空后点全选：隐藏卡的全拼沿用胶囊跟随选中（用户报障场景）', async () => {
    const selection = await setup()
    selection.toggleAppearAll('initial') // 清空声母组
    selection.toggleAppearAll('initial') // 重新全选
    const group = selection.hiddenGroupState('drill', 'initial')
    expect(group.all).toBe(true)
    expect(group.selected).toBe(group.total)
    expect(atomSetOf(selection, 'hiddenInitials')).toEqual(
      [...selection.selectedInitials.value].sort(),
    )
  })

  it('组内全选同样覆盖韵母组与零声母组', async () => {
    const selection = await setup()
    selection.toggleAppearAll('final')
    selection.toggleAppearAll('final')
    expect(atomSetOf(selection, 'focusFinals')).toEqual(
      [...selection.selectableFinals.value].sort(),
    )
    expect(atomSetOf(selection, 'hiddenFinals')).toEqual(
      [...selection.selectedFinals.value].sort(),
    )

    selection.toggleAppearAll('zero')
    selection.toggleAppearAll('zero')
    expect(atomSetOf(selection, 'focusZeroFinals')).toEqual(
      [...selection.selectableZeroFinals.value].sort(),
    )
    expect(atomSetOf(selection, 'hiddenZeroFinals')).toEqual(
      [...selection.selectedZeroFinals.value].sort(),
    )
  })

  it('逐项勾选新增仍联动，取消勾选后焦点/隐藏自动收缩', async () => {
    const selection = await setup()
    const [first, second] = selection.selectableInitials.value
    expect(first && second).toBeTruthy()
    // 默认全选，先关掉两个，再逐个打开
    selection.toggleInitial(first as string)
    selection.toggleInitial(second as string)
    expect(selection.focusInitials.value.has(first as string)).toBe(false)
    selection.toggleInitial(first as string)
    expect(selection.focusInitials.value.has(first as string)).toBe(true)
    expect(selection.hiddenInitials.value.has(first as string)).toBe(true)
    // 再次取消：出现范围收缩时焦点/隐藏同步移除
    selection.toggleInitial(first as string)
    expect(selection.focusInitials.value.has(first as string)).toBe(false)
    expect(selection.hiddenInitials.value.has(first as string)).toBe(false)
    expect(selection.focusInitials.value.has(second as string)).toBe(false)
  })

  it('全拼沿用胶囊切换只联动专项隐藏，不进入焦点', async () => {
    const selection = await setup()
    selection.toggleAppearAll('initial') // 清空声母组
    expect(atomSetOf(selection, 'focusInitials')).toEqual([])
    selection.toggleCommonAll('appear', 'initial') // 只加回全拼沿用胶囊
    const commonInitials = [...selection.commonAtoms.value.initials].sort()
    expect(selection.selectedInitials.value.size).toBeGreaterThan(0)
    // 焦点仍然只接普通键位；隐藏卡里的胶囊同步选中
    expect(atomSetOf(selection, 'focusInitials')).toEqual([])
    expect(atomSetOf(selection, 'hiddenInitials')).toEqual(commonInitials)
    expect(selection.hiddenGroupAllChecked('drill', 'initial')).toBe(true)
  })

  it('清空出现范围后焦点与专项隐藏同步清空', async () => {
    const selection = await setup()
    selection.toggleAppearAll('initial')
    selection.toggleAppearAll('initial')
    expect(selection.focusInitials.value.size).toBeGreaterThan(0)
    selection.clearAppear()
    expect(selection.selectedInitials.value.size).toBe(0)
    expect(selection.focusInitials.value.size).toBe(0)
    expect(selection.hiddenInitials.value.size).toBe(0)
  })
})
})
