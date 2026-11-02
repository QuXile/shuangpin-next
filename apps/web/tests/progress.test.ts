import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { LessonResult } from '@shuangpin/core'
import { useProgressStore, sanitizeProgress } from '../src/stores/progress.ts'
import { STORAGE_KEYS } from '../src/lib/storage.ts'

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

const result = (passed: boolean, stars: LessonResult['stars']): LessonResult => ({
  passed,
  stars,
  reasons: [],
})

describe('progress store', () => {
  let storage: Storage

  beforeEach(() => {
    storage = memoryStorage()
    vi.stubGlobal('window', { localStorage: storage, sessionStorage: memoryStorage() })
    vi.stubGlobal('localStorage', storage)
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('已通过/星级/最佳正确率取历史最优，较差重练不覆盖', () => {
    const store = useProgressStore()
    store.load('xiaohe')
    store.record('L1', result(true, 3), 0.98)
    store.record('L1', result(false, 0), 0.6)
    store.record('L1', result(true, 1), 0.9)

    expect(store.records.L1).toMatchObject({
      passed: true,
      stars: 3,
      bestAccuracy: 0.98,
      attempts: 3,
    })
  })

  it('持久化到集中键名，重新 load 可恢复', () => {
    const store = useProgressStore()
    store.load('xiaohe')
    store.record('L1', result(true, 2), 0.85)
    store.markStageCleared('L2', 'single')

    expect(storage.getItem(STORAGE_KEYS.progress('xiaohe'))).toBeTruthy()

    const reloaded = useProgressStore()
    reloaded.load('xiaohe')
    expect(reloaded.records.L1).toMatchObject({ passed: true, stars: 2, bestAccuracy: 0.85 })
    expect(reloaded.records.L2?.clearedStages).toEqual(['single'])
  })

  it('清除进度后持久化为空对象', () => {
    const store = useProgressStore()
    store.load('xiaohe')
    store.record('L1', result(true, 3), 1)
    store.clear()
    expect(store.records).toEqual({})
    const reloaded = useProgressStore()
    reloaded.load('xiaohe')
    expect(reloaded.records).toEqual({})
  })
})

describe('sanitizeProgress', () => {
  it('损坏条目被丢弃，合法条目被裁剪到合法范围', () => {
    const sanitized = sanitizeProgress({
      ok: {
        passed: true,
        stars: 9,
        bestAccuracy: 2,
        attempts: -3,
        updatedAt: 123,
        clearedStages: ['single', 'bogus', 'single', 'exam'],
      },
      missing: { passed: true, stars: 1 },
      wrongType: { passed: 'yes', stars: 1, bestAccuracy: 1, attempts: 1, updatedAt: 1 },
      notObject: 42,
      nullEntry: null,
    })
    expect(Object.keys(sanitized)).toEqual(['ok'])
    expect(sanitized.ok).toMatchObject({
      passed: true,
      stars: 3,
      bestAccuracy: 1,
      attempts: 0,
      clearedStages: ['single', 'exam'],
    })
  })

  it('非对象输入返回空记录', () => {
    expect(sanitizeProgress(null)).toEqual({})
    expect(sanitizeProgress([])).toEqual({})
    expect(sanitizeProgress('x')).toEqual({})
  })
})
