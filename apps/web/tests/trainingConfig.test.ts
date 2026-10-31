import { describe, expect, it } from 'vitest'
import {
  emptyTrainingConfig,
  readTrainingConfig,
  trainingConfigKey,
  writeTrainingConfig,
  type StorageLike,
} from '../src/lib/trainingConfig.ts'

function memoryStorage(seed: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(seed))
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  }
}

describe('trainingConfig', () => {
  it('按方案保存/读取，缺省与非法字段回退', () => {
    const storage = memoryStorage()
    const snapshot = {
      ...emptyTrainingConfig(),
      tab: 'article' as const,
      drillMode: 'word' as const,
      selectedInitials: ['zh', 1, null, 'ch'],
      selectedFinals: ['ai', 'ei'],
    }
    expect(writeTrainingConfig(storage, 'xiaohe', snapshot)).toBe(true)
    expect(storage.getItem(trainingConfigKey('xiaohe'))).toBeTruthy()
    expect(readTrainingConfig(storage, 'xiaohe')).toMatchObject({
      tab: 'article',
      drillMode: 'word',
      selectedInitials: ['zh', 'ch'],
      selectedFinals: ['ai', 'ei'],
    })
    expect(readTrainingConfig(storage, 'weiruan')).toBeNull()
  })

  it('损坏 JSON、空对象、写入异常都不会抛错', () => {
    const storage = memoryStorage({ [trainingConfigKey('xiaohe')]: '{bad' })
    expect(readTrainingConfig(storage, 'xiaohe')).toBeNull()
    expect(readTrainingConfig({ getItem: () => 'null' }, 'xiaohe')).toBeNull()
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('quota')
      },
    }
    expect(readTrainingConfig(broken, 'xiaohe')).toBeNull()
    expect(writeTrainingConfig(broken, 'xiaohe', emptyTrainingConfig())).toBe(false)
  })
})
