/**
 * 共享词库构建逻辑：jieba 词典解析 → 规范词条。
 *
 * build.mjs（产出 words.sample.json）与 build-pools.mjs（产出课程词池）共用本模块，
 * 避免出现两套拼音拆分 / tone 口径 / polyphone 口径。
 *
 * 拼音拆分与规范化复用 @shuangpin/core 的 TS 实现（Node ≥ 24 原生 TS 导入）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pinyin } from 'pinyin-pro'
import { splitPinyin, normalizePinyin } from '../../../packages/core/src/index.ts'
import {
  RAW_DICT_FILE,
  WORD_POLICY_FILE,
  sha256,
} from '../../lib/data-contract.mjs'

let wordPolicy = { wordBank: {}, pools: {} }
try {
  wordPolicy = JSON.parse(fs.readFileSync(WORD_POLICY_FILE, 'utf8'))
} catch {
  // 策略文件缺失时使用下面兜底值；validate-all 会硬失败提示补齐。
}

export const WORD_POLICY = wordPolicy
export const ERHUA_KEEP = new Set(wordPolicy.wordBank?.erhuaKeep ?? [])
export const BLOCKED_POS = new Set(wordPolicy.pools?.blockedPosTags ?? ['nr', 'nz', 'x'])

const CJK_RE = /^[\u4e00-\u9fff]+$/

/** 词条里字段顺序固定，保证内容 hash 可复现。 */
function makeEntry(text, freq, syllables, minCharRank) {
  return {
    text,
    length: text.length,
    freq,
    syllables,
    chars: [...text],
    minCharRank,
  }
}

/** 解析 jieba dict.txt（每行：词 频次 词性）。 */
export function parseJiebaDict(text) {
  const singles = []
  const raw = []
  for (const line of text.split('\n')) {
    if (!line) continue
    const parts = line.split(' ')
    if (parts.length !== 3) continue
    const [word, freqText, pos] = parts
    const freq = Number(freqText)
    if (!Number.isFinite(freq)) continue
    if (CJK_RE.test(word) && word.length === 1) singles.push({ text: word, freq })
    if (!/^[\u4e00-\u9fff]{2,5}$/.test(word)) continue
    if (word.endsWith('儿') && !ERHUA_KEEP.has(word)) continue
    raw.push({ text: word, freq, pos })
  }
  singles.sort((a, b) => b.freq - a.freq || (a.text < b.text ? -1 : 1))
  raw.sort((a, b) => b.freq - a.freq || (a.text < b.text ? -1 : 1))
  return { singles, raw }
}

function buildCharRank(singles) {
  const charRank = new Map(singles.map((item, index) => [item.text, index + 1]))
  return { charRank, rankCount: singles.length }
}

function toneFromToned(toned) {
  const match = /(\d)$/.exec(toned)
  const tone = match ? Number(match[1]) : 5
  return tone === 0 ? 5 : tone
}

/**
 * 一个词 → 规范 WordEntry；无合法拆分返回 null（异常音节整词丢弃）。
 * 口音：pinyin-pro 词上下文取音（关闭变调）；pinyin = initial+final（ü→v）；tone ∈ 1..5。
 */
export function toWordEntry(text, freq, charRank, rankCount) {
  let toned
  try {
    toned = pinyin(text, { toneType: 'num', type: 'array', toneSandhi: false })
  } catch {
    return null
  }
  if (!Array.isArray(toned) || toned.length !== text.length) return null
  const chars = [...text]
  const syllables = []
  for (let index = 0; index < chars.length; index += 1) {
    const toneless = normalizePinyin(toned[index].replace(/\d/g, ''))
    const split = splitPinyin(toneless)
    if (!split) return null
    syllables.push({
      text: chars[index],
      pinyin: `${split.initial}${split.final}`,
      initial: split.initial,
      final: split.final,
      tone: toneFromToned(toned[index]),
    })
  }
  const minCharRank = Math.max(...chars.map((ch) => charRank.get(ch) ?? rankCount + 1000))
  return makeEntry(text, freq, syllables, minCharRank)
}

