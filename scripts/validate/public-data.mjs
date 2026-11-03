/**
 * public/data 校验：文件清单与 data/ 源文件一一对应，逐文件深相等且为紧凑 JSON。
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
    const difference = firstJSONDifference(readJSON(sourceFile), publicData)
    ctx.ok(!difference, `public/data/${rel} 与 data/ 源文件不一致：${difference}`)
    ctx.ok(publicText === JSON.stringify(publicData), `public/data/${rel} 应为紧凑 JSON`)
  }

  ctx.note(
    `同步：public/data ${actual.size} 文件（紧凑 JSON，${(bytes / 1024 / 1024).toFixed(2)} MB）与 data/ 深相等；` +
      `方案 ${index.schemes.length} 套 / 定制课程 ${index.customCourses.length} 套 / default=${index.defaultScheme}`,
  )
}
