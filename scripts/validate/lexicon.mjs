/**
 * 统一 Lexicon 数据校验：规模下限 + 词/字/音节示例字段合法且无重复。
 */
import { FINALS } from '../../packages/core/src/index.ts'

const MIN_WORDS = 20000
const MIN_CHARS = 3000
const MIN_SYLLABLE_EXAMPLES = 390
/** 词表允许的韵母：core 规范 + 儿化 er。 */
const VALID_FINALS = new Set([...FINALS, 'er'])

export function validateLexicon(ctx) {
  const lexicon = ctx.readDataJSON('data/lexicon/lexicon.json')
  if (!lexicon) return
  ctx.lexicon = lexicon
  ctx.ok(
    /^lexicon-[0-9a-f]{12}$/.test(String(lexicon.dataVersion)),
    `lexicon.dataVersion 非法：${lexicon.dataVersion}`,
  )
  const words = lexicon.words ?? []
  const chars = lexicon.chars ?? []
  const examples = lexicon.syllableExamples ?? {}
  ctx.ok(words.length >= MIN_WORDS, `lexicon.words = ${words.length}，至少 ${MIN_WORDS} 词`)
  ctx.ok(chars.length >= MIN_CHARS, `lexicon.chars = ${chars.length}，至少 ${MIN_CHARS} 字`)
  ctx.ok(
    Object.keys(examples).length >= MIN_SYLLABLE_EXAMPLES,
    `lexicon.syllableExamples 少于 ${MIN_SYLLABLE_EXAMPLES} 个音节`,
  )

  const seenWords = new Set()
  for (const word of words) {
    if (seenWords.has(word.text)) ctx.ok(false, `lexicon 词重复：${word.text}`)
    seenWords.add(word.text)
    ctx.ok(
      typeof word.length === 'number' && word.length >= 2 && word.length <= 5,
      `lexicon 词长度异常：${word.text}`,
    )
    ctx.ok(word.length === word.chars?.length, `lexicon 词长与字数不一致：${word.text}`)
    if (!Array.isArray(word.syllables) || word.syllables.length === 0) {
      ctx.ok(false, `lexicon 词缺音节：${word.text}`)
      continue
    }
    for (const syllable of word.syllables) {
      if (!VALID_FINALS.has(syllable.final)) {
        ctx.ok(false, `lexicon 词 ${word.text} 的韵母非法：${syllable.final}`)
        break
      }
      if (syllable.tone !== undefined) {
        ctx.ok([1, 2, 3, 4, 5].includes(syllable.tone), `lexicon 词 ${word.text} 声调非法：${syllable.tone}`)
      }
    }
  }

  const seenChars = new Set()
  for (const char of chars) {
    if (seenChars.has(char.text)) ctx.ok(false, `lexicon 字重复：${char.text}`)
    seenChars.add(char.text)
    ctx.ok(char.text.length === 1, `lexicon 字长度异常：${char.text}`)
    ctx.ok(Number.isInteger(char.freqRank), `lexicon 字缺 freqRank：${char.text}`)
  }

  for (const [syllable, example] of Object.entries(examples)) {
    ctx.ok(
      typeof example.char === 'string' && example.char.trim().length > 0,
      `lexicon 音节 ${syllable} 缺字形示例`,
    )
    ctx.ok(
      typeof example.pinyin === 'string' && typeof example.pinyinTone === 'string',
      `lexicon 音节 ${syllable} 缺拼音`,
    )
  }
  ctx.note(
    `词表：${words.length} 词 / ${chars.length} 字 / ${Object.keys(examples).length} 音节示例 / ${lexicon.dataVersion}`,
  )
}