/** 解析全量词表并按全局词频排名分配 freqRank（只保留可规范拆分的 2–4 字词）。 */
export function loadDictionary({ rawDictFile = RAW_DICT_FILE, limit = Infinity } = {}) {
  const dictBuf = fs.readFileSync(rawDictFile)
  const { singles, raw } = parseJiebaDict(dictBuf.toString('utf8'))
  const { charRank, rankCount } = buildCharRank(singles)
  const entries = []
  const posByText = new Map()
  for (const item of raw) {
    if (entries.length >= limit) break
    const entry = toWordEntry(item.text, item.freq, charRank, rankCount)
    if (!entry) continue
    posByText.set(entry.text, item.pos)
    entries.push(entry)
  }
  entries.forEach((entry, index) => {
    entry.freqRank = index + 1
  })
  return {
    entries,
    posByText,
    singles,
    dictSha256: sha256(dictBuf),
    charRank,
    rankCount,
    rawCount: raw.length,
    singleCount: singles.length,
  }
}

// ── 多音字标记 ────────────────────────────────────────────────

const charReadingsCache = new Map()

function charReadings(ch) {
  if (!charReadingsCache.has(ch)) {
    charReadingsCache.set(
      ch,
      pinyin(ch, { multiple: true, type: 'array', toneType: 'num', toneSandhi: false }),
    )
  }
  return charReadingsCache.get(ch)
}

const tonelessOf = (toned) => normalizePinyin(String(toned).replace(/\d/g, ''))

/**
 * 多音字标记：词中无声调读音 != 单字常用读音（键位会变）时 polyphone=true。
 * 仅声调差异不置位。返回 true/false，并仅在 true 时写字段。
 */
export function markPolyphone(entry) {
  if (entry.polyphone !== undefined) return entry.polyphone
  const toned = pinyin(entry.text, { toneType: 'num', type: 'array', toneSandhi: false })
  let flagged = false
  for (let index = 0; index < entry.chars.length; index += 1) {
    const readings = charReadings(entry.chars[index])
    if (!Array.isArray(readings) || readings.length < 2) continue
    if (String(readings[0]) === String(toned[index])) continue
    if (tonelessOf(readings[0]) !== tonelessOf(toned[index])) {
      flagged = true
      break
    }
  }
  if (flagged) entry.polyphone = true
  return flagged
}

/** 单字声调（1..5；轻声=5）；读不到返回 undefined。供课程零声母示例生成复用。 */
export function charTone(char) {
  try {
    const toned = pinyin(char, { toneType: 'num' })
    const text = Array.isArray(toned) ? toned[0] : toned
    const match = /(\d)$/.exec(text ?? '')
    if (!match) return undefined
    const tone = Number(match[1])
    return tone === 0 ? 5 : tone
  } catch {
    return undefined
  }
}

// ── 工具 ──────────────────────────────────────────────────────

let pinyinProVersionCache = null

/** 读取实际使用的 pinyin-pro 版本（参与 words-* 版本 hash）。 */
export function pinyinProVersion() {
  if (pinyinProVersionCache) return pinyinProVersionCache
  const require = createRequire(import.meta.url)
  let dir
  try {
    dir = path.dirname(require.resolve('pinyin-pro/package.json'))
  } catch {
    dir = path.dirname(require.resolve('pinyin-pro'))
  }
  for (let depth = 0; depth < 6; depth += 1) {
    const file = path.join(dir, 'package.json')
    if (fs.existsSync(file)) {
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (pkg.name === 'pinyin-pro') {
        pinyinProVersionCache = pkg.version
        return pkg.version
      }
    }
    dir = path.dirname(dir)
  }
  throw new Error('无法定位 pinyin-pro 版本')
}

export { CJK_RE }
