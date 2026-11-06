/**
 * 运行时词表解码：拼音解析已前置到构建期（scripts/lib/runtime-lexicon.mjs → data:sync），
 * 浏览器只把紧凑 JSON 解码成运行时词表，练习页不再加载 / 调用 pinyin-pro。
 * 文章练习仍要按上下文解析任意文本的拼音，因此保留 pinyin-pro 动态 import（独立 chunk，按需加载）。
 */
import type { ResolvedLexicon, Syllable, SyllableExample, Tone, WordEntry } from '@shuangpin/core'
import { splitPinyin } from '@shuangpin/core'

/** 运行时词表文件格式版本；与 scripts/lib/runtime-lexicon.mjs 的 RUNTIME_LEXICON_SCHEMA_VERSION 一致 */
export const RUNTIME_LEXICON_SCHEMA_VERSION = 3

/** 音节表一行：[汉字, 无声调拼音, 声调]；同一行在所有词条间共享同一个音节对象 */
export type RuntimeSyllable = [text: string, pinyin: string, tone: Tone]

/** 词条：[词频, 音节表下标...]；下标数量即词长，解码时据此分到 words / chars */
export type RuntimeLexiconEntry = [freq: number, ...syllableIds: number[]]

/** public/data/lexicon/lexicon.json（构建期预解析产物） */
export interface RuntimeLexiconFile {
  schemaVersion: number
  meta: {
    /** 源词表的归一化内容哈希（sync 缓存 / 陈旧检测用） */
    sourceHash: string
    /** 构建期解析口径版本 */
    resolverVersion: number
    /** 构建期使用的 pinyin-pro 版本（升级依赖后 sync 缓存自动失效） */
    pinyinVersion: string
    wordCount: number
    charCount: number
    syllableCount: number
  }
  syllableTable: RuntimeSyllable[]
  entries: RuntimeLexiconEntry[]
  syllableExamples: Record<string, SyllableExample>
}

/** 文本 → 逐字带调拼音 token（文章练习用；pinyin-pro 由动态 import 加载为独立 chunk） */
type PinyinModule = typeof import('pinyin-pro')
let pinyinModule: Promise<PinyinModule> | null = null

function loadPinyin(): Promise<PinyinModule> {
  pinyinModule ??= import('pinyin-pro')
  return pinyinModule
}

const PINYIN_OPTIONS = { toneType: 'num', toneSandhi: false } as const

/** 文本 → 逐字带调拼音 token（type=array 时与字符一一对应） */
export async function pinyinTokensOf(text: string): Promise<string[]> {
  const { pinyin } = await loadPinyin()
  return pinyin(text, { ...PINYIN_OPTIONS, type: 'array' })
}

/**
 * 紧凑运行时词表 → 运行时词表（同步、轻量）。
 *
 * 音节表只解码一次，词条共享其中的音节对象（避免 5 万词条重复分配）；
 * 词条按音节数分到 words / chars 并重新赋 freqRank，
 * 结果与构建期 resolveLexicon(source) 逐字段一致（由 scripts/validate 全量校验）。
 */
export function decodeRuntimeLexicon(file: RuntimeLexiconFile): ResolvedLexicon {
  if (file?.schemaVersion !== RUNTIME_LEXICON_SCHEMA_VERSION) {
    throw new Error(
      `词表数据版本不支持：${file?.schemaVersion}（期望 ${RUNTIME_LEXICON_SCHEMA_VERSION}，请重新运行 pnpm data:sync）`,
    )
  }
  const table: Syllable[] = file.syllableTable.map(([text, pinyin, tone]) => {
    const split = splitPinyin(pinyin)
    if (!split) throw new Error(`词表音节表含非法拼音：${pinyin}`)
    return { text, pinyin, initial: split.initial, final: split.final, tone }
  })
  const words: WordEntry[] = []
  const chars: WordEntry[] = []
  let wordRank = 0
  let charRank = 0
  for (const entry of file.entries) {
    if (entry.length <= 1) throw new Error('词表词条音节为空')
    const freq = entry[0]
    const syllableCount = entry.length - 1
    const syllables: Syllable[] = []
    for (let index = 1; index < entry.length; index += 1) {
      const syllable = table[entry[index]!]
      if (!syllable) throw new Error(`词表音节下标越界：${entry[index]}`)
      syllables.push(syllable)
    }
    const entryChars = syllables.map((syllable) => syllable.text)
    const word: WordEntry = {
      text: entryChars.join(''),
      length: syllableCount,
      freq,
      syllables,
      chars: entryChars,
    }
    if (syllableCount === 1) {
      word.freqRank = ++charRank
      chars.push(word)
    } else {
      word.freqRank = ++wordRank
      words.push(word)
    }
  }
  return { words, chars, syllableExamples: file.syllableExamples }
}
