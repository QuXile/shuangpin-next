#!/usr/bin/env node
/**
 * 训练场训练库构建器。
 *
 * 输出 data/training/bank.json：
 *   { schemaVersion, dataVersion, generatedAt, description, chars: WordEntry[], words: WordEntry[] }
 *   - chars：jieba 单字词条（合法拼音 + 常用字过滤，覆盖全部声母×韵母组合的保底补字）；
 *   - words：直接复用 data/words/words.sample.json 的 8000 词；
 *   - dataVersion = training-<sha256(JSON.stringify({schemaVersion, chars, words}))[:12]>，可重算。
 *
 * 用法：node scripts/training/build-training-bank.mjs
 */
import fs from 'node:fs'
import {
  TRAINING_BANK_FILE,
  WORDS_FILE,
  readJSON,
  trainingVersionOf,
  writeJSON,
} from '../lib/data-contract.mjs'
import { loadDictionary, toWordEntry } from '../word-pipeline/lib/wordbank.mjs'
import { WORD_POLICY } from '../word-pipeline/lib/wordbank.mjs'
import { splitPinyin } from '../../packages/core/src/index.ts'

const SCHEMA_VERSION = '1.0.0'
const COMMON_CHAR_RANK = WORD_POLICY.pools?.qualityMaxCharRank ?? 4000

function main() {
  const startedAt = Date.now()
  const wordsDoc = readJSON(WORDS_FILE)
  const words = wordsDoc.words ?? []
  if (words.length === 0) throw new Error('缺少 words.sample.json 词条')

  // 常用字集合：出现在 8000 词条中的字（与 anchors 的常用字口径一致）。
  const commonChars = new Set()
  for (const word of words) {
    for (const char of word.chars ?? []) commonChars.add(char)
  }

  const dictionary = loadDictionary()
  const charEntries = []
  const bySyllable = new Map()
  const seenChars = new Set()
  for (const single of dictionary.singles) {
    if (seenChars.has(single.text)) continue
    if (!commonChars.has(single.text)) continue
    const entry = toWordEntry(single.text, single.freq, dictionary.charRank, dictionary.rankCount)
    if (!entry || entry.chars.length !== 1) continue
    const syllable = entry.syllables[0]
    if (!splitPinyin(syllable.pinyin)) continue
    if ((entry.minCharRank ?? Infinity) > COMMON_CHAR_RANK) continue
    seenChars.add(entry.text)
    charEntries.push(entry)
    if (!bySyllable.has(syllable.pinyin)) bySyllable.set(syllable.pinyin, entry)
  }

  // 覆盖保底：任何合法单字音节都至少补一个代表字（可能超出常用字阈值）。
  let coverageFallback = 0
  for (const single of dictionary.singles) {
    if (seenChars.has(single.text)) continue
    const entry = toWordEntry(single.text, single.freq, dictionary.charRank, dictionary.rankCount)
    if (!entry) continue
    const syllable = entry.syllables[0]
    if (bySyllable.has(syllable.pinyin)) continue
    seenChars.add(entry.text)
    charEntries.push(entry)
    bySyllable.set(syllable.pinyin, entry)
    coverageFallback += 1
  }

  // 全局字符排名（供训练页展示排序；与词条 WordEntry 字段兼容）。
  charEntries.sort((a, b) => b.freq - a.freq || (a.text < b.text ? -1 : 1))
  charEntries.forEach((entry, index) => {
    entry.freqRank = index + 1
  })

  const bank = {
    schemaVersion: SCHEMA_VERSION,
    dataVersion: '',
    generatedAt: new Date().toISOString(),
    description: '训练场字/词训练库：单字来自 jieba 单字词条（合法拼音 + 常用字过滤），词语来自 8000 词库。',
    chars: charEntries,
    words,
  }
  bank.dataVersion = trainingVersionOf(bank)
  // 训练库为一次性加载的大文件：落盘用单行压缩 JSON，减小静态资源体积。
  writeJSON(TRAINING_BANK_FILE, bank, { pretty: false })
  const bytes = fs.statSync(TRAINING_BANK_FILE).size
  console.log(
    `[training] chars ${charEntries.length} / words ${words.length} / 覆盖音节 ${bySyllable.size}（保底补字 ${coverageFallback}）`,
  )
  console.log(
    `[training] ${bank.dataVersion} · ${(bytes / 1024 / 1024).toFixed(2)} MB · ${Date.now() - startedAt}ms → data/training/bank.json`,
  )
}

main()
