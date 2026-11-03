/**
 * public/data 校验：文件清单 = 4 类运行时产物，内容与 data/ 源文件 JSON 深相等（紧凑序列化），
 * 版本链（index 的课程能力 / 各 curriculum.dataVersion / lexicon.dataVersion）可对上。
 *
 * public/data 是 gitignored 生成物，由 `pnpm data:sync` 单向重建。
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  PUBLIC_DATA_DIR,
  PUBLIC_TOP_LEVEL,
  ROOT,
  firstJSONDifference,
  publicDataPlan,
  readJSON,
  walkFiles,
} from '../lib/data-contract.mjs'

export function validatePublicData(ctx) {
  const schemeIndex = ctx.schemeIndex
  if (!schemeIndex) return
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

  const sources = new Map(publicDataPlan(schemeIndex).map(({ relOut, srcFile }) => [relOut, srcFile]))

  const actual = new Set(walkFiles(PUBLIC_DATA_DIR))
  for (const rel of sources.keys()) {
    if (!actual.has(rel)) ctx.ok(false, `public/data 缺文件：${rel}`)
  }
  for (const rel of actual) {
    if (!sources.has(rel)) ctx.ok(false, `public/data 存在多余文件：${rel}`)
  }

  let bytes = 0
  for (const [rel, sourceFile] of sources) {
    if (!actual.has(rel)) continue
    const publicFile = path.join(PUBLIC_DATA_DIR, rel)
    const publicText = fs.readFileSync(publicFile, 'utf8')
    bytes += Buffer.byteLength(publicText)
    let publicData
    try {
      publicData = JSON.parse(publicText)
    } catch (error) {
      ctx.ok(false, `public/data/${rel} 解析失败：${error.message}`)
      continue
    }
    if (!fs.existsSync(sourceFile)) {
      ctx.ok(false, `public/data/${rel} 在 data/ 中无来源：${path.relative(ROOT, sourceFile)}`)
      continue
    }
    const difference = firstJSONDifference(readJSON(sourceFile), publicData)
    ctx.ok(!difference, `public/data/${rel} 与 data/ 源文件不一致：${difference}`)
    // 运行时产物统一紧凑 JSON（无缩进），避免把 28 MB 级数据翻倍。
    ctx.ok(publicText === JSON.stringify(publicData), `public/data/${rel} 应为紧凑 JSON`)
  }

  const publicIndex = actual.has('index.json')
    ? JSON.parse(fs.readFileSync(path.join(PUBLIC_DATA_DIR, 'index.json'), 'utf8'))
    : null
  const publicLexicon = actual.has('lexicon/lexicon.json')
    ? JSON.parse(fs.readFileSync(path.join(PUBLIC_DATA_DIR, 'lexicon/lexicon.json'), 'utf8'))
    : null
  // 版本链：public 的默认方案 / 课程清单 / Lexicon 版本必须与 data/ 权威来源一致。
  if (publicIndex) {
    ctx.ok(
      JSON.stringify(publicIndex.courseSupported) === JSON.stringify(schemeIndex.courseSupported),
      'public/data/index.json 的 courseSupported 与 data/ 不一致',
    )
    ctx.ok(publicIndex.defaultScheme === schemeIndex.defaultScheme, 'public/data/index.json 的 defaultScheme 与 data/ 不一致')
  }
  if (publicLexicon && ctx.lexiconDataVersion) {
    ctx.ok(
      publicLexicon.dataVersion === ctx.lexiconDataVersion,
      `public/data/lexicon/lexicon.json 版本不一致：${publicLexicon.dataVersion} != ${ctx.lexiconDataVersion}`,
    )
  }
  ctx.note(
    `同步：public/data ${actual.size} 文件（紧凑 JSON，${(bytes / 1024 / 1024).toFixed(2)} MB）与 data/ JSON 深相等；` +
      `default=${schemeIndex.defaultScheme}，课程 ${(schemeIndex.courseSupported ?? []).length} 套，lexicon=${publicLexicon?.dataVersion ?? '?'}`,
  )
}
