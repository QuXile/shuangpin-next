/**
 * 数据管线共享契约：路径常量、JSON 读写、原子写盘、版本 hash。
 *
 * 运行期权威数据：schemes / curriculum / lexicon / packages。
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const DATA_DIR = path.join(ROOT, 'data')
export const SCHEME_DIR = path.join(DATA_DIR, 'schemes')
export const PUBLIC_DATA_DIR = path.join(ROOT, 'apps', 'web', 'public', 'data')
export const PUBLIC_PACKAGES_DIR = path.join(PUBLIC_DATA_DIR, 'packages')
export const LEXICON_FILE = path.join(DATA_DIR, 'lexicon', 'lexicon.json')
export const CURRICULUM_INDEX_FILE = path.join(SCHEME_DIR, 'curriculum-index.json')
export const SCHEME_INDEX_FILE = path.join(SCHEME_DIR, 'index.json')

export const TEMPLATE_VERSION = '1.0.0'
export const CURRICULUM_VERSION = '1.0.0'

export function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

export function sha256Text(text) {
  return sha256(Buffer.from(text, 'utf8'))
}

export function hash12(text) {
  return sha256Text(text).slice(0, 12)
}

export function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

export function exists(file) {
  return fs.existsSync(file)
}

/** 写文件（先写临时文件再 rename，避免半截文件）。 */
export function writeFileAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}`
  fs.writeFileSync(tmp, text, 'utf8')
  fs.renameSync(tmp, file)
}

/** 写 JSON：pretty=true 用 2 空格；false 写单行。 */
export function writeJSON(file, data, { pretty = true } = {}) {
  const text = pretty ? `${JSON.stringify(data, null, 2)}\n` : JSON.stringify(data)
  writeFileAtomic(file, text)
}

/** 把 srcDir 的内容逐个原子写入 targetDir，并删除 targetDir 中多余文件。 */
export function replaceDirectoryContents(targetDir, srcDir) {
  const walk = (dir, base = '') => {
    const out = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = base ? `${base}/${entry.name}` : entry.name
      if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), rel))
      else out.push(rel)
    }
    return out
  }
  const sourceFiles = walk(srcDir)
  const sourceSet = new Set(sourceFiles)
  fs.mkdirSync(targetDir, { recursive: true })
  for (const rel of sourceFiles) {
    const target = path.join(targetDir, rel)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    const tmpFile = `${target}.tmp-${process.pid}`
    fs.copyFileSync(path.join(srcDir, rel), tmpFile)
    fs.renameSync(tmpFile, target)
  }
  for (const rel of walk(targetDir)) {
    if (!sourceSet.has(rel)) fs.rmSync(path.join(targetDir, rel), { force: true })
  }
  const pruneEmptyDirs = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const child = path.join(dir, entry.name)
      pruneEmptyDirs(child)
      if (fs.readdirSync(child).length === 0) fs.rmdirSync(child)
    }
  }
  pruneEmptyDirs(targetDir)
}

/**
 * 原子替换目录：在目标同级临时目录生成完整内容后，整体替换目标目录。
 */
export function replaceDirAtomically(targetDir, build) {
  const parent = path.dirname(targetDir)
  const base = path.basename(targetDir)
  fs.mkdirSync(parent, { recursive: true })
  const tmp = path.join(parent, `.${base}.tmp-${process.pid}`)
  const old = path.join(parent, `.${base}.old-${process.pid}`)
  fs.rmSync(tmp, { recursive: true, force: true })
  fs.rmSync(old, { recursive: true, force: true })
  fs.mkdirSync(tmp, { recursive: true })
  try {
    build(tmp)
  } catch (error) {
    fs.rmSync(tmp, { recursive: true, force: true })
    throw error
  }
  if (fs.existsSync(targetDir)) {
    try {
      fs.renameSync(targetDir, old)
      fs.renameSync(tmp, targetDir)
      fs.rmSync(old, { recursive: true, force: true })
      return
    } catch {
      fs.rmSync(old, { recursive: true, force: true })
    }
  }
  replaceDirectoryContents(targetDir, tmp)
  fs.rmSync(tmp, { recursive: true, force: true })
}

/** curriculum-<12hex>：只覆盖会进入运行期的课程内容字段（chapters + lessons）。 */
export function curriculumVersionOf(chapters, lessons) {
  return `curriculum-${hash12(JSON.stringify({ chapters, lessons }))}`
}

/** 读取当前课程版本（仅用于校验）。 */
export function canonicalCurriculumVersion() {
  const file = path.join(SCHEME_DIR, 'xiaohe', 'curriculum.json')
  if (!fs.existsSync(file)) return null
  return readJSON(file).dataVersion ?? null
}
