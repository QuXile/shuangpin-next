#!/usr/bin/env node
/**
 * 单向原子同步：data/（权威源数据）→ apps/web/public/data/（Vite 静态资源）。
 *
 * 运行时文件：
 *   index.json             方案索引
 *   schemes/<id>.json      19 套方案
 *   curriculum/<id>.json   仅定制课程（通用课程在浏览器按方案数据生成）
 *   lexicon/lexicon.json   词表（构建期预解析成紧凑运行时格式，浏览器只做解码）
 *
 * 词表在同步时完成 pinyin-pro 解析（约 0.3–0.5s）；产物 meta 里写入源数据哈希与解析口径版本，
 * 下次同步命中缓存时直接复用上次产物，不再重复解析。缓存损坏 / 版本不一致 / 源数据变化时
 * 一律回退重新生成（正确性优先），validate 也会独立重建产物以发现陈旧文件。
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  LEXICON_FILE,
  PUBLIC_DATA_DIR,
  SCHEME_INDEX_FILE,
  publicDataPlan,
  readJSON,
  replaceDirAtomically,
  writeJSON,
} from './lib/data-contract.mjs'
import {
  LEXICON_RUNTIME_REL_PATH,
  encodeRuntimeLexicon,
  isReusableRuntimeLexicon,
} from './lib/runtime-lexicon.mjs'

const PUBLIC_LEXICON_FILE = path.join(PUBLIC_DATA_DIR, LEXICON_RUNTIME_REL_PATH)

/** 读取上次生成的运行时词表；仅当格式 / 解析口径 / 源数据都未变时复用。 */
function readReusableRuntimeLexicon(source) {
  if (!fs.existsSync(PUBLIC_LEXICON_FILE)) return null
  try {
    const file = JSON.parse(fs.readFileSync(PUBLIC_LEXICON_FILE, 'utf8'))
    return isReusableRuntimeLexicon(file, source) ? file : null
  } catch {
    // 缓存损坏（半截文件 / 非法 JSON）：按未命中处理，重新生成。
    return null
  }
}

/** 词表产物：优先复用缓存，否则构建期解析 + 编码（编码器内部自检一致性）。 */
function buildLexicon(sourceFile) {
  const source = readJSON(sourceFile)
  const startedAt = performance.now()
  const cached = readReusableRuntimeLexicon(source)
  if (cached) {
    return { data: cached, cacheHit: true, elapsedMs: performance.now() - startedAt }
  }
  const data = encodeRuntimeLexicon(source)
  return { data, cacheHit: false, elapsedMs: performance.now() - startedAt }
}

function buildPlan() {
  const index = readJSON(SCHEME_INDEX_FILE)
  const schemeIds = (index.schemes ?? []).map((summary) => summary.id)
  const customCourses = index.customCourses ?? []
  if (schemeIds.length === 0) throw new Error('方案索引为空')
  if (new Set(schemeIds).size !== schemeIds.length) throw new Error('方案索引有重复方案')
  if (!schemeIds.includes(index.defaultScheme)) {
    throw new Error(`defaultScheme ${index.defaultScheme} 不在方案列表中`)
  }
  if (new Set(customCourses).size !== customCourses.length) {
    throw new Error('customCourses 有重复方案')
  }
  for (const schemeId of customCourses) {
    if (!schemeIds.includes(schemeId)) throw new Error(`customCourses 含未知方案：${schemeId}`)
  }

  const files = []
  let lexicon = null
  for (const { relOut, srcFile } of publicDataPlan(index)) {
    if (!fs.existsSync(srcFile)) throw new Error(`缺少数据源文件：${srcFile}`)
    if (srcFile === LEXICON_FILE) {
      lexicon = buildLexicon(srcFile)
      files.push({ relOut, data: lexicon.data })
      continue
    }
    files.push({ relOut, data: readJSON(srcFile) })
  }
  return { files, lexicon, schemeIds, customCourses, index }
}

/** 体积展示：字节数 + 十进制 MB（与文档 / 构建产物体积口径一致）。 */
function formatSize(bytes) {
  return `${bytes} B / ${(bytes / 1e6).toFixed(2)} MB`
}

function main() {
  const startedAt = performance.now()
  const { files, lexicon, schemeIds, customCourses, index } = buildPlan()
  replaceDirAtomically(PUBLIC_DATA_DIR, (tmpDir) => {
    for (const file of files) writeJSON(path.join(tmpDir, file.relOut), file.data, { pretty: false })
  })
  const bytes = files.reduce(
    (sum, file) => sum + fs.statSync(path.join(PUBLIC_DATA_DIR, file.relOut)).size,
    0,
  )
  console.log(
    `[sync] ${files.length} 个数据文件（紧凑 JSON）→ apps/web/public/data/ ` +
      `（${formatSize(bytes)}，原子替换）`,
  )
  const meta = lexicon.data.meta
  const lexiconBytes = fs.statSync(PUBLIC_LEXICON_FILE).size
  console.log(
    `[sync] 词表：运行时 schemaVersion ${lexicon.data.schemaVersion}，` +
      `${meta.wordCount} 词 / ${meta.charCount} 字 / ${meta.syllableCount} 音节 → ${formatSize(lexiconBytes)}` +
      `（${lexicon.cacheHit ? '缓存命中，复用上次产物' : `构建期解析 + 编码 ${lexicon.elapsedMs.toFixed(0)}ms`}）`,
  )
  console.log(
    `[sync] 方案 ${schemeIds.length} 套 / 定制课程 ${customCourses.length} 套 / default=${index.defaultScheme}` +
      `（总耗时 ${(performance.now() - startedAt).toFixed(0)}ms）`,
  )
}

main()
