#!/usr/bin/env node
/**
 * 单向原子同步：data/（权威源数据）→ apps/web/public/data/（Vite 静态资源）。
 *
 * 运行时文件：
 *   index.json             方案索引
 *   schemes/<id>.json      19 套方案
 *   curriculum/<id>.json   仅定制课程（通用课程在浏览器按方案数据生成）
 *   lexicon/lexicon.json   词表（文本 + 词频 + 音节示例）
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  PUBLIC_DATA_DIR,
  SCHEME_INDEX_FILE,
  publicDataPlan,
  readJSON,
  replaceDirAtomically,
  writeJSON,
} from './lib/data-contract.mjs'

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

  const files = publicDataPlan(index).map(({ relOut, srcFile }) => {
    if (!fs.existsSync(srcFile)) throw new Error(`缺少数据源文件：${srcFile}`)
    return { relOut, data: readJSON(srcFile) }
  })
  return { files, schemeIds, customCourses, index }
}

function main() {
  const { files, schemeIds, customCourses, index } = buildPlan()
  replaceDirAtomically(PUBLIC_DATA_DIR, (tmpDir) => {
    for (const file of files) writeJSON(path.join(tmpDir, file.relOut), file.data, { pretty: false })
  })
  const bytes = files.reduce(
    (sum, file) => sum + fs.statSync(path.join(PUBLIC_DATA_DIR, file.relOut)).size,
    0,
  )
  console.log(
    `[sync] ${files.length} 个数据文件（紧凑 JSON）→ apps/web/public/data/ ` +
      `（${(bytes / 1024 / 1024).toFixed(2)} MB，原子替换）`,
  )
  console.log(
    `[sync] 方案 ${schemeIds.length} 套 / 定制课程 ${customCourses.length} 套 / default=${index.defaultScheme}`,
  )
}

main()
