/**
 * 词库拼音解析：数据只存词条文本与词频，拼音由 pinyin-pro 在运行时解析。
 * pinyin-pro 通过动态 import 加载为独立 chunk，不进入主包。
 */
import type { Lexicon, ResolvedLexicon, WordEntry } from '@shuangpin/core'
import { entryFromPinyin } from '@shuangpin/core'

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

/** 词库源数据 → 运行时词表（词条按文本长度拆成词 / 单字，词频顺序保留）。 */
export async function resolveLexicon(source: Lexicon): Promise<ResolvedLexicon> {
  const tokensByText = new Map<string, string[]>()
  const texts = source.entries.map((entry) => entry.text)
  const { pinyin } = await loadPinyin()
  for (const text of texts) tokensByText.set(text, pinyin(text, { ...PINYIN_OPTIONS, type: 'array' }))

  const words: WordEntry[] = []
  const chars: WordEntry[] = []
  let wordRank = 0
  let charRank = 0
  for (const entry of source.entries) {
    const resolved = entryFromPinyin(entry.text, entry.freq, tokensByText.get(entry.text) ?? [])
    if (!resolved) continue
    if (resolved.length === 1) {
      resolved.freqRank = ++charRank
      chars.push(resolved)
    } else {
      resolved.freqRank = ++wordRank
      words.push(resolved)
    }
  }
  return { words, chars, syllableExamples: source.syllableExamples }
}
