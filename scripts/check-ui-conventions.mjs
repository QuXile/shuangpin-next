#!/usr/bin/env node
/**
 * UI 约定静态检查：防止训练场再次出现「上下文色调不统一」和重复样式。
 * 只做静态源码检查，不启动浏览器。
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const failures = []

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}
function ok(condition, message) {
  if (!condition) failures.push(message)
}

const setupCard = read('apps/web/src/components/training/SetupCard.vue')
const setupGroup = read('apps/web/src/components/training/SetupGroup.vue')
const capsule = read('apps/web/src/components/training/CommonCapsule.vue')
const baseCss = read('apps/web/src/styles/base.css')
const training = read('apps/web/src/pages/TrainingPage.vue')

ok(setupCard.includes('--setup-accent'), 'SetupCard 必须提供 --setup-accent 色调变量')
ok(setupCard.includes('tone-hidden'), 'SetupCard 必须定义隐藏语气')
ok(setupGroup.includes('accent-color: var(--setup-accent'), 'SetupGroup 勾选框必须使用上下文强调色')
ok(setupGroup.includes('indeterminate'), 'SetupGroup 必须支持部分选中状态')
ok(capsule.includes(':aria-pressed'), '全拼沿用胶囊必须暴露 aria-pressed')
ok(!/--danger|--brand|is-hidden-chip|tone=/.test(capsule), 'CommonCapsule 不得维护独立色调')

ok(baseCss.includes('.chip.is-selected'), '全局 chip 选中样式应在 base.css 统一维护')
ok(baseCss.includes('var(--setup-accent'), '全局 chip 选中样式必须消费上下文色调')
ok(!/\.chip\.is-hidden-chip/.test(training), 'TrainingPage 不应再维护隐藏 chip 独立红色选择器')
ok(!/\.chip \{/.test(training), 'TrainingPage 不应重复定义 .chip 基础样式')

const screenshotRefs = [
  ...read('README.md').matchAll(/assets\/impl\/([\w.-]+\.png)/g),
  ...read('docs/ARCHITECTURE.md').matchAll(/assets\/impl\/([\w.-]+\.png)/g),
].map((match) => match[1])
for (const file of new Set(screenshotRefs)) {
  ok(fs.existsSync(path.join(ROOT, 'docs/assets/impl', file)), `文档引用的截图不存在：${file}`)
}

if (failures.length > 0) {
  console.error('✗ UI 约定检查失败：')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exitCode = 1
} else {
  console.log(`✓ UI 约定检查通过（文档截图引用 ${new Set(screenshotRefs).size} 张）`)
}
