#!/usr/bin/env node
/**
 * 从 jieba 词典重建词表 data/lexicon/lexicon.json。
 *
 * 源：data/raw/jieba-dict.txt（MIT，gitignored；下载命令见 docs/DATA.md）
 * 规则（与历史词表口径一致，另按词频选择性保留常见地名）：
 *  - 恰好 2–5 个汉字（字母 / 数字 / 符号 / 空格自然排除）
 *  - 排除专名：人名 nr / nrfg / nrt，机构 nt，其他专名 nz
 *  - 地名 ns 选择性保留：2 字且词频 ≥100，或 3–5 字且词频 ≥500
 *  - 按词频降序取前 50,000 词；单字与 syllableExamples 沿用现有词表
 *  - 全部词条必须能被 pinyin-pro 解析为本应用音节，否则中止
 */
import fs from 'node:fs'
import path from 'node:path'
import { LEXICON_FILE, ROOT, readJSON, writeJSON, lexiconVersionOf } from './lib/data-contract.mjs'
import { resolveLexicon } from './lib/pinyin-resolve.mjs'

const RAW_FILE = path.join(ROOT, 'data', 'raw', 'jieba-dict.txt')
const TARGET_WORDS = 50000
const HAN_WORD = /^[\u4e00-\u9fff]{2,5}$/
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

function main() {
  const previous = readJSON(LEXICON_FILE)
  const chars = (previous.entries ?? []).filter((entry) => entry.text.length === 1)
  const words = selectWords(readRows())
  const entries = [...words, ...chars].sort(
    (a, b) => b.freq - a.freq || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0),
  )
  const lexicon = {
    schemaVersion: 2,
    description: '课程与练习场共享词表：只存词条文本与词频，拼音由运行时 pinyin-pro 解析。',
    source: {
      words: 'jieba dict.txt（MIT，按词性/词频清洗）',
      chars: '单字表沿用既有词表，只服务示例与单字练习',
    },
    dataVersion: '',
    entries,
    syllableExamples: previous.syllableExamples,
  }
  lexicon.dataVersion = lexiconVersionOf(lexicon)

  const resolved = resolveLexicon(lexicon)
  if (resolved.invalid.length > 0) {
    throw new Error(`词条无法解析为本应用音节：${resolved.invalid.slice(0, 20).join(' ')}`)
  }
  writeJSON(LEXICON_FILE, lexicon)
  const tail = words[words.length - 1]
  console.log(
    `[lexicon] ${resolved.words.length} 词 + ${resolved.chars.length} 字 / ${Object.keys(lexicon.syllableExamples).length} 音节示例`,
  )
  console.log(`[lexicon] 第 ${TARGET_WORDS} 词词频 ${tail.freq}，尾部示例：${words.slice(-5).map((word) => word.text).join(' ')}`)
  console.log(`[lexicon] dataVersion=${lexicon.dataVersion}`)
}

try {
  main()
} catch (error) {
  console.error('[lexicon] 失败：', error.message)
  process.exitCode = 1
}
