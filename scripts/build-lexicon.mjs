#!/usr/bin/env node
/**
 * 从 jieba 词典重建词表 data/lexicon/lexicon.json。
 *
 * 源：data/raw/jieba-dict.txt（MIT，gitignored；下载命令见 docs/DATA.md）
 * 规则：
 *  - 词：恰好 2–5 个汉字；排除人名 nr/nrfg/nrt、机构 nt、其他专名 nz；
 *    地名 ns 选择性保留（2 字词频 ≥100，3–5 字词频 ≥500）；按词频降序取前 50,000。
 *  - 单字：jieba 单字中取 GB2312 常用字，每个音节按词频取前 10；
 *    对没有常用字的音节，回退到 syllableExamples 的示例字（保证每个音节至少 1 个单字）。
 *  - 全部词条必须能被 pinyin-pro 解析为本应用音节，否则中止。
 */
import fs from 'node:fs'
import path from 'node:path'
import { LEXICON_FILE, ROOT, readJSON, writeJSON } from './lib/data-contract.mjs'
import { resolveLexicon, syllableOfChar } from './lib/pinyin-resolve.mjs'

const RAW_FILE = path.join(ROOT, 'data', 'raw', 'jieba-dict.txt')
const TARGET_WORDS = 50000
const HAN_WORD = /^[\u4e00-\u9fff]{2,5}$/
const HAN_CHAR = /^\p{Script=Han}$/u
const CHARS_PER_SYLLABLE = 10
const FALLBACK_CHAR_FREQ = 1
const DROP_POS = new Set(['nr', 'nrfg', 'nrt', 'nt', 'nz'])

/** 地名：保留常见短地名/高词频地名，过滤生僻行政区与低词频长地名。 */
function keepPlaceName(text, freq) {
  return text.length === 2 ? freq >= 100 : freq >= 500
}

function readRows() {
  if (!fs.existsSync(RAW_FILE)) {
    throw new Error(
      `缺少 jieba 词典：${path.relative(ROOT, RAW_FILE)}\n` +
        '下载命令：mkdir -p data/raw && curl -L -o data/raw/jieba-dict.txt https://raw.githubusercontent.com/fxsjy/jieba/master/jieba/dict.txt',
    )
  }
  const rows = []
  for (const line of fs.readFileSync(RAW_FILE, 'utf8').split('\n')) {
    const [word, rawFreq, pos = ''] = line.trim().split(' ')
    const freq = Number(rawFreq)
    if (!word || !Number.isInteger(freq)) continue
    rows.push({ word, freq, pos })
  }
  return rows
}

function selectWords(rows) {
  return rows
    .filter(({ word, freq, pos }) => {
      if (!HAN_WORD.test(word) || DROP_POS.has(pos)) return false
      return pos === 'ns' ? keepPlaceName(word, freq) : true
    })
    .sort((a, b) => b.freq - a.freq || (a.word < b.word ? -1 : a.word > b.word ? 1 : 0))
    .slice(0, TARGET_WORDS)
    .map(({ word, freq }) => ({ text: word, freq }))
}

/** GB2312 一二级汉字（6763 个常用简化字），用作单字表的常用字过滤。 */
function commonChars() {
  const decoder = new TextDecoder('gb2312')
  const set = new Set()
  for (let hi = 0xa1; hi <= 0xf7; hi += 1) {
    for (let lo = 0xa1; lo <= 0xfe; lo += 1) {
      const char = decoder.decode(Uint8Array.of(hi, lo))
      if (HAN_CHAR.test(char)) set.add(char)
    }
  }
  return set
}

function syllableKey(syllable) {
  return syllable.initial === '' ? `zero:${syllable.final}` : `${syllable.initial}:${syllable.final}`
}

function selectChars(rows, examples) {
  const common = commonChars()
  const groups = new Map()
  const freqByChar = new Map()
  for (const { word, freq } of rows) {
    if (!HAN_CHAR.test(word) || !common.has(word)) continue
    const syllable = syllableOfChar(word)
    if (!syllable) continue
    const key = syllableKey(syllable)
    freqByChar.set(word, freq)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push({ text: word, freq })
  }

  const chars = []
  const covered = new Set()
  for (const [key, list] of groups) {
    list.sort((a, b) => b.freq - a.freq || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0))
    for (const entry of list.slice(0, CHARS_PER_SYLLABLE)) chars.push(entry)
    covered.add(key)
  }

  // 某些音节没有 GB2312 常用字（如 eng、kei、chua、den）：回退到教学示例字，保证单字练习可用。
  const fallbacks = []
  for (const example of Object.values(examples)) {
    const key =
      example.initial === '' ? `zero:${example.final}` : `${example.initial}:${example.final}`
    if (covered.has(key)) continue
    const freq = freqByChar.get(example.char) ?? FALLBACK_CHAR_FREQ
    chars.push({ text: example.char, freq })
    fallbacks.push(`${key}=${example.char}`)
    covered.add(key)
  }
  return { chars, fallbacks }
}

function main() {
  const previous = readJSON(LEXICON_FILE)
  const rows = readRows()
  const words = selectWords(rows)
  const { chars, fallbacks } = selectChars(rows, previous.syllableExamples)
  const entries = [...words, ...chars].sort(
    (a, b) => b.freq - a.freq || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0),
  )
  const lexicon = {
    schemaVersion: 2,
    entries,
    syllableExamples: previous.syllableExamples,
  }

  const resolved = resolveLexicon(lexicon)
  if (resolved.invalid.length > 0) {
    throw new Error(`词条无法解析为本应用音节：${resolved.invalid.slice(0, 20).join(' ')}`)
  }
  writeJSON(LEXICON_FILE, lexicon)
  const tail = words[words.length - 1]
  console.log(
    `[lexicon] ${resolved.words.length} 词 + ${resolved.chars.length} 字 / ${Object.keys(lexicon.syllableExamples).length} 音节示例`,
  )
  console.log(`[lexicon] 单字回退（无 GB2312 常用字）：${fallbacks.join(' ') || '无'}`)
  console.log(`[lexicon] 第 ${TARGET_WORDS} 词词频 ${tail.freq}，尾部示例：${words.slice(-5).map((word) => word.text).join(' ')}`)
}

try {
  main()
} catch (error) {
  console.error('[lexicon] 失败：', error.message)
  process.exitCode = 1
}
