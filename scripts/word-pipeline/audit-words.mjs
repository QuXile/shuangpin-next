#!/usr/bin/env node
/**
 * 词库只读审计。
 * 只统计数据，不修改 data/**；输出 Markdown 片段供 docs/WORDS.md 使用。
 *
 * 用法：node scripts/word-pipeline/audit-words.mjs
 */
import fs from 'node:fs'
import { pinyin } from 'pinyin-pro'
import {
  ANCHORS_FILE,
  CURRICULUM_DIR,
  POOLS_DIR,
  RAW_DICT_FILE,
  WORDS_FILE,
  WORD_POLICY_FILE,
  readJSON,
} from '../lib/data-contract.mjs'

const WORDS = readJSON(WORDS_FILE)
const POOLS = readJSON(`${POOLS_DIR}/index.json`)
const CURRICULUM = readJSON(`${CURRICULUM_DIR}/xiaohe.curriculum.json`)
const ANCHORS = readJSON(ANCHORS_FILE)
const POLICY = readJSON(WORD_POLICY_FILE)
const blockedPosTags = new Set(POLICY.pools?.blockedPosTags ?? [])
const words = WORDS.words
const lessons = new Map(CURRICULUM.lessons.map((lesson) => [lesson.id, lesson]))

// jieba 原始词性 / 单字排名
const posByWord = new Map()
const charRank = new Map()
if (fs.existsSync(RAW_DICT_FILE)) {
  const lines = fs.readFileSync(RAW_DICT_FILE, 'utf8').split('\n')
  const singles = []
  for (const line of lines) {
    const parts = line.split(' ')
    if (parts.length !== 3) continue
    const [text, freq, pos] = parts
    if (/^[\u4e00-\u9fff]{2,4}$/.test(text)) posByWord.set(text, pos)
    if (/^[\u4e00-\u9fff]$/.test(text)) singles.push({ text, freq: Number(freq) })
  }
  singles.sort((a, b) => b.freq - a.freq)
  singles.forEach((item, index) => charRank.set(item.text, index + 1))
}

const pct = (n, total) => (total ? ((n / total) * 100).toFixed(1) + '%' : '0%')
const charReadings = new Map()
for (const word of words) {
  for (const syllable of word.syllables) {
    const readings = charReadings.get(syllable.text) ?? new Set()
    readings.add(syllable.pinyin)
    charReadings.set(syllable.text, readings)
  }
}
const quantile = (values, q) => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))]
}

// ── 8000 词表 ────────────────────────────────────────────────
const lengthDist = {}
const posDist = {}
const blockedPos = new Set(['nr', 'nz', 'x', 'eng'])
let tone5Syllables = 0
let toneWords = 0
let polyphoneWords = 0
let rareCharWords = 0
let veryRareCharWords = 0
const minCharRanks = []
const blockedWords = []
for (const word of words) {
  lengthDist[word.length] = (lengthDist[word.length] ?? 0) + 1
  minCharRanks.push(word.minCharRank)
  if (word.syllables.some((syllable) => syllable.tone === 5)) toneWords += 1
  tone5Syllables += word.syllables.filter((syllable) => syllable.tone === 5).length
  if (word.polyphone) polyphoneWords += 1
  if (word.minCharRank > 2000) rareCharWords += 1
  if (word.minCharRank > 4000) veryRareCharWords += 1
  const pos = posByWord.get(word.text) ?? 'unknown'
  posDist[pos] = (posDist[pos] ?? 0) + 1
  if (blockedPos.has(pos)) blockedWords.push(`${word.text}(${pos})`)
}

// ── 词池 ────────────────────────────────────────────────────
const poolStats = []
const wordPoolCounts = new Map()
let totalEntries = 0
let charEntries = 0
let polyphoneCharEntries = 0
const polyphoneChars = []
const exampleCharRanks = []
const exampleRare = []
const exampleRareAvoidable = []
const exampleMissingChars = []
let exampleCharMissing = 0
for (const meta of POOLS.lessons) {
  const pool = readJSON(`${POOLS_DIR}/${meta.file}`)
  const lesson = lessons.get(meta.id)
  const unique = new Set(pool.words.map((word) => word.text))
  totalEntries += pool.words.length
  for (const word of pool.words) wordPoolCounts.set(word.text, (wordPoolCounts.get(word.text) ?? 0) + 1)
  const tone5 = pool.words.reduce(
    (sum, word) => sum + word.syllables.filter((syllable) => syllable.tone === 5).length,
    0,
  )
  const posTags = {}
  let blockedPosCount = 0
  for (const word of pool.words) {
    const pos = posByWord.get(word.text) ?? 'unknown'
    posTags[pos] = (posTags[pos] ?? 0) + 1
    if (blockedPosTags.has(pos)) blockedPosCount += 1
  }
  for (const char of pool.chars) {
    charEntries += 1
    if ((charReadings.get(char.text)?.size ?? 0) > 1) {
      polyphoneCharEntries += 1
      if (polyphoneChars.length < 20) polyphoneChars.push(char.text)
    }
  }
  for (const example of pool.examples) {
    const rank = charRank.get(example.char)
    const rareRank = POLICY.examples?.rareCharRank ?? 4000
    const candidates = ANCHORS.syllableChars?.[example.pinyin] ?? []
    const hasCommonCandidate = candidates.some((char) => (charRank.get(char) ?? Infinity) <= rareRank)
    if (rank === undefined) {
      exampleCharMissing += 1
      if (!exampleMissingChars.includes(example.char)) exampleMissingChars.push(example.char)
    } else {
      exampleCharRanks.push(rank)
      if (rank > 2000) exampleRare.push({ char: example.char, syllable: example.pinyin, rank })
    }
    if ((rank === undefined || rank > rareRank) && hasCommonCandidate) exampleRareAvoidable.push(example.char)
  }
  poolStats.push({
    id: meta.id,
    title: lesson?.title ?? meta.title,
    kind: meta.kind,
    finalAtoms: (lesson?.focusAtoms ?? []).filter((atom) => atom.startsWith('final:')).map((atom) => atom.slice(6)),
    words: pool.words.length,
    unique: unique.size,
    chars: pool.chars.length,
    examples: pool.examples.length,
    tone5,
    posTags,
    blockedPosCount,
  })
}

