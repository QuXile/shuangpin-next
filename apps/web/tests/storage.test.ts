import { describe, expect, it } from 'vitest'
import {
  STORAGE_KEYS,
  readJSON,
  readString,
  removeKey,
  writeJSON,
  writeString,
  type StorageLike,
} from '../src/lib/storage.ts'

function memoryStorage(seed: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(seed))
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

const broken: StorageLike = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('quota')
  },
  removeItem: () => {
    throw new Error('blocked')
  },
}

describe('storage', () => {
  it('读写/删除字符串，键名集中定义且前缀统一', () => {
    const storage = memoryStorage()
    expect(readString(STORAGE_KEYS.theme, storage)).toBeNull()
    expect(writeString(STORAGE_KEYS.theme, 'dark', storage)).toBe(true)
    expect(readString(STORAGE_KEYS.theme, storage)).toBe('dark')
    expect(removeKey(STORAGE_KEYS.theme, storage)).toBe(true)
    expect(readString(STORAGE_KEYS.theme, storage)).toBeNull()

    expect(STORAGE_KEYS.scheme.startsWith('shuangpin-next:')).toBe(true)
    expect(STORAGE_KEYS.progress('xiaohe')).toBe('shuangpin-next:progress:xiaohe')
    expect(STORAGE_KEYS.trainingConfig('xiaohe')).toBe('shuangpin-next:training-config:xiaohe')
    expect(STORAGE_KEYS.mapScroll('xiaohe')).toBe('shuangpin-next:map-scroll:xiaohe')
  })

  it('JSON 读取：缺失/损坏/校验不通过都返回 null', () => {
    const storage = memoryStorage({ [STORAGE_KEYS.unlockAll]: '{bad' })
    expect(readJSON(STORAGE_KEYS.unlockAll, (raw) => raw as boolean, storage)).toBeNull()
    expect(readJSON('missing', (raw) => raw as boolean, storage)).toBeNull()

    writeJSON(STORAGE_KEYS.trainingPreset, { scheme: 'xiaohe' }, storage)
    expect(
      readJSON(STORAGE_KEYS.trainingPreset, (raw) => {
        const value = raw as { scheme?: unknown }
        return typeof value.scheme === 'string' ? value.scheme : null
      }, storage),
    ).toBe('xiaohe')
    expect(readJSON(STORAGE_KEYS.trainingPreset, () => null, storage)).toBeNull()
  })

  it('存储不可用/抛错时静默降级，不抛出', () => {
    expect(readString(STORAGE_KEYS.sound, null)).toBeNull()
    expect(writeString(STORAGE_KEYS.sound, '1', null)).toBe(false)
    expect(removeKey(STORAGE_KEYS.sound, null)).toBe(false)
    expect(readString(STORAGE_KEYS.sound, broken)).toBeNull()
    expect(writeString(STORAGE_KEYS.sound, '1', broken)).toBe(false)
    expect(removeKey(STORAGE_KEYS.sound, broken)).toBe(false)
    expect(readJSON(STORAGE_KEYS.sound, () => 1, broken)).toBeNull()
    expect(writeJSON(STORAGE_KEYS.sound, { a: 1 }, broken)).toBe(false)
  })

  it('writeJSON 序列化循环引用等异常时返回 false', () => {
    const storage = memoryStorage()
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(writeJSON(STORAGE_KEYS.trainingPreset, circular, storage)).toBe(false)
  })
})
