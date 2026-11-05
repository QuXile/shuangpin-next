import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Curriculum, SchemeDef, SchemeIndexFile } from '@shuangpin/core'

vi.mock('@/lib/data', () => ({
  loadIndex: vi.fn(),
  loadScheme: vi.fn(),
  loadCurriculum: vi.fn(),
}))

import { loadCurriculum, loadIndex, loadScheme } from '@/lib/data'
import { STORAGE_KEYS } from '../src/lib/storage.ts'
import { useCourseStore } from '../src/stores/course.ts'

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

const schemeIds = ['xiaohe', 'slow', 'fast', 'bad', 'preview'] as const

const indexFixture: SchemeIndexFile = {
  defaultScheme: 'xiaohe',
  schemes: schemeIds.map((id) => ({ id, name: id })),
  customCourses: ['xiaohe', 'slow'],
}

const curriculumFixture = {
  schemeId: 'xiaohe',
  lessons: [],
  chapters: [],
} as unknown as Curriculum

function mockScheme(id: string): SchemeDef {
  return { ...schemeDef, id, name: id }
}

describe('course store', () => {
  let storage: Storage

  beforeEach(() => {
    vi.clearAllMocks()
    storage = memoryStorage()
    vi.stubGlobal('window', { localStorage: storage, sessionStorage: memoryStorage() })
    vi.stubGlobal('localStorage', storage)
    setActivePinia(createPinia())

    vi.mocked(loadIndex).mockResolvedValue(indexFixture)
    vi.mocked(loadScheme).mockImplementation(async (id: string) => mockScheme(id))
    vi.mocked(loadCurriculum).mockResolvedValue(curriculumFixture)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('init 加载 index + 默认方案，并持久化方案 id', async () => {
    const store = useCourseStore()
    await store.init()

    expect(store.status).toBe('ready')
    expect(store.ready).toBe(true)
    expect(store.schemeId).toBe('xiaohe')
    expect(store.scheme?.id).toBe('xiaohe')
    expect(store.engine).not.toBeNull()
    expect(store.curriculum).not.toBeNull()
    expect(store.isCustomCourse).toBe(true)
    expect(store.primarySchemeIds).toEqual(['xiaohe', 'slow', 'fast', 'bad', 'preview'])
    expect(storage.getItem(STORAGE_KEYS.scheme)).toBe('xiaohe')
    expect(loadIndex).toHaveBeenCalledTimes(1)
    expect(loadScheme).toHaveBeenCalledWith('xiaohe')
    expect(loadCurriculum).toHaveBeenCalledWith('xiaohe', expect.objectContaining({ id: 'xiaohe' }), true)
  })

  it('并发 init single-flight，只加载一次', async () => {
    const store = useCourseStore()
    await Promise.all([store.init(), store.init(), store.init()])
    expect(loadIndex).toHaveBeenCalledTimes(1)
    expect(loadScheme).toHaveBeenCalledTimes(1)
  })

  it('快速切换方案时旧请求不覆盖新选择（epoch 竞态）', async () => {
    const store = useCourseStore()
    await store.init()

    let resolveSlow: ((value: SchemeDef) => void) | undefined
    vi.mocked(loadScheme).mockImplementation((id: string) => {
      if (id === 'slow') {
        return new Promise<SchemeDef>((resolve) => {
          resolveSlow = resolve
        })
      }
      return Promise.resolve(mockScheme(id))
    })

    const slow = store.selectScheme('slow')
    const fast = store.selectScheme('fast')
    await fast
    expect(store.schemeId).toBe('fast')

    resolveSlow?.(mockScheme('slow'))
    await slow
    expect(store.schemeId).toBe('fast')
    expect(store.status).toBe('ready')
  })

  it('加载失败进入 error，保留当前可用方案', async () => {
    const store = useCourseStore()
    await store.init()
    vi.mocked(loadScheme).mockRejectedValueOnce(new Error('boom'))

    await store.selectScheme('bad')
    expect(store.status).toBe('error')
    expect(store.error).toContain('boom')
    expect(store.schemeId).toBe('xiaohe')
  })

  it('未登记定制课程的方案在运行期生成通用课程', async () => {
    const store = useCourseStore()
    await store.init()

    await store.selectScheme('fast')
    expect(store.schemeId).toBe('fast')
    expect(store.isCustomCourse).toBe(false)
    expect(store.curriculum).not.toBeNull()
    expect(loadCurriculum).toHaveBeenCalledWith('fast', expect.objectContaining({ id: 'fast' }), false)
    expect(store.status).toBe('ready')
  })

  it('已就绪后重复 init 直接返回，不再请求', async () => {
    const store = useCourseStore()
    await store.init()
    const before = vi.mocked(loadIndex).mock.calls.length
    await store.init()
    expect(vi.mocked(loadIndex).mock.calls.length).toBe(before)
  })
})
