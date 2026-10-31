/**
 * 训练场的纯函数：范围过滤（字/词）与文章文本解析。
 *
 * - 范围：条目的每个音节的 (initial, final) 都必须命中所选集合；零声母以 initial='' 参与；
 * - 文章：只保留汉字；任何非汉字（标点/引号/括号/字母/数字/空白/换行）都作为换行分隔且不显示；
 *   连续分隔合并；每行最多 5 个汉字（满 5 自动换行）；保留标点造成的短行。
 */
import type { SchemeDef, WordEntry } from './types.ts'
import { freeAtomsOf } from './scheme.ts'

export interface TrainingScope {
  /** 选中的声母；含 '' 表示零声母（未传 zeroFinals 时的兼容用法） */
  initials: readonly string[]
  finals: readonly string[]
  /** 选中的零声母音节（按韵母名，如 a/ai/an…）；传空数组表示不练零声母 */
  zeroFinals?: readonly string[]
}

export interface ParsedArticle {
  chars: string[]
  /** 每行 1–5 个汉字（由标点/非汉字或满 5 触发换行） */
  lines: string[][]
}

const HAN = /\p{Script=Han}/u

/** 与全拼拼写完全一致的键位集合（free atoms）。 */
export interface TrainingCommonAtoms {
  initials: string[]
  finals: string[]
  zeroFinals: string[]
}

/** 单个方案里与全拼一致的声母、韵母、零声母音节。 */
export function freeTrainingAtoms(scheme: SchemeDef): TrainingCommonAtoms {
  const free = freeAtomsOf(scheme)
  return {
    initials: free.freeInitials,
    finals: free.freeFinals,
    zeroFinals: free.freeZero,
  }
}

/** 该音节是否命中训练范围 */
export function syllableInTrainingScope(
  syllable: { initial: string; final: string },
  scope: TrainingScope,
): boolean {
  if (syllable.initial === '') {
    // 零声母是独立选择集（er 等只存在于 zeroInitial 中，不一定在普通韵母表里）
    return scope.zeroFinals
      ? scope.zeroFinals.includes(syllable.final)
      : scope.initials.includes('') && scope.finals.includes(syllable.final)
  }
  return scope.finals.includes(syllable.final) && scope.initials.includes(syllable.initial)
}

/** 过滤训练条目：空音节或任一音节不命中即排除 */
export function filterTrainingEntries<T extends WordEntry>(
  entries: readonly T[],
  scope: TrainingScope,
): T[] {
  return entries.filter(
    (entry) => entry.syllables.length > 0 && entry.syllables.every((syllable) => syllableInTrainingScope(syllable, scope)),
  )
}

/** 解析文章：只留汉字，非汉字（标点/空白/换行/字母/数字）断行且不显示，每行最多 5 字 */
export function parseArticleText(text: string): ParsedArticle {
  const chars: string[] = []
  const lines: string[][] = []
  let line: string[] = []
  const closeLine = (): void => {
    if (line.length > 0) {
      lines.push(line)
      line = []
    }
  }
  for (const char of Array.from(text)) {
    if (HAN.test(char)) {
      chars.push(char)
      line.push(char)
      if (line.length === 5) closeLine()
    } else {
      closeLine()
    }
  }
  closeLine()
  return { chars, lines }
}
