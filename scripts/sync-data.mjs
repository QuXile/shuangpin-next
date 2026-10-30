#!/usr/bin/env node
/**
 * 原子同步：data/（唯一数据源）→ apps/web/public/data/（Vite 静态资源）。
 *
 * 同步规则：
 *   - 先写临时目录，全部成功后再整体替换，失败不会留下半成品；
 *   - 同步 schemes(6) + curriculum(6) + pools(42) + manifest.json；
 *   - manifest = { generatedAt, versions:{curriculum,pools,words}, defaultScheme, courses, files:[{file,bytes}] }。
 *
 * 用法：node scripts/sync-data.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  CURRICULUM_DIR,
  CURRICULUM_INDEX_FILE,
  POOLS_DIR,
  POOLS_INDEX_FILE,
  PUBLIC_DATA_DIR,
  SCHEME_DIR,
  SCHEME_INDEX_FILE,
  TRAINING_BANK_FILE,
  WORDS_FILE,
  readJSON,
  writeJSON,
  replaceDirAtomically,
} from './lib/data-contract.mjs'

function buildFilePlan() {
  const schemeIndex = readJSON(SCHEME_INDEX_FILE)
  const curriculumIndex = readJSON(CURRICULUM_INDEX_FILE)
  const poolIndex = readJSON(POOLS_INDEX_FILE)
  const courses = curriculumIndex.schemes.map((scheme) => scheme.schemeId)
  if (courses.length !== 5) throw new Error(`课程索引应为 5 套，实际 ${courses.length}`)
  const defaultScheme = schemeIndex.defaultScheme ?? courses[0]
  if (!courses.includes(defaultScheme)) throw new Error(`defaultScheme ${defaultScheme} 不在课程列表中`)

  const plan = []
  const add = (srcFile, relOut) => {
    if (!fs.existsSync(srcFile)) throw new Error(`缺少数据源文件：${srcFile}`)
    plan.push({ srcFile, relOut })
  }
  add(SCHEME_INDEX_FILE, 'schemes/index.json')
  add(CURRICULUM_INDEX_FILE, 'curriculum/index.json')
  for (const schemeId of courses) {
    add(path.join(SCHEME_DIR, `${schemeId}.json`), `schemes/${schemeId}.json`)
    add(path.join(CURRICULUM_DIR, `${schemeId}.curriculum.json`), `curriculum/${schemeId}.curriculum.json`)
  }
  add(POOLS_INDEX_FILE, 'pools/index.json')
  for (const lesson of poolIndex.lessons ?? []) {
    add(path.join(POOLS_DIR, lesson.file), `pools/${lesson.file}`)
  }
  add(TRAINING_BANK_FILE, 'training/bank.json')
  const trainingVersion = readJSON(TRAINING_BANK_FILE).dataVersion
  return {
    plan,
    defaultScheme,
    courses,
    versions: {
      curriculum: readJSON(path.join(CURRICULUM_DIR, 'xiaohe.curriculum.json')).dataVersion,
      pools: poolIndex.dataVersion,
      words: readJSON(WORDS_FILE).dataVersion,
      training: trainingVersion,
    },
  }
}

function main() {
  const { plan, defaultScheme, courses, versions } = buildFilePlan()
  let files = []
  replaceDirAtomically(PUBLIC_DATA_DIR, (tmpDir) => {
    files = []
    for (const entry of plan) {
      const target = path.join(tmpDir, entry.relOut)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.copyFileSync(entry.srcFile, target)
      files.push({ file: entry.relOut, bytes: fs.statSync(target).size })
    }
    writeJSON(path.join(tmpDir, 'manifest.json'), {
      generatedAt: new Date().toISOString(),
      versions,
      defaultScheme,
      courses,
      files,
    })
  })
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0)
  console.log(
    `[sync] ${files.length} 个数据文件 + manifest → apps/web/public/data/ ` +
      `(${(totalBytes / 1024 / 1024).toFixed(2)} MB)`,
  )
  console.log(
    `[sync] versions=${JSON.stringify(versions)} default=${defaultScheme} courses=${courses.join(',')}`,
  )
}

main()
