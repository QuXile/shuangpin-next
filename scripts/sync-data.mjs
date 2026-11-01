#!/usr/bin/env node
/**
 * 原子同步：data/（唯一数据源）→ apps/web/public/data/（Vite 静态资源）。
 *
 * 同步规则：
 *   - 先写临时目录，全部成功后再整体替换，失败不会留下半成品；
 *   - 同步 schemes/curriculum 源视图 + 统一 Lexicon + 运行时 packages + manifest.json；
 *   - manifest = { generatedAt, versions:{curriculum,lexicon}, defaultScheme, courses, files:[{file,bytes}] }。
 *
 * 用法：node scripts/sync-data.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  CURRICULUM_INDEX_FILE,
  LEXICON_FILE,
  PUBLIC_DATA_DIR,
  SCHEME_DIR,
  SCHEME_INDEX_FILE,
  readJSON,
  writeJSON,
  replaceDirAtomically,
} from './lib/data-contract.mjs'
import { buildSchemePackages } from './scheme-packages/build.mjs'

function walkFiles(dir, base = '') {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...walkFiles(path.join(dir, entry.name), rel))
    else out.push(rel)
  }
  return out
}

function buildFilePlan() {
  const schemeIndex = readJSON(SCHEME_INDEX_FILE)
  const curriculumIndex = readJSON(CURRICULUM_INDEX_FILE)
  const courses = curriculumIndex.schemes.map((scheme) => scheme.schemeId)
  const supported = schemeIndex.courseSupported ?? []
  if (courses.length === 0) throw new Error('课程索引为空，请先运行 node scripts/generate-universal-curriculum.mjs')
  if (new Set(courses).size !== courses.length) throw new Error('课程索引有重复方案')
  for (const schemeId of supported) {
    if (!courses.includes(schemeId)) throw new Error(`courseSupported ${schemeId} 缺少课程文件`)
  }
  for (const schemeId of courses) {
    if (!supported.includes(schemeId)) throw new Error(`课程 ${schemeId} 未登记在 courseSupported 中`)
  }
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
    add(path.join(SCHEME_DIR, schemeId, 'scheme.json'), `schemes/${schemeId}.json`)
    add(path.join(SCHEME_DIR, schemeId, 'curriculum.json'), `curriculum/${schemeId}.curriculum.json`)
  }
  add(LEXICON_FILE, 'lexicon/lexicon.json')
  return {
    plan,
    defaultScheme,
    courses,
    versions: {
      curriculum: readJSON(path.join(SCHEME_DIR, 'xiaohe', 'curriculum.json')).dataVersion,
      lexicon: readJSON(LEXICON_FILE).dataVersion,
    },
  }
}

function main() {
  const { plan, defaultScheme, courses, versions } = buildFilePlan()
  let files = []
  replaceDirAtomically(PUBLIC_DATA_DIR, (tmpDir) => {
    for (const entry of plan) {
      const target = path.join(tmpDir, entry.relOut)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.copyFileSync(entry.srcFile, target)
    }
    buildSchemePackages(path.join(tmpDir, 'packages'))
    files = walkFiles(tmpDir)
      .filter((file) => file !== 'manifest.json')
      .map((file) => ({ file, bytes: fs.statSync(path.join(tmpDir, file)).size }))
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
