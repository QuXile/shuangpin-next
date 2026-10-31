/**
 * 数据管线共享契约：路径常量、JSON 读写、原子写盘、版本 hash。
 *
 * 版本口径（生成器与 validate-all 共用）：
 *   words-<12hex>       词表内容（source sha + pinyin-pro 版本 + 过滤参数 + 词条内容 hash）
 *   curriculum-<12hex>  sha256(JSON.stringify({ chapters, lessons })) 前 12 位
 *   pools-<12hex>       排序后的「池文件名 + 内容」串 sha256 前 12 位（沿用既有算法）
 *
 * 生成器与 validate-all 必须共用本文件，禁止各写一套 hash。
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const DATA_DIR = path.join(ROOT, 'data')
export const SCHEME_DIR = path.join(DATA_DIR, 'schemes')
export const CURRICULUM_DIR = path.join(DATA_DIR, 'curriculum')
export const POOLS_DIR = path.join(DATA_DIR, 'pools')
export const WORDS_DIR = path.join(DATA_DIR, 'words')
export const RAW_DIR = path.join(DATA_DIR, 'raw')
export const RAW_DICT_FILE = path.join(RAW_DIR, 'jieba-dict.txt')
export const PUBLIC_DATA_DIR = path.join(ROOT, 'apps', 'web', 'public', 'data')
export const TRAINING_DIR = path.join(DATA_DIR, 'training')
export const TRAINING_BANK_FILE = path.join(TRAINING_DIR, 'bank.json')
export const TRAINING_SCHEMA_VERSION = '1.0.0'
export const WORDS_FILE = path.join(WORDS_DIR, 'words.sample.json')
export const ANCHORS_FILE = path.join(WORDS_DIR, 'anchors.json')
export const SYLLABLE_PATCH_FILE = path.join(WORDS_DIR, 'syllable-patches.json')
export const WORD_POLICY_FILE = path.join(WORDS_DIR, 'word-policy.json')
export const POOLS_INDEX_FILE = path.join(POOLS_DIR, 'index.json')
export const CURRICULUM_INDEX_FILE = path.join(CURRICULUM_DIR, 'index.json')
export const SCHEME_INDEX_FILE = path.join(SCHEME_DIR, 'index.json')

/** 课程模板与课程数据版本 */
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

/** 写 JSON：pretty=true 用 2 空格；false 写单行（词池要求单行压缩 JSON）。 */
export function writeJSON(file, data, { pretty = true } = {}) {
  const text = pretty ? `${JSON.stringify(data, null, 2)}\n` : JSON.stringify(data)
  writeFileAtomic(file, text)
}

/**
 * 原子替换目录：在目标同级临时目录生成完整内容后，整体替换目标目录。
 * 任何步骤失败都不会留下半成品目标目录。
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
  // 优先整体目录替换；Windows 上目录可能被 dev server 等进程持有句柄，
  // 此时退化为「逐文件原子写 + 清理多余文件」，保证不出现半截文件。
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
  // 清理空目录
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

// ── 版本 hash ────────────────────────────────────────────────

/** curriculum-<12hex>：只覆盖会进入运行期的课程内容字段（chapters + lessons）。 */
export function curriculumVersionOf(chapters, lessons) {
  return `curriculum-${hash12(JSON.stringify({ chapters, lessons }))}`
}

/** training-<12hex>：训练库 schema + chars + words 的内容 hash（generatedAt 不参与）。 */
export function trainingVersionOf(bank) {
  const input = JSON.stringify({ schemaVersion: bank.schemaVersion, chars: bank.chars })
  return `training-${hash12(input)}`
}

/** words 内容 hash：词条数组的 JSON 字符串 sha256。 */
export function wordsContentSha256(words) {
  return sha256Text(JSON.stringify(words))
}

/** words-<12hex>：source sha + pinyin-pro 版本 + 过滤参数 + 词条内容 hash。 */
export function wordsVersionOf({ sourceSha, pinyinVersion, filters, count, contentSha256 }) {
  const input = `${sourceSha}|${pinyinVersion}|${JSON.stringify(filters)}|${count}|${contentSha256}`
  return `words-${hash12(input)}`
}

/** 池文件列表（排序，排除 index.json）。 */
export function poolFileNames(dir = POOLS_DIR) {
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json') && name !== 'index.json')
    .sort()
}

/** pools-<12hex>：对「排序后的文件名 + 文件内容」整体 sha256。 */
export function poolsVersionOf(dir = POOLS_DIR, files = poolFileNames(dir)) {
  const chunks = []
  for (const name of files) {
    chunks.push(Buffer.from(name, 'utf8'), fs.readFileSync(path.join(dir, name)))
  }
  return `pools-${sha256(Buffer.concat(chunks)).slice(0, 12)}`
}

/** 当前 canonical 课程（词池共用）的版本：xiaohe。 */
export function canonicalCurriculumVersion() {
  const file = path.join(CURRICULUM_DIR, 'xiaohe.curriculum.json')
  if (!fs.existsSync(file)) return null
  return readJSON(file).dataVersion ?? null
}
