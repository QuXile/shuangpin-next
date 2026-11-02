/**
 * 文档校验：文档入口完整、README 导航覆盖 docs 下全部 Markdown、
 * README 与 docs 内的本地链接可解析。
 */
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, walkFiles } from '../lib/data-contract.mjs'

const REQUIRED_DOCS = [
  'docs/USAGE.md',
  'docs/ARCHITECTURE.md',
  'docs/UI.md',
  'docs/DATA.md',
  'docs/CONTRIBUTING.md',
]

/** 文档引用的唯一来源：README 与 docs 下全部 Markdown。 */
function documentationFiles() {
  const docs = walkFiles(path.join(ROOT, 'docs'), '')
    .filter((rel) => rel.endsWith('.md'))
    .map((rel) => `docs/${rel}`)
  return ['README.md', ...docs]
}

export function validateDocs(ctx) {
  const exists = (rel) => fs.existsSync(path.join(ROOT, rel))
  for (const rel of ['README.md', 'apps/web/src/main.ts', 'packages/core/src/index.ts', 'LICENSE']) {
    ctx.ok(exists(rel), `缺少入口/文档：${rel}`)
  }
  for (const rel of REQUIRED_DOCS) ctx.ok(exists(rel), `缺少文档：${rel}`)
  // 废弃数据目录不应存在，避免误用。
  for (const rel of ['data/pools', 'data/words', 'data/training']) {
    ctx.ok(!exists(rel), `不应存在的废弃数据目录：${rel}`)
  }

  const docFiles = documentationFiles()
  for (const rel of docFiles) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8')
    // 本地 Markdown 链接必须可解析（外链、纯锚点除外）。
    for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const link = match[1]
      if (/^(?:https?:|mailto:|#)/.test(link)) continue
      const target = link.split('#')[0]
      if (!target) continue
      const resolved = path.resolve(path.dirname(path.join(ROOT, rel)), target)
      ctx.ok(fs.existsSync(resolved), `${rel} 的链接目标不存在：${link}`)
    }
  }
  // 文档不保留截图（界面截图容易过期，统一以实际界面为准）。
  ctx.ok(!exists('docs/assets/impl'), '不应保留 docs/assets/impl 截图目录')
  // README 是文档导航的唯一入口：必须链接全部 docs/**/*.md。
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8')
  for (const rel of docFiles.filter((file) => file !== 'README.md')) {
    ctx.ok(readme.includes(`](${rel})`), `README 导航缺少文档链接：${rel}`)
  }
  ctx.note(`文档：${REQUIRED_DOCS.length + 1} 个 Markdown 入口；README 导航覆盖 docs/**/*.md`)
}
