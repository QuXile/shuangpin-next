#!/usr/bin/env node
/**
 * 词库构建器（唯一产出 data/words/words.sample.json）。
 *
 * 输入：data/raw/jieba-dict.txt（jieba dict.txt，MIT；缺失时自动下载）
 * 输出：data/words/words.sample.json
 *
 * 生成规则：
 *   - 2–5 字纯汉字词，儿化词丢弃（保留少量独立“儿”音节词）；
 *   - 公共词库 = 8000 高频基础词 + 3 字/4 字成语/5 字补充词（默认共 10000）；
 *   - 词上下文拼音；pinyin = initial + final（ü→v）；tone ∈ 1..5（0 → 5）；
 *   - polyphone 保留；freqRank 为全量词表全局排名；
 *   - dataVersion = words-<12hex>（与 validate-all 共用 scripts/lib/data-contract.mjs）。
 *
 * 用法：node scripts/word-pipeline/build.mjs [--words=8000] [--download]
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  ANCHORS_FILE,
  RAW_DICT_FILE,
  SYLLABLE_PATCH_FILE,
  RAW_DIR,
  WORDS_DIR,
  WORDS_FILE,
  writeFileAtomic,
  writeJSON,
  sha256,
  wordsContentSha256,
  wordsVersionOf,
} from '../lib/data-contract.mjs'
import { loadDictionary, markPolyphone, pinyinProVersion, toWordEntry, WORD_POLICY } from './lib/wordbank.mjs'

const SOURCE = {
  dict: 'jieba dict.txt',
  url: 'https://raw.githubusercontent.com/fxsjy/jieba/master/jieba/dict.txt',
  license: 'MIT',
}

const SCHEMA_VERSION = '1.0.0'
const WORD_COUNT = (() => {
  const hit = process.argv.slice(2).find((arg) => arg.startsWith('--words='))
  const value = hit ? Number(hit.split('=')[1]) : WORD_POLICY.wordBank?.wordCount ?? 10000
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 10000
})()
const BASE_WORD_COUNT = WORD_POLICY.wordBank?.baseWordCount ?? 8000
const SUPPLEMENT = WORD_POLICY.wordBank?.supplements ?? {
  threeChar: 700,
  fourCharIdioms: 800,
  fiveChar: 500,
}
const QUALITY_MAX_CHAR_RANK = WORD_POLICY.pools?.qualityMaxCharRank ?? 4000
const BLOCKED_POS = new Set(WORD_POLICY.pools?.blockedPosTags ?? [])
const FORCE_DOWNLOAD = process.argv.slice(2).includes('--download')

async function ensureRawDict() {
  if (fs.existsSync(RAW_DICT_FILE) && !FORCE_DOWNLOAD) return
  fs.mkdirSync(RAW_DIR, { recursive: true })
  console.log(`[words] 下载 ${SOURCE.url}`)
  const response = await fetch(SOURCE.url)
  if (!response.ok) throw new Error(`下载失败：HTTP ${response.status} ${response.statusText}`)
  fs.writeFileSync(RAW_DICT_FILE, Buffer.from(await response.arrayBuffer()))
}

function sortObjectByKey(object) {
  return Object.fromEntries(Object.keys(object).sort().map((key) => [key, object[key]]))
}

/**
 * 记忆锚点索引：
 *   syllableChars: 每音节按字频取前 8 字；
 *   finalChars / initialChars: 每韵母 / 声母按字频取前 8 字。
 * 仅供构建期课程内容使用，不进入运行时同步。
 */
function buildAnchors(dictionary, entries) {
  const { singles, charRank, rankCount } = dictionary
  // 常用字集合：只保留出现在 8000 词条 chars 中的字（过滤繁体/生僻候选）。
  const commonChars = new Set()
  for (const word of entries) {
    for (const char of word.chars) commonChars.add(char)
  }
  const raw = { syllable: {}, final: {}, initial: {} }
  const filtered = { syllable: {}, final: {}, initial: {} }
  const push = (map, key, char) => {
    if (!key) return
    const list = map[key] ?? (map[key] = [])
    if (list.length < (WORD_POLICY.wordBank?.anchorsCharsLimit ?? 8) && !list.includes(char)) list.push(char)
  }
  for (const single of singles) {
    const entry = toWordEntry(single.text, single.freq, charRank, rankCount)
    if (!entry) continue
    const syllable = entry.syllables[0]
    if (!syllable) continue
    const syllableKey = `${syllable.initial}${syllable.final}`
    push(raw.syllable, syllableKey, single.text)
    push(raw.final, syllable.final, single.text)
    if (syllable.initial) push(raw.initial, syllable.initial, single.text)
    if (!commonChars.has(single.text)) continue
    push(filtered.syllable, syllableKey, single.text)
    push(filtered.final, syllable.final, single.text)
    if (syllable.initial) push(filtered.initial, syllable.initial, single.text)
  }
  // jieba 单字表未收录个别标准/常用音节（zhei、eng 等）→ 显式数据补丁文件，
  // 避免把知识点特判写死在逻辑里。
  const syllablePatches = fs.existsSync(SYLLABLE_PATCH_FILE)
    ? JSON.parse(fs.readFileSync(SYLLABLE_PATCH_FILE, 'utf8')).patches ?? []
    : []
  for (const patch of syllablePatches) {
    const syllable = patch.syllable
    if (!syllable || !patch.char || raw.syllable[syllable] || filtered.syllable[syllable]) continue
    raw.syllable[syllable] = [patch.char]
    filtered.syllable[syllable] = [patch.char]
  }
  const choose = (rawMap, filteredMap, limit, fallbackLimit) => {
    const out = {}
    for (const key of new Set([...Object.keys(rawMap), ...Object.keys(filteredMap)])) {
      const list = filteredMap[key]?.length ? filteredMap[key] : (rawMap[key] ?? [])
      out[key] = list.slice(0, filteredMap[key]?.length ? limit : fallbackLimit)
    }
    return out
  }
  const charLimit = WORD_POLICY.wordBank?.anchorsCharsLimit ?? 8
  const syllableChars = choose(raw.syllable, filtered.syllable, charLimit, 5)
  const finalChars = choose(raw.final, filtered.final, charLimit, 5)
  const initialChars = choose(raw.initial, filtered.initial, charLimit, 5)
  return {
    generatedAt: new Date().toISOString(),
    syllableChars: sortObjectByKey(syllableChars),
    finalChars: sortObjectByKey(finalChars),
    initialChars: sortObjectByKey(initialChars),
  }
}

