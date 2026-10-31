/**
 * 练习场的本地视图辅助：方案知识点选项、条目 → PracticeWord、文章行/跳过统计。
 * 过滤与解析规则本身在 core（filterTrainingEntries / parseArticleText）。
 */
import {
  buildPracticeWord,
  type PracticeWord,
  type SchemeDef,
  type SchemeEngine,
  type WordEntry,
} from '@shuangpin/core'

export interface TrainingAtomOptions {
  initials: string[]
  finals: string[]
  /** 零声母音节（按方案 zeroInitial 的键） */
  zeroFinals: string[]
}

/** 练习范围里与全拼一致的公共键位（用于「全拼沿用」子包）。 */
export interface CommonAtomEntry {
  kind: 'initial' | 'final' | 'zero'
  value: string
}

/** 方案可选声母/韵母（零声母为特殊项，不在 initials 内） */
export function trainingAtomOptions(scheme: SchemeDef): TrainingAtomOptions {
  return {
    initials: Object.keys(scheme.initials),
    finals: Object.keys(scheme.finals),
    zeroFinals: Object.keys(scheme.zeroInitial),
  }
}

/** 词条 → 展示/判题模型；数据异常条目返回 null 由调用方跳过 */
export function entryToPracticeWord(engine: SchemeEngine, entry: WordEntry): PracticeWord | null {
  try {
    return buildPracticeWord(engine, entry)
  } catch {
    return null
  }
}

export function entriesToPracticeWords(
  engine: SchemeEngine,
  entries: readonly WordEntry[],
): PracticeWord[] {
  const words: PracticeWord[] = []
  for (const entry of entries) {
    const word = entryToPracticeWord(engine, entry)
    if (word) words.push(word)
  }
  return words
}

export function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const value = items[i] as T
    items[i] = items[j] as T
    items[j] = value
  }
  return items
}

/** 从字库条目取一批练习词（不足时循环补齐） */
export function buildTrainingBatch(
  engine: SchemeEngine,
  entries: readonly WordEntry[],
  count: number,
): PracticeWord[] {
  if (entries.length === 0 || count <= 0) return []
  const words: PracticeWord[] = []
  let guard = 0
  while (words.length < count && guard < count * 4) {
    guard += 1
    const copy = shuffleInPlace([...entries])
    for (const entry of copy) {
      if (words.length >= count) break
      const word = entryToPracticeWord(engine, entry)
      if (word) words.push(word)
    }
  }
  return words
}

export interface ArticleCell {
  char: string
  /** 训练序列中的词下标；null = 字库外跳过 */
  wordIndex: number | null
}

export interface ArticlePlan {
  cells: ArticleCell[][]
  chars: string[]
  skipped: number
}

/** 把 core 解析出的行映射到字库：字库外汉字标记跳过（不练习） */
export function buildArticlePlan(
  lines: readonly string[][],
  bankChars: readonly WordEntry[],
): ArticlePlan {
  const lookup = new Map<string, WordEntry>()
  for (const entry of bankChars) {
    if (!lookup.has(entry.text)) lookup.set(entry.text, entry)
  }
  let wordIndex = 0
  let skipped = 0
  const chars: string[] = []
  const cells = lines.map((line) =>
    line.map((char) => {
      chars.push(char)
      const entry = lookup.get(char)
      if (!entry) {
        skipped += 1
        return { char, wordIndex: null }
      }
      const cell: ArticleCell = { char, wordIndex }
      wordIndex += 1
      return cell
    }),
  )
  return { cells, chars, skipped }
}

/** 文章练习的固定顺序词序列（字库外跳过） */
export function articlesToPracticeWords(
  engine: SchemeEngine,
  plan: ArticlePlan,
  bankChars: readonly WordEntry[],
): PracticeWord[] {
  const lookup = new Map<string, WordEntry>()
  for (const entry of bankChars) {
    if (!lookup.has(entry.text)) lookup.set(entry.text, entry)
  }
  const words: PracticeWord[] = []
  for (const line of plan.cells) {
    for (const cell of line) {
      if (cell.wordIndex === null) continue
      const entry = lookup.get(cell.char)
      if (!entry) continue
      const word = entryToPracticeWord(engine, entry)
      if (word) words.push(word)
    }
  }
  return words
}
