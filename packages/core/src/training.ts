/**
 * 训练场纯函数：范围过滤、文章解析、条目装配、训练批次与文章计划。
 *
 * - 范围：条目的每个音节的 (initial, final) 都必须命中所选集合；零声母以 initial='' 参与，
 *   优先使用 zeroFinals（er 等只存在于 zeroInitial 中，不一定在普通韵母表里）；
 * - 焦点：可选约束，词至少有一个音节命中焦点原子才保留（课程组卷的同一口径）；
 * - 文章：只保留汉字；任何非汉字（标点/引号/括号/字母/数字/空白/换行）都作为换行分隔且不显示；
 *   连续分隔合并；每行最多 5 个汉字（满 5 自动换行）；保留标点造成的短行。
 */
import type {
  AtomId,
  ParsedArticle,
  PracticeWord,
  SchemeDef,
  SchemeEngine,
  TrainingAtomOptions,
  TrainingCommonAtoms,
  TrainingScope,
  WordEntry,
} from './types.ts'
import { atomId } from './pinyin.ts'
import { freeAtomsOf } from './scheme.ts'
import { buildPracticeWord } from './session.ts'
import { shuffleSeeded } from './selector.ts'

const HAN = /\p{Script=Han}/u

// ── 方案键位选项 ──────────────────────────────────────────────

/** 方案可选声母/韵母/零声母音节（零声母为独立选择集，不在 initials 内） */
export function atomOptionsOf(scheme: SchemeDef): TrainingAtomOptions {
  return {
    initials: Object.keys(scheme.initials),
    finals: Object.keys(scheme.finals),
    zeroFinals: Object.keys(scheme.zeroInitial),
  }
}

/** 单个方案里与全拼一致的声母、韵母、零声母音节（「全拼沿用」胶囊） */
export function freeTrainingAtoms(scheme: SchemeDef): TrainingCommonAtoms {
  const free = freeAtomsOf(scheme)
  return {
    initials: [...free.initials],
    finals: [...free.finals],
    zeroFinals: [...free.zero],
  }
}

// ── 范围过滤 / 文章解析 ──────────────────────────────────────

/** 该音节是否命中训练范围 */
export function syllableInTrainingScope(
  syllable: { initial: string; final: string },
  scope: TrainingScope,
): boolean {
  if (syllable.initial === '') {
    return scope.zeroFinals
      ? scope.zeroFinals.includes(syllable.final)
      : scope.initials.includes('') && scope.finals.includes(syllable.final)
  }
  return scope.finals.includes(syllable.final) && scope.initials.includes(syllable.initial)
}

/** 词是否命中至少一个焦点原子（焦点为空时不限制）。 */
function entryMatchesFocus(entry: WordEntry, focusAtoms: ReadonlySet<AtomId>): boolean {
  if (focusAtoms.size === 0) return true
  return entry.syllables.some((syllable) =>
    syllable.initial === ''
      ? focusAtoms.has(atomId('zero', syllable.final))
      : focusAtoms.has(atomId('initial', syllable.initial)) ||
        focusAtoms.has(atomId('final', syllable.final)),
  )
}

/** 过滤训练条目：空音节或任一音节不命中即排除；focusAtoms 非空时还要求词命中焦点。 */
export function filterTrainingEntries<T extends WordEntry>(
  entries: readonly T[],
  scope: TrainingScope,
  focusAtoms: readonly AtomId[] = [],
): T[] {
  const focus = new Set(focusAtoms)
  return entries.filter(
    (entry) =>
      entry.syllables.length > 0 &&
      entry.syllables.every((syllable) => syllableInTrainingScope(syllable, scope)) &&
      entryMatchesFocus(entry, focus),
  )
}

/** 解析文章：只留汉字，非汉字断行且不显示，每行最多 5 字 */
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

// ── 条目装配 / 训练批次 ──────────────────────────────────────

/** 词条 → 展示/判题模型；数据异常条目返回 null 由调用方跳过 */
export function entryToPracticeWord(engine: SchemeEngine, entry: WordEntry): PracticeWord | null {
  try {
    return buildPracticeWord(engine, entry)
  } catch {
    return null
  }
}

/** 批量装配，跳过异常条目 */

/**
 * 从条目取一批练习词（不足时循环补齐，跳过异常条目）。
 * 默认随机 seed；调用方传 seed 时结果完全可复现。
 */
export function buildTrainingBatch(
  engine: SchemeEngine,
  entries: readonly WordEntry[],
  count: number,
  seed = Math.floor(Math.random() * 0xffffffff),
): PracticeWord[] {
  if (entries.length === 0 || count <= 0) return []
  const words: PracticeWord[] = []
  let guard = 0
  while (words.length < count && guard < count * 4) {
    guard += 1
    const copy = shuffleSeeded(entries, seed + guard * 7919)
    for (const entry of copy) {
      if (words.length >= count) break
      const word = entryToPracticeWord(engine, entry)
      if (word) words.push(word)
    }
  }
  return words
}