/** 词条一行一个，便于 diff / 复现核对。 */
function writeWordsDoc(file, doc) {
  const lines = ['{']
  const headKeys = Object.keys(doc).filter((key) => key !== 'words')
  headKeys.forEach((key) => lines.push(`  ${JSON.stringify(key)}: ${JSON.stringify(doc[key])},`))
  lines.push('  "words": [')
  doc.words.forEach((word, index) => {
    lines.push(`    ${JSON.stringify(word)}${index === doc.words.length - 1 ? '' : ','}`)
  })
  lines.push('  ]')
  lines.push('}')
  writeFileAtomic(file, `${lines.join('\n')}\n`)
}

async function main() {
  await ensureRawDict()
  const startedAt = Date.now()
  const dictBuf = fs.readFileSync(RAW_DICT_FILE)
  const sourceSha = sha256(dictBuf)
  const dictionary = loadDictionary()
  const allEntries = dictionary.entries
  const baseEntries = allEntries.slice(0, BASE_WORD_COUNT)
  const selectedTexts = new Set(baseEntries.map((entry) => entry.text))
  const supplements = []

  const pickSupplement = (length, count, pos) => {
    const start = supplements.length
    for (const entry of allEntries) {
      if (supplements.length - start >= count) break
      if (entry.length !== length) continue
      if (selectedTexts.has(entry.text)) continue
      if (pos && dictionary.posByText.get(entry.text) !== pos) continue
      if (BLOCKED_POS.has(dictionary.posByText.get(entry.text))) continue
      if ((entry.minCharRank ?? Infinity) > QUALITY_MAX_CHAR_RANK) continue
      selectedTexts.add(entry.text)
      supplements.push(entry)
    }
  }
  pickSupplement(3, SUPPLEMENT.threeChar)
  pickSupplement(4, SUPPLEMENT.fourCharIdioms, 'i')
  pickSupplement(5, SUPPLEMENT.fiveChar)
  // 按全局词频排名追加，保持 freqRank 单调；不足时按实际数量产出。
  supplements.sort((a, b) => (a.freqRank ?? Infinity) - (b.freqRank ?? Infinity))
  const entries = [...baseEntries, ...supplements]
  if (entries.length < WORD_COUNT) {
    throw new Error(`公共词库不足：${entries.length} < ${WORD_COUNT}`)
  }
  for (const entry of entries) markPolyphone(entry)

  const filters = {
    lengthRange: WORD_POLICY.wordBank?.lengthRange ?? [2, 5],
    cjkOnly: true,
    dropErhua: true,
    wordCountTarget: WORD_COUNT,
    baseWordCount: BASE_WORD_COUNT,
    supplements: SUPPLEMENT,
  }
  const contentSha256 = wordsContentSha256(entries)
  const dataVersion = wordsVersionOf({
    sourceSha,
    pinyinVersion: pinyinProVersion(),
    filters,
    count: entries.length,
    contentSha256,
  })
  const doc = {
    schemaVersion: SCHEMA_VERSION,
    dataVersion,
    contentSha256,
    generatedAt: new Date().toISOString(),
    description: '双拼公共词库：2–5 字常用词、三四五字补充词，词上下文拼音 + 规范音节拆分',
    source: {
      dict: SOURCE.dict,
      url: SOURCE.url,
      license: SOURCE.license,
      sha256: sourceSha,
      pinyin: { name: 'pinyin-pro', version: pinyinProVersion(), license: 'MIT' },
    },
    filters,
    count: entries.length,
    words: entries,
  }
  fs.mkdirSync(WORDS_DIR, { recursive: true })
  writeWordsDoc(WORDS_FILE, doc)
  const anchors = buildAnchors(dictionary, entries)
  writeJSON(ANCHORS_FILE, anchors)
  // 清理废弃的中间产物（stats.json / build-report.json）。
  for (const legacy of ['stats.json', 'build-report.json']) {
    fs.rmSync(path.join(WORDS_DIR, legacy), { force: true })
  }
  const polyphoneCount = entries.filter((word) => word.polyphone).length
  console.log(
    `[words] ${entries.length} 词 · polyphone ${polyphoneCount} · ${dataVersion} · ` +
      `dict=${sourceSha.slice(0, 12)} · ${Date.now() - startedAt}ms`,
  )
  console.log(
    `[anchors] 音节 ${Object.keys(anchors.syllableChars).length} / 韵母 ${Object.keys(anchors.finalChars).length} / ` +
      `声母 ${Object.keys(anchors.initialChars).length} → data/words/anchors.json`,
  )
}

main().catch((error) => {
  console.error('✗ 词库构建失败：', error)
  process.exitCode = 1
})
