/**
 * 唯一存储访问点：localStorage / sessionStorage 的读写与 JSON 校验。
 *
 * - 键名统一集中在 STORAGE_KEYS，其他模块禁止再写裸 key 字符串；
 * - 所有访问容错（隐私模式 / 配额 / 禁用存储 / SSR），失败返回 null / false，不抛出；
 * - StorageLike 可注入，便于 Node 环境单测。
 */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

type StorageKind = 'local' | 'session'

/** 应用全部持久化键名（唯一定义处）。 */
export const STORAGE_KEYS = {
  /** 上次使用的双拼方案 id */
  scheme: 'shuangpin-next:scheme',
  /** 是否解锁全部课程（'1' = 解锁） */
  unlockAll: 'shuangpin-next:unlock-all',
  /** 主题：'light' | 'dark' */
  theme: 'shuangpin-next:theme',
  /** 音效开关：'0' = 关闭，其余 = 开启 */
  sound: 'shuangpin-next:sound',
  /** 每套方案的学习进度：Record<lessonId, LessonProgress> */
  progress: (schemeId: string): string => `shuangpin-next:progress:${schemeId}`,
  /** 每套方案的练习场设置快照 */
  trainingConfig: (schemeId: string): string => `shuangpin-next:training-config:${schemeId}`,
  /** 课程总结卡 → 练习场的一次性预设（sessionStorage） */
  trainingPreset: 'shuangpin-next:training-preset',
  /** 学习地图滚动位置（sessionStorage，按方案） */
  mapScroll: (schemeId: string): string => `shuangpin-next:map-scroll:${schemeId}`,
  /** 学习地图折叠的章节 id（localStorage，按方案，逗号分隔） */
  mapCollapsed: (schemeId: string): string => `shuangpin-next:map-collapsed:${schemeId}`,
} as const

/** 浏览器存储；不可用（无 window / 隐私模式 / 禁用存储）时返回 null。 */
export function getStorage(kind: StorageKind): StorageLike | null {
  if (typeof window === 'undefined') return null
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

/** 显式传入 undefined 时使用默认 localStorage；显式传入 null 表示不可用。 */
function resolveStorage(storage: StorageLike | null | undefined): StorageLike | null {
  return storage === undefined ? getStorage('local') : storage
}

export function readString(
  key: string,
  storage?: StorageLike | null,
): string | null {
  const target = resolveStorage(storage)
  if (!target) return null
  try {
    return target.getItem(key)
  } catch {
    return null
  }
}

export function writeString(
  key: string,
  value: string,
  storage?: StorageLike | null,
): boolean {
  const target = resolveStorage(storage)
  if (!target) return false
  try {
    target.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function removeKey(
  key: string,
  storage?: StorageLike | null,
): boolean {
  const target = resolveStorage(storage)
  if (!target) return false
  try {
    target.removeItem(key)
    return true
  } catch {
    return false
  }
}

/**
 * 读取并校验 JSON：缺失 / 损坏 / 校验不通过都返回 null。
 * @param parse 把 unknown 解析为期望类型；返回 null 表示内容不可用。
 */
export function readJSON<T>(
  key: string,
  parse: (raw: unknown) => T | null,
  storage?: StorageLike | null,
): T | null {
  const raw = readString(key, storage)
  if (raw === null) return null
  try {
    return parse(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export function writeJSON(
  key: string,
  value: unknown,
  storage?: StorageLike | null,
): boolean {
  try {
    return writeString(key, JSON.stringify(value), storage)
  } catch {
    return false
  }
}
