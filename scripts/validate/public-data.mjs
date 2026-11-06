/**
 * public/data 校验：文件清单与 data/ 源文件一一对应、逐文件为紧凑 JSON。
 * 其余文件仍与 data/ 源文件深相等；词表是构建期预解析的运行时格式，改为双重校验：
 *   1) 用 encoder 从源数据重新生成 runtime 格式，产物必须逐字段一致（发现陈旧 / 手改产物）；
 *   2) 用 web 端 decodeRuntimeLexicon 解码产物，结果必须与构建期 resolveLexicon 逐字段相等。
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  PUBLIC_DATA_DIR,
  PUBLIC_TOP_LEVEL,
  firstJSONDifference,
  publicDataPlan,
  readJSON,
  walkFiles,
} from '../lib/data-contract.mjs'
import { resolveLexicon } from '../lib/pinyin-resolve.mjs'
import { LEXICON_RUNTIME_REL_PATH, encodeRuntimeLexicon } from '../lib/runtime-lexicon.mjs'
import { decodeRuntimeLexicon } from '../../apps/web/src/lib/lexicon.ts'

const RUNTIME_LEXICON_KEYS = ['words', 'chars', 'syllableExamples']

/** 体积展示：十进制 MB（与 sync 输出口径一致）。 */
function formatSize(bytes) {
  return `${(bytes / 1e6).toFixed(2)} MB`
}

/**
 * 词表产物双重校验。
 * @param {*} ctx 校验上下文
 * @param {string} sourceFile data/lexicon/lexicon.json
 * @param {*} publicData 解析后的 public 词表产物
 * @param {string} rel public 相对路径
 */
function validateRuntimeLexicon(ctx, sourceFile, publicData, rel) {
  const source = readJSON(sourceFile)
  // validate/lexicon.mjs 已解析过一次时直接复用，避免重复 pinyin-pro 解析。
  const expected = ctx.lexicon ?? resolveLexicon(source)

  // 1) 按源数据重新编码：与磁盘产物深相等（能发现缓存产物陈旧、手动改过或源数据已变）。
  let rebuilt
  try {
    rebuilt = encodeRuntimeLexicon(source, { resolved: expected })
  } catch (error) {
    ctx.ok(false, `public/data/${rel} 无法按 data/ 源数据重新生成：${error.message}`)
    return
  }
  const staleDifference = firstJSONDifference(rebuilt, publicData)
  ctx.ok(
    !staleDifference,
    `public/data/${rel} 与按 data/ 源数据重新生成的结果不一致（产物陈旧？请运行 pnpm data:sync）：${staleDifference}`,
  )

  // 2) 解码往返：运行时解码结果与构建期 resolveLexicon 逐字段一致。
  let decoded
  try {
    decoded = decodeRuntimeLexicon(publicData)
  } catch (error) {
    ctx.ok(false, `public/data/${rel} 解码失败：${error.message}`)
    return
  }
  let roundTripOk = true
  for (const key of RUNTIME_LEXICON_KEYS) {
    const difference = firstJSONDifference(expected[key], decoded[key])
    roundTripOk &&= !difference
    ctx.ok(
      !difference,
      `public/data/${rel} 解码后的 ${key} 与构建期 resolveLexicon 不一致：${difference}`,
    )
  }

  if (!staleDifference && roundTripOk) {
    const meta = publicData.meta ?? {}
    ctx.note(
      `词表运行时格式：schemaVersion ${publicData.schemaVersion} / ${meta.wordCount} 词 / ` +
        `${meta.charCount} 字 / ${meta.syllableCount} 音节表项；按源重建 + 解码往返均一致`,
    )
  }
}

export function validatePublicData(ctx) {
  const index = ctx.schemeIndex
  if (!index) return
  if (!fs.existsSync(PUBLIC_DATA_DIR)) {
    ctx.ok(false, '缺少 apps/web/public/data（请先运行 pnpm data:sync）')
    return
  }

  const topLevel = fs
    .readdirSync(PUBLIC_DATA_DIR, { withFileTypes: true })
    .map((entry) => entry.name)
    .sort()
  ctx.ok(
    JSON.stringify(topLevel) === JSON.stringify(PUBLIC_TOP_LEVEL),
    `public/data 顶层应为 ${PUBLIC_TOP_LEVEL.join(' / ')}，实际 ${topLevel.join(' / ')}`,
  )

  const sources = new Map(publicDataPlan(index).map(({ relOut, srcFile }) => [relOut, srcFile]))
  const actual = new Set(walkFiles(PUBLIC_DATA_DIR))
  for (const rel of sources.keys()) if (!actual.has(rel)) ctx.ok(false, `public/data 缺文件：${rel}`)
  for (const rel of actual) if (!sources.has(rel)) ctx.ok(false, `public/data 存在多余文件：${rel}`)

  let bytes = 0
  for (const [rel, sourceFile] of sources) {
    if (!actual.has(rel)) continue
    const publicText = fs.readFileSync(path.join(PUBLIC_DATA_DIR, rel), 'utf8')
    bytes += Buffer.byteLength(publicText)
    let publicData
    try {
      publicData = JSON.parse(publicText)
    } catch (error) {
      ctx.ok(false, `public/data/${rel} 解析失败：${error.message}`)
      continue
    }
    ctx.ok(publicText === JSON.stringify(publicData), `public/data/${rel} 应为紧凑 JSON`)
    if (rel === LEXICON_RUNTIME_REL_PATH) {
      validateRuntimeLexicon(ctx, sourceFile, publicData, rel)
      continue
    }
    const difference = firstJSONDifference(readJSON(sourceFile), publicData)
    ctx.ok(!difference, `public/data/${rel} 与 data/ 源文件不一致：${difference}`)
  }

  ctx.note(
    `同步：public/data ${actual.size} 文件（紧凑 JSON，${formatSize(bytes)}）；` +
      `词表为运行时预编译格式，其余文件与 data/ 深相等；` +
      `方案 ${index.schemes.length} 套 / 定制课程 ${index.customCourses.length} 套 / default=${index.defaultScheme}`,
  )
}
