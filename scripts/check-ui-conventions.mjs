#!/usr/bin/env node
/** UI 约定静态检查：单一设计系统守卫 + 输入管线守卫。
 *
 * 设计系统铁律（PATHS：apps/web/src）：
 * 1. 组件样式只消费 token：禁止裸色值、裸字体（px/clamp）、裸圆角（px）、
 *    裸阴影（无 var()）、裸动效时长（ms/s）。
 * 2. 共享原语（.panel/.btn/.chip/.cap/...）只能在 styles/base.css 定义，组件不得重定义。
 * 3. 组件 var(--x) 必须引用已声明（tokens.css 或同仓自定义属性），防止删除 token 后残留。
 * 4. 全仓 token 不得有未使用项。
 * 只做静态源码检查，不启动浏览器。
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const WEB_SRC = path.join(ROOT, 'apps/web/src')
const failures = []

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}
function ok(condition, message) {
  if (!condition) failures.push(message)
}
function walk(dir, predicate) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full, predicate))
    else if (predicate(entry.name)) out.push(full)
  }
  return out
}
function styleBlocks(source) {
  return [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((match) => match[1]).join('\n')
}
function relOf(file) {
  return path.relative(ROOT, file).replaceAll('\\', '/')
}

const tokensCss = read('apps/web/src/styles/tokens.css')
const tokenNames = [
  ...new Set([...tokensCss.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((match) => match[1])),
]
const baseCss = read('apps/web/src/styles/base.css')

// ── 收集全仓已声明的自定义属性（token + 组件局部 --var + 内联样式对象键） ──
const allFiles = walk(WEB_SRC, (name) => /\.(vue|ts|css)$/.test(name))
const declaredProps = new Set(tokenNames)
for (const file of allFiles) {
  const source = fs.readFileSync(file, 'utf8')
  for (const match of source.matchAll(/(--[a-z0-9-]+)\s*:/g)) declaredProps.add(match[1])
  for (const match of source.matchAll(/['"](--[a-z0-9-]+)['"]\s*:/g)) declaredProps.add(match[1])
}

// ── 样式守卫 ──────────────────────────────────
const RAW_COLOR_PATTERN = /#[0-9a-fA-F]{3,8}\b|\brgba?\(/g
const BASE_PRIMITIVES =
  'panel|btn|chip|segmented|cap|card|eyebrow|count-badge|meta-btn|badge|popover|state-card|scroll-y|toolbar|common-capsule'
const PRIMITIVE_REDEF_RE = new RegExp(`^\\s*\\.(?:${BASE_PRIMITIVES})\\s*(?:,|\\{)`, 'm')
const FONT_LITERAL_RE = /\d+(\.\d+)?px|clamp\(/
const RADIUS_LITERAL_RE = /\d+(\.\d+)?px/
const MOTION_LITERAL_RE = /\b\d+(\.\d+)?m?s\b/

const styleFiles = walk(WEB_SRC, (name) => name.endsWith('.vue')).map((file) => ({
  file,
  css: styleBlocks(fs.readFileSync(file, 'utf8')),
}))
styleFiles.push({ file: path.join(WEB_SRC, 'styles/base.css'), css: baseCss })

for (const { file, css } of styleFiles) {
  const rel = relOf(file)
  const hits = [...new Set(css.match(RAW_COLOR_PATTERN) ?? [])]
  ok(hits.length === 0, `${rel} 的样式出现裸色值（应改用 token）：${hits.join(', ')}`)
  // base.css 是设计系统本体：允许 999px pill / spinner 700ms / reduced-motion 0.01ms 等字面量。
  if (rel.endsWith('styles/base.css')) continue

  for (const match of css.matchAll(/font-size:\s*([^;]+);/g)) {
    const value = match[1].trim()
    ok(
      value.includes('var(') || !FONT_LITERAL_RE.test(value),
      `${rel} 出现裸 font-size（应改成 --text-* token）：${value}`,
    )
  }
  for (const match of css.matchAll(/border-radius:\s*([^;]+);/g)) {
    const value = match[1].trim()
    ok(
      value.includes('var(') || !RADIUS_LITERAL_RE.test(value),
      `${rel} 出现裸 border-radius（应改成 --r-* token）：${value}`,
    )
  }
  for (const match of css.matchAll(/box-shadow:\s*([^;]+);/g)) {
    const value = match[1].trim()
    ok(
      value === 'none' || value.includes('var('),
      `${rel} 出现裸 box-shadow（应改成 --shadow-* / --ring-* token）：${value}`,
    )
  }
  for (const match of css.matchAll(/\b(?:transition|animation)(?:-duration)?\s*:\s*([^;]+);/g)) {
    const withoutVars = match[1].replace(/var\([^)]*\)/g, '')
    ok(
      !MOTION_LITERAL_RE.test(withoutVars),
      `${rel} 出现裸动效时长（应改成 --dur-* token）：${match[1].trim()}`,
    )
  }
}

for (const { file, css } of styleFiles.slice(0, -1)) {
  const rel = relOf(file)
  ok(
    !PRIMITIVE_REDEF_RE.test(css),
    `${rel} 重定义了 base.css 共享原语（${BASE_PRIMITIVES.replaceAll('|', '/')}）`,
  )
  for (const match of css.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
    ok(
      declaredProps.has(match[1]),
      `${rel} 引用了未声明的自定义属性 ${match[1]}（token 已删除或拼写错误）`,
    )
  }
}

// ── 键盘输入守卫：字符输入只能经 useKeyInput 管线，禁止组件各自监听 ──────
const rawKeyboardListeners = walk(WEB_SRC, (name) => name.endsWith('.vue')).filter((file) => {
  const rel = path.relative(WEB_SRC, file).replaceAll('\\', '/')
  if (rel === 'App.vue' || rel === 'pages/LearnMapPage.vue') return false
  return /window\.addEventListener\(\s*['"]keydown/.test(fs.readFileSync(file, 'utf8'))
})
ok(
  rawKeyboardListeners.length === 0,
  `禁止在组件内直接监听 window keydown（应使用 useKeyInput/useGlobalKeys）：${rawKeyboardListeners
    .map((file) => path.relative(ROOT, file).replaceAll('\\', '/'))
    .join(', ')}`,
)

// ── 主题化守卫：设计 token 不得有未使用项 ──────────────────
const allSources = allFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n')
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const unusedTokens = tokenNames.filter(
  (name) => !new RegExp(`var\\(\\s*${escapeRegExp(name)}\\b`).test(allSources),
)
ok(unusedTokens.length === 0, `tokens.css 存在未使用 token：${unusedTokens.join(', ')}`)

if (failures.length > 0) {
  console.error('✗ UI 约定检查失败：')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exitCode = 1
} else {
  console.log(
    `✓ UI 约定检查通过（token ${tokenNames.length} 个）`,
  )
}
