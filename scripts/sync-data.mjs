#!/usr/bin/env node
/**
 * 单向原子同步：data/（唯一数据源）→ apps/web/public/data/（Vite 静态资源）。
 *
 * 运行时只读 4 类文件（紧凑 JSON，无缩进，减少传输体积）：
 *   index.json             ← data/schemes/index.json
 *   schemes/<id>.json      ← data/schemes/<id>/scheme.json
 *   curriculum/<id>.json   ← data/schemes/<id>/curriculum.json
 *   lexicon/lexicon.json   ← data/lexicon/lexicon.json
 *
 * 不再生成 manifest / packages / 独立课程索引等中间层；
 * 版本信息由 index.json + 各 curriculum.dataVersion + lexicon.dataVersion 现算并打印。
 *
 * 同步规则：先写临时目录，全部成功后再整体替换，失败不会留下半成品。
 *
 * 用法：node scripts/sync-data.mjs
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
  const schemeIndex = readJSON(SCHEME_INDEX_FILE)
  const schemes = schemeIndex.schemes ?? []
  const schemeIds = schemes.map((summary) => summary.id)
  const courses = schemeIndex.courseSupported ?? []
  if (schemeIds.length === 0) throw new Error('方案索引为空')
  if (courses.length === 0) {
    throw new Error('课程索引为空，请先运行 node scripts/generate-universal-curriculum.mjs')
  }
  if (new Set(schemeIds).size !== schemeIds.length) throw new Error('方案索引有重复方案')
  if (new Set(courses).size !== courses.length) throw new Error('courseSupported 有重复方案')
  for (const schemeId of courses) {
    if (!schemeIds.includes(schemeId)) throw new Error(`courseSupported 含未知方案：${schemeId}`)
  }
  const defaultScheme = schemeIndex.defaultScheme ?? courses[0]
  if (!courses.includes(defaultScheme)) throw new Error(`defaultScheme ${defaultScheme} 不在课程方案中`)

  const files = publicDataPlan(schemeIndex).map(({ relOut, srcFile }) => {
    if (!fs.existsSync(srcFile)) throw new Error(`缺少数据源文件：${srcFile}`)
    return { relOut, data: readJSON(srcFile) }
  })
  const curricula = files
    .filter((file) => file.relOut.startsWith('curriculum/'))
    .map((file) => ({ id: path.basename(file.relOut, '.json'), dataVersion: file.data.dataVersion }))
  const lexiconVersion = files.find((file) => file.relOut === 'lexicon/lexicon.json').data.dataVersion

  return {
    files,
    schemeIds,
    courses,
    defaultScheme,
    curricula,
    lexiconVersion,
  }
}

function main() {
  const { files, schemeIds, courses, defaultScheme, curricula, lexiconVersion } = buildPlan()
  replaceDirAtomically(PUBLIC_DATA_DIR, (tmpDir) => {
    for (const file of files) {
      writeJSON(path.join(tmpDir, file.relOut), file.data, { pretty: false })
    }
  })
  const bytes = files.reduce(
    (sum, file) => sum + fs.statSync(path.join(PUBLIC_DATA_DIR, file.relOut)).size,
    0,
  )
  const versions = {
    defaultScheme,
    curricula: Object.fromEntries(curricula.map((item) => [item.id, item.dataVersion])),
    lexicon: lexiconVersion,
  }
  console.log(
    `[sync] ${files.length} 个数据文件（紧凑 JSON）→ apps/web/public/data/ ` +
      `（${(bytes / 1024 / 1024).toFixed(2)} MB，原子替换）`,
  )
  console.log(`[sync] 方案 ${schemeIds.length} 套 / 课程 ${courses.length} 套 / default=${defaultScheme}`)
  console.log(`[sync] versions=${JSON.stringify(versions)}`)
}

main()
