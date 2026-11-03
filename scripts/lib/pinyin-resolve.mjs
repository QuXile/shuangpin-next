/**
 * 构建期拼音解析：pinyin-pro → core 规范音节。
 * 数据里不再存拼音；生成课程、校验词库时用这里解析。
 */
import { pinyin } from 'pinyin-pro'
import { entryFromPinyin } from '../../packages/core/src/index.ts'

const PINYIN_OPTIONS = { toneType: 'num', toneSandhi: false }

/** 文本（汉字）→ 逐字带调拼音 token */
function pinyinTokensOf(text) {
  return pinyin(text, { ...PINYIN_OPTIONS, type: 'array' })
}

/**
 * 词库源数据（entries: text+freq）→ 运行时词表。
 * 无法解析成方案音节口径的词条会被跳过并记录。
 */
export function resolveLexicon(lexicon) {
  const words = []
  const chars = []
  const invalid = []
  let wordRank = 0
  let charRank = 0
  for (const entry of lexicon.entries ?? []) {
    const text = String(entry.text ?? '')
    const freq = Number(entry.freq)
    if (!text || !Number.isFinite(freq)) {
      invalid.push(text)
      continue
    }
    const resolved = entryFromPinyin(text, freq, pinyinTokensOf(text))
    if (!resolved) {
      invalid.push(text)
      continue
    }
    if (resolved.length === 1) {
      resolved.freqRank = ++charRank
      chars.push(resolved)
    } else {
      resolved.freqRank = ++wordRank
      words.push(resolved)
    }
  }
  return { words, chars, syllableExamples: lexicon.syllableExamples ?? {}, invalid }
}