const repeatedAcrossPools = [...wordPoolCounts.values()].filter((count) => count > 1).length
const repeatedOccurrences = [...wordPoolCounts.values()].reduce((sum, count) => sum + (count - 1), 0)
const topRepeated = [...wordPoolCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)

const byKind = {}
for (const stat of poolStats) byKind[stat.kind] = (byKind[stat.kind] ?? 0) + 1
const wordCounts = poolStats.map((stat) => stat.words)
const rareFinalStats = poolStats
  .filter((stat) => stat.finalAtoms.some((final) => ['ve', 'ue', 'iong', 'iang', 'uang'].includes(final)))
  .map((stat) => `${stat.id}(${stat.title}) words=${stat.words} chars=${stat.chars} examples=${stat.examples} finals=${stat.finalAtoms.join('/')}`)

// ── 输出 JSON（供文档引用/二次加工） ─────────────────────────
console.log(JSON.stringify({
  words: {
    count: words.length,
    dataVersion: WORDS.dataVersion,
    lengthDist,
    tone5Syllables,
    tone5RatioSyllables: pct(tone5Syllables, words.reduce((sum, word) => sum + word.length, 0)),
    toneWords,
    polyphoneWords,
    polyphoneRatio: pct(polyphoneWords, words.length),
    rareCharWords,
    veryRareCharWords,
    minCharRankQuantiles: {
      p50: quantile(minCharRanks, 0.5),
      p90: quantile(minCharRanks, 0.9),
      p99: quantile(minCharRanks, 0.99),
      max: Math.max(...minCharRanks),
    },
    posDist,
    blockedPosWords: blockedWords.slice(0, 20),
    blockedPosCount: blockedWords.length,
  },
  pools: {
    dataVersion: POOLS.dataVersion,
    lessonCount: poolStats.length,
    byKind,
    totalEntries,
    uniqueWords: wordPoolCounts.size,
    minWordsPerLesson: Math.min(...wordCounts),
    maxWordsPerLesson: Math.max(...wordCounts),
    repeatedAcrossPools,
    repeatedOccurrences,
    duplicateRate: pct(repeatedOccurrences, totalEntries),
    blockedPosHits: poolStats.reduce((sum, stat) => sum + stat.blockedPosCount, 0),
    blockedPosTags: [...blockedPosTags],
    topRepeated,
    charEntries,
    polyphoneCharEntries,
    polyphoneCharRatio: pct(polyphoneCharEntries, charEntries),
    polyphoneChars,
    exampleCount: poolStats.reduce((sum, stat) => sum + stat.examples, 0),
    exampleCharRankP50: quantile(exampleCharRanks, 0.5),
    exampleCharRankP90: quantile(exampleCharRanks, 0.9),
    exampleCharRankMax: exampleCharRanks.length ? Math.max(...exampleCharRanks) : null,
    exampleCharMissing,
    exampleMissingChars,
    exampleCharRankGt2000: exampleCharRanks.filter((rank) => rank > 2000).length,
    exampleCharRankGt4000: exampleCharRanks.filter((rank) => rank > 4000).length,
    exampleRareRatio: pct(exampleCharRanks.filter((rank) => rank > 4000).length + exampleCharMissing, exampleCharRanks.length + exampleCharMissing),
    exampleRareAvoidable: [...new Set(exampleRareAvoidable)],
    exampleRare: exampleRare.sort((a, b) => b.rank - a.rank).slice(0, 15),
    rareFinalStats,
    rareFinalLessons: poolStats
      .filter((stat) => ['ve', 'ue'].some((final) => stat.finalAtoms.includes(final)))
      .map((stat) => ({ id: stat.id, title: stat.title, words: stat.words, chars: stat.chars, examples: stat.examples })),
    poolPosTotals: poolStats.reduce((acc, stat) => {
      for (const [pos, count] of Object.entries(stat.posTags)) acc[pos] = (acc[pos] ?? 0) + count
      return acc
    }, {}),
    poolRareCharEntries: (() => {
      let gt2000 = 0
      let gt4000 = 0
      for (const meta of POOLS.lessons) {
        const pool = readJSON(`${POOLS_DIR}/${meta.file}`)
        for (const word of pool.words) {
          if (word.minCharRank > 2000) gt2000 += 1
          if (word.minCharRank > 4000) gt4000 += 1
        }
      }
      return { gt2000, gt4000 }
    })(),
    charsUnique: (() => {
      const chars = new Set()
      for (const meta of POOLS.lessons) {
        const pool = readJSON(`${POOLS_DIR}/${meta.file}`)
        for (const char of pool.chars) chars.add(char.text)
      }
      return chars.size
    })(),
  },
}, null, 2))
