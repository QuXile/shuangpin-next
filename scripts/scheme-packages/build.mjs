#!/usr/bin/env node
/**
 * 方案包构建：data/schemes/<id>/ 的源数据 → 运行时方案包目录。
 *
 * 每个包包含：
 *   manifest.json    方案能力 / 课程 profile / 统一 Lexicon 引用
 *   scheme.json      方案键位映射
 *   curriculum.json  仅课程方案
 *
 * 源数据采用「一个方案一个文件夹」，运行时包不再写回 data/。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PUBLIC_PACKAGES_DIR,
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

function schemeSourceFile(id) {
  return path.join(SCHEME_DIR, id, 'scheme.json')
}
function curriculumSourceFile(id) {
  return path.join(SCHEME_DIR, id, 'curriculum.json')
}

function buildManifest(schemeIndex, summary, scheme, curriculum) {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: summary.id,
    name: scheme.name ?? summary.name,
    version: '1.0.0',
    license: scheme.source?.license ?? 'GPL-3.0',
    source: scheme.source ?? schemeIndex.reference ?? null,
    capabilities: {
      course: Boolean(curriculum),
      training: true,
      article: true,
      zeroInitial: Boolean(scheme.zeroInitial && Object.keys(scheme.zeroInitial).length > 0),
      customStages: false,
    },
    curriculum: curriculum
      ? {
          profile: 'standard-40',
          version: curriculum.dataVersion,
          file: 'curriculum.json',
        }
      : null,
    data: { scheme: 'scheme.json' },
    shared: SHARED_REFS,
  }
}

export function buildSchemePackages(outputDir = PUBLIC_PACKAGES_DIR) {
  const schemeIndex = readJSON(SCHEME_INDEX_FILE)
  const packages = []
  replaceDirAtomically(outputDir, (tmp) => {
    for (const summary of schemeIndex.schemes ?? []) {
      const source = schemeSourceFile(summary.id)
      if (!fs.existsSync(source)) continue
      const packageDir = path.join(tmp, summary.id)
      fs.mkdirSync(packageDir, { recursive: true })
      const scheme = readJSON(source)
      fs.copyFileSync(source, path.join(packageDir, 'scheme.json'))
      const curriculumFile = curriculumSourceFile(summary.id)
      const curriculum = fs.existsSync(curriculumFile) ? readJSON(curriculumFile) : null
      if (curriculum) fs.copyFileSync(curriculumFile, path.join(packageDir, 'curriculum.json'))
      const manifest = buildManifest(schemeIndex, summary, scheme, curriculum)
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
  console.log(`[packages] ${packages.length} 个方案包 → apps/web/public/data/packages/`)
}
