/**
 * 统一 Lexicon 数据校验：规模下限 + 词条字段 + 拼音可解析性 + 音节示例。
 */
import { ZERO_INITIALS, FINALS } from '../../packages/core/src/index.ts'
import { resolveLexicon } from '../lib/pinyin-resolve.mjs'
import { lexiconVersionOf } from '../lib/data-contract.mjs'

const MIN_WORDS = 50000
const MIN_CHARS = 3000
const MIN_SYLLABLE_EXAMPLES = 390
const VALID_FINALS = new Set([...FINALS, ...ZERO_INITIALS])

export function validateLexicon(ctx) {
  const lexicon = ctx.readDataJSON('data/lexicon/lexicon.json')
  if (!lexicon) return
  ctx.ok(lexicon.schemaVersion === 2, `lexicon.schemaVersion 应为 2，实际 ${lexicon.schemaVersion}`)
  ctx.ok(
    /^lexicon-[0-9a-f]{12}$/.test(String(lexicon.dataVersion)),
    `lexicon.dataVersion 非法：${lexicon.dataVersion}`,
  )
  ctx.ok(
    lexicon.dataVersion === lexiconVersionOf(lexicon),
    `lexicon.dataVersion 与内容不匹配：${lexicon.dataVersion}`,
  )
  const entries = Array.isArray(lexicon.entries) ? lexicon.entries : []
  const examples = lexicon.syllableExamples ?? {}
  const wordCount = entries.filter((entry) => entry.text.length >= 2).length
  const charCount = entries.filter((entry) => entry.text.length === 1).length
  ctx.ok(wordCount >= MIN_WORDS, `lexicon 词条 = ${wordCount}，至少 ${MIN_WORDS} 词`)
  ctx.ok(charCount >= MIN_CHARS, `lexicon 单字 = ${charCount}，至少 ${MIN_CHARS} 字`)
  ctx.ok(
    Object.keys(examples).length >= MIN_SYLLABLE_EXAMPLES,
    `lexicon.syllableExamples 少于 ${MIN_SYLLABLE_EXAMPLES} 个音节`,
  )

  const seen = new Set()
  for (const entry of entries) {
    const text = entry.text
    if (typeof text !== 'string' || text.length === 0) {
      ctx.ok(false, 'lexicon 含空词条')
      continue
    }
    if (seen.has(text)) ctx.ok(false, `lexicon 词条重复：${text}`)
    seen.add(text)
    ctx.ok(/^[一-鿿]{1,5}$/.test(text), `lexicon 词条应只含 1–5 个汉字：${text}`)
    ctx.ok(Number.isInteger(entry.freq) && entry.freq > 0, `lexicon 词条词频非法：${text}`)
  }

  const resolved = resolveLexicon(lexicon)
  ctx.ok(
    resolved.invalid.length === 0,
    `lexicon 有 ${resolved.invalid.length} 个词条无法解析为本应用音节：${resolved.invalid.slice(0, 10).join(' ')}`,
  )
  for (const word of resolved.words) {
    for (const syllable of word.syllables) {
      if (!VALID_FINALS.has(syllable.final)) {
        ctx.ok(false, `lexicon 词 ${word.text} 的韵母非法：${syllable.final}`)
        break
      }
    }
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

  ctx.lexicon = resolved
  ctx.lexiconDataVersion = lexicon.dataVersion
  ctx.note(
    `词表：${resolved.words.length} 词 / ${resolved.chars.length} 字 / ${Object.keys(examples).length} 音节示例 / ${lexicon.dataVersion}`,
  )
}
