import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { LessonResult } from '@shuangpin/core'
import { useProgressStore } from '../src/stores/progress.ts'

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
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
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
})
