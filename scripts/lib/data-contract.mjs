/**
 * 数据管线共享契约：路径常量、JSON 读写与深比较、原子写盘、内容 hash。
 *
 * 运行期数据源（data/，唯一权威）：schemes/index.json、schemes/<id>/{scheme,curriculum}.json、
 * lexicon/lexicon.json。public/data 只是它的单向、紧凑序列化副本（apps/web/public/data/）。
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const SCHEME_DIR = path.join(ROOT, 'data', 'schemes')
export const PUBLIC_DATA_DIR = path.join(ROOT, 'apps', 'web', 'public', 'data')
export const LEXICON_FILE = path.join(ROOT, 'data', 'lexicon', 'lexicon.json')
export const SCHEME_INDEX_FILE = path.join(SCHEME_DIR, 'index.json')

/** public/data 顶层目录/文件：索引、方案、定制课程、词表。 */
export const PUBLIC_TOP_LEVEL = Object.freeze(['curriculum', 'index.json', 'lexicon', 'schemes'])

/**
 * public/data 产物清单：relOut（public 相对路径）→ srcFile（data/ 源文件）；课程仅定制方案。
 * sync 按此写盘、validate 按此对账，路径映射只维护一份。
 */
export function publicDataPlan(schemeIndex) {
  const plan = [{ relOut: 'index.json', srcFile: SCHEME_INDEX_FILE }]
  for (const summary of schemeIndex.schemes ?? []) {
    plan.push({
      relOut: `schemes/${summary.id}.json`,
      srcFile: path.join(SCHEME_DIR, summary.id, 'scheme.json'),
    })
  }
  for (const schemeId of schemeIndex.customCourses ?? []) {
    plan.push({
      relOut: `curriculum/${schemeId}.json`,
      srcFile: path.join(SCHEME_DIR, schemeId, 'curriculum.json'),
    })
  }
  plan.push({ relOut: 'lexicon/lexicon.json', srcFile: LEXICON_FILE })
  return plan
}

function sha256Text(text) {
  return crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex')
}

function hash12(text) {
  return sha256Text(text).slice(0, 12)
}

export function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

/** 写文件（先写临时文件再 rename，避免半截文件）。 */
function writeFileAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}`
  fs.writeFileSync(tmp, text, 'utf8')
  fs.renameSync(tmp, file)
}

/** 写 JSON：pretty=true 用 2 空格（data/ 源文件）；false 写紧凑单行（public 产物）。 */
export function writeJSON(file, data, { pretty = true } = {}) {
  const text = pretty ? `${JSON.stringify(data, null, 2)}\n` : JSON.stringify(data)
  writeFileAtomic(file, text)
}

/** 递归列出目录下的相对路径（使用 / 分隔）；目录不存在时返回空数组。 */
export function walkFiles(dir, base = '') {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...walkFiles(path.join(dir, entry.name), rel))
    else out.push(rel)
  }
  return out
}

function describeValue(value) {
  if (typeof value === 'string') return `"${value}"`
  if (value === undefined) return 'undefined'
  return JSON.stringify(value)
}

/**
 * JSON 深比较（忽略对象键顺序）：返回第一处差异的路径描述；完全相等返回 null。
 * 用于 public/data 与 data/ 的对账，以及「重新生成 vs 磁盘课程」的深相等校验。
 */
export function firstJSONDifference(expected, actual, path = '') {
  if (Object.is(expected, actual)) return null
  const at = path || '<root>'
  const expectedIsArray = Array.isArray(expected)
  const actualIsArray = Array.isArray(actual)
  if (expectedIsArray || actualIsArray) {
    if (!expectedIsArray || !actualIsArray) {
      return `${at}: 期望 ${expectedIsArray ? '数组' : describeValue(expected)}，实际 ${actualIsArray ? '数组' : describeValue(actual)}`
    }
    if (expected.length !== actual.length) return `${at}: 数组长度 ${expected.length} != ${actual.length}`
    for (let index = 0; index < expected.length; index += 1) {
      const diff = firstJSONDifference(expected[index], actual[index], `${path}[${index}]`)
      if (diff) return diff
    }
    return null
  }
  const expectedIsObject = expected !== null && typeof expected === 'object'
  const actualIsObject = actual !== null && typeof actual === 'object'
  if (expectedIsObject || actualIsObject) {
    if (!expectedIsObject || !actualIsObject) {
      return `${at}: 期望 ${expectedIsObject ? '对象' : describeValue(expected)}，实际 ${actualIsObject ? '对象' : describeValue(actual)}`
    }
    const expectedKeys = Object.keys(expected)
    const actualKeys = Object.keys(actual)
    for (const key of expectedKeys) {
      if (!Object.prototype.hasOwnProperty.call(actual, key)) return `${at}.${key}: 期望存在，实际缺失`
    }
    for (const key of actualKeys) {
      if (!Object.prototype.hasOwnProperty.call(expected, key)) return `${at}.${key}: 期望不存在，实际多出`
    }
    for (const key of expectedKeys) {
      const diff = firstJSONDifference(expected[key], actual[key], `${path}.${key}`)
      if (diff) return diff
    }
    return null
  }
  return `${at}: 期望 ${describeValue(expected)}，实际 ${describeValue(actual)}`
}

/** 把 srcDir 的内容逐个原子写入 targetDir，并删除 targetDir 中多余文件。 */
function replaceDirectoryContents(targetDir, srcDir) {
  const sourceFiles = walkFiles(srcDir)
  const sourceSet = new Set(sourceFiles)
  fs.mkdirSync(targetDir, { recursive: true })
  for (const rel of sourceFiles) {
    const target = path.join(targetDir, rel)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    const tmpFile = `${target}.tmp-${process.pid}`
    fs.copyFileSync(path.join(srcDir, rel), tmpFile)
    fs.renameSync(tmpFile, target)
  }
  for (const rel of walkFiles(targetDir)) {
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

/** 原子替换目录：在目标同级临时目录生成完整内容后，整体替换目标目录。 */
export function replaceDirAtomically(targetDir, build) {
  const parent = path.dirname(targetDir)
  const base = path.basename(targetDir)
  fs.mkdirSync(parent, { recursive: true })
  const tmp = path.join(parent, `.${base}.tmp-${process.pid}`)
  const old = path.join(parent, `.${base}.old-${process.pid}`)
  // 清理被中断进程留下的临时目录
  for (const entry of fs.readdirSync(parent)) {
    if (entry.startsWith(`.${base}.tmp-`) || entry.startsWith(`.${base}.old-`)) {
      fs.rmSync(path.join(parent, entry), { recursive: true, force: true })
    }
  }
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

