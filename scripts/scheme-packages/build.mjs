#!/usr/bin/env node
/**
 * 方案包构建：
 *   data/ 下的扁平生成数据 → data/packages/<scheme>/ 运行时方案包。
 *
 * 每个包包含：
 *   manifest.json    方案能力 / 课程 profile / 统一 Lexicon 引用
 *   scheme.json      方案键位映射
 *   curriculum.json  仅课程方案；完整 lessons / tips / atomMeta
 *
 * 方案包引用共享的 Lexicon，不重复打包字词数据。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CURRICULUM_DIR,
  CURRICULUM_INDEX_FILE,
  PACKAGES_DIR,
  SCHEME_DIR,
  SCHEME_INDEX_FILE,
  readJSON,
  replaceDirAtomically,
  writeJSON,
} from '../lib/data-contract.mjs'

const SCHEMA_VERSION = 1
const SHARED_REFS = {
  lexicon: 'shared:lexicon',
}

function buildManifest(schemeIndex, summary, curriculum) {
  const schemeFile = path.join(SCHEME_DIR, `${summary.id}.json`)
  const scheme = readJSON(schemeFile)
  const hasCourse = Boolean(curriculum)
  const hasZeroInitial = Boolean(
    scheme.zeroInitial && Object.keys(scheme.zeroInitial).length > 0,
  )
  return {
    schemaVersion: SCHEMA_VERSION,
    id: summary.id,
    name: scheme.name ?? summary.name,
    version: '1.0.0',
    license: scheme.source?.license ?? 'GPL-3.0',
    source: scheme.source ?? schemeIndex.reference ?? null,
    capabilities: {
      course: hasCourse,
      training: true,
      article: true,
      zeroInitial: hasZeroInitial,
      customStages: false,
    },
    curriculum: hasCourse
      ? {
          profile: 'standard-40',
          version: curriculum.dataVersion,
          file: 'curriculum.json',
        }
      : null,
    data: {
      scheme: 'scheme.json',
    },
    shared: SHARED_REFS,
  }
}

export function buildSchemePackages() {
  const schemeIndex = readJSON(SCHEME_INDEX_FILE)
  const curriculumIndex = readJSON(CURRICULUM_INDEX_FILE)
  const courseSupported = new Set(schemeIndex.courseSupported ?? [])
  const curricula = new Map()
  for (const item of curriculumIndex.schemes ?? []) {
    const file = path.join(CURRICULUM_DIR, item.file)
    if (fs.existsSync(file)) curricula.set(item.schemeId, readJSON(file))
  }

  const packages = []
  replaceDirAtomically(PACKAGES_DIR, (tmp) => {
    for (const summary of schemeIndex.schemes ?? []) {
      const packageDir = path.join(tmp, summary.id)
      fs.mkdirSync(packageDir, { recursive: true })
      const schemeFile = path.join(SCHEME_DIR, `${summary.id}.json`)
      if (!fs.existsSync(schemeFile)) continue
      fs.copyFileSync(schemeFile, path.join(packageDir, 'scheme.json'))

      const curriculum = courseSupported.has(summary.id) ? curricula.get(summary.id) : null
      if (curriculum) fs.copyFileSync(
        path.join(CURRICULUM_DIR, `${summary.id}.curriculum.json`),
        path.join(packageDir, 'curriculum.json'),
      )

      const manifest = buildManifest(schemeIndex, summary, curriculum)
      writeJSON(path.join(packageDir, 'manifest.json'), manifest)
      packages.push(manifest)
    }

    writeJSON(path.join(tmp, 'index.json'), {
      schemaVersion: SCHEMA_VERSION,
      version: schemeIndex.version,
      generatedBy: 'scripts/scheme-packages/build.mjs',
      reference: schemeIndex.reference ?? null,
      semantics: schemeIndex.semantics ?? null,
      defaultScheme: schemeIndex.defaultScheme,
      recommendedOrder: schemeIndex.recommendedOrder,
      courseSupported: schemeIndex.courseSupported,
      schemes: schemeIndex.schemes,
      packages,
    })
  })

  return { packages, courseSupported: schemeIndex.courseSupported ?? [] }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { packages } = buildSchemePackages()
  console.log(`[packages] ${packages.length} 个方案包 → data/packages/`)
}
