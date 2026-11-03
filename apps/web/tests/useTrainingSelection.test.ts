import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, type EffectScope } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import type { Curriculum, SchemeDef, SchemeIndexFile } from '@shuangpin/core'

vi.mock('@/lib/data', () => ({
  loadIndex: vi.fn(),
  loadScheme: vi.fn(),
  loadCurriculum: vi.fn(),
  loadLexiconMeta: vi.fn(),
}))

import { loadCurriculum, loadIndex, loadLexiconMeta, loadScheme } from '@/lib/data'
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
const curriculum = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../data/schemes/xiaohe/curriculum.json', import.meta.url)),
    'utf8',
  ),
) as Curriculum

const indexFixture: SchemeIndexFile = {
  version: '1',
  defaultScheme: 'xiaohe',
  recommendedOrder: ['xiaohe'],
  courseSupported: ['xiaohe'],
  schemes: [{ id: 'xiaohe', name: 'xiaohe', type: 'compositional', file: '' }],
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
    setActivePinia(createPinia())

    vi.mocked(loadIndex).mockResolvedValue(indexFixture)
    vi.mocked(loadScheme).mockImplementation(async (id: string) => ({ ...schemeDef, id }))
    vi.mocked(loadCurriculum).mockResolvedValue(curriculum)
    vi.mocked(loadLexiconMeta).mockResolvedValue({ wordCount: 0, dataVersion: 'test' })
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
})
