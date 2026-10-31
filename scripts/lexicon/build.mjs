#!/usr/bin/env node
/**
 * 统一 Lexicon 构建器（过渡第一版）。
 *
 * 输入：已经清洗/校验过的公共词库、训练字库、课程词池与 anchors。
 * 输出：data/lexicon/lexicon.json —— 课程与练习场共享的唯一词表。
 *
 * 这一版先合并现有已过滤数据，保证行为可回归；下一步把词条选择与生僻过滤
 * 也收进同一构建器，再删除 data/pools 与旧的 words/training 产物。
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  ANCHORS_FILE,
  POOLS_DIR,
  POOLS_INDEX_FILE,
  TRAINING_BANK_FILE,
  WORDS_FILE,
  hash12,
  readJSON,
  writeJSON,
} from '../lib/data-contract.mjs'
import { toToneMarks } from '../../packages/core/src/index.ts'

const OUT_DIR = path.join(process.cwd(), 'data', 'lexicon')
const OUT_FILE = path.join(OUT_DIR, 'lexicon.json')

function main() {
  const wordDoc = readJSON(WORDS_FILE)
  const training = readJSON(TRAINING_BANK_FILE)
  const poolIndex = readJSON(POOLS_INDEX_FILE)
  const anchors = readJSON(ANCHORS_FILE)
  const words = new Map()
  const chars = new Map((training.chars ?? []).map((item) => [item.text, item]))
  const examples = new Map()

  const addWord = (item) => {
    if (!item?.text || item.length < 2 || item.length > 5) return
    if (!words.has(item.text)) words.set(item.text, item)
  }
  for (const item of wordDoc.words ?? []) addWord(item)

  for (const meta of poolIndex.lessons ?? []) {
    const file = path.join(POOLS_DIR, meta.file)
    if (!fs.existsSync(file)) continue
    const pool = readJSON(file)
    for (const item of pool.words ?? []) addWord(item)
    for (const item of pool.chars ?? []) if (!chars.has(item.text)) chars.set(item.text, item)
    for (const example of pool.examples ?? []) {
      const key = `${example.initial}${example.final}`
      if (!examples.has(key)) examples.set(key, example)
    }
  }

  // anchors 给每个合法音节提供代表字；池 examples 缺失的音节在这里补齐。
  for (const [syllable, list] of Object.entries(anchors.syllableChars ?? {})) {
    if (examples.has(syllable)) continue
    const char = (list ?? []).find((item) => chars.has(item))
    if (!char) continue
    const entry = chars.get(char)
    const s = entry?.syllables?.[0]
    if (!s) continue
    const pinyin = `${s.initial}${s.final}`
    examples.set(syllable, {
      char,
      pinyin,
      pinyinTone: s.tone ? toToneMarks(pinyin, s.tone) : pinyin,
      initial: s.initial,
      final: s.final,
      ...(s.tone ? { tone: s.tone } : {}),
    })
  }

  const wordList = [...words.values()].sort((a, b) => (b.freq ?? 0) - (a.freq ?? 0))
  const charList = [...chars.values()].sort((a, b) => (b.freq ?? 0) - (a.freq ?? 0))
  const exampleList = Object.fromEntries([...examples.entries()].sort(([a], [b]) => a.localeCompare(b)))
  const payload = {
    schemaVersion: 1,
    description: '课程与练习场共享的唯一 Lexicon（词 + 单字 + 教学示例），由已清洗数据合并。',
    source: {
      words: wordDoc.dataVersion,
      pools: poolIndex.dataVersion,
      training: training.dataVersion,
    },
    words: wordList,
    chars: charList,
    syllableExamples: exampleList,
  }
  const contentSha256 = hash12(JSON.stringify(payload))
  const doc = { ...payload, dataVersion: `lexicon-${contentSha256}` }
  writeJSON(OUT_FILE, doc, { pretty: false })
  console.log(
    `[lexicon] ${wordList.length} 词 / ${charList.length} 字 / ${Object.keys(exampleList).length} 音节示例 ` +
      `→ data/lexicon/lexicon.json (${doc.dataVersion})`,
  )
}

main()
