#!/usr/bin/env node
/**
 * 一键数据校验（纯 Node + core TS 原生导入）。
 *
 * 域模块（每个域一个文件，入口只做编排与汇总）：
 *  - validate/schemes.mjs      方案索引一致性 / 引擎可构造 / 判题用例规模
 *  - validate/lexicon.mjs      统一 Lexicon 数据契约
 *  - validate/curriculum.mjs   19 套课程：5 套定制严格校验 + 14 套「重新生成 + JSON 深相等」+ 独立结构不变式
 *  - validate/public-data.mjs  public/data 文件清单 + 与 data/ JSON 深相等 + 版本链
 *  - validate/docs.mjs         文档入口 / README 导航 / 截图与链接引用
 *
 * 用法：node scripts/validate-all.mjs   （退出码 0/1）
 */
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, readJSON } from './lib/data-contract.mjs'
import { validateCurriculum } from './validate/curriculum.mjs'
import { validateDocs } from './validate/docs.mjs'
import { validateLexicon } from './validate/lexicon.mjs'
import { validatePublicData } from './validate/public-data.mjs'
import { validateSchemes } from './validate/schemes.mjs'

function createContext() {
  const failures = []
  const notes = []
  return {
    failures,
    notes,
    /** 跨模块共享的权威数据（由各域模块依次填充）。 */
    schemeIndex: null,
    engines: new Map(),
    lexicon: null,
    ok(condition, message) {
      if (!condition) failures.push(message)
    },
    note(message) {
      notes.push(message)
    },
    readDataJSON(relPath) {
      const file = path.join(ROOT, relPath)
      if (!fs.existsSync(file)) {
        failures.push(`缺少文件：${relPath}`)
        return null
      }
      try {
        return readJSON(file)
      } catch (error) {
        failures.push(`${relPath} 解析失败：${error.message}`)
        return null
      }
    },
  }
}

function main() {
  const ctx = createContext()
  validateSchemes(ctx)
  validateLexicon(ctx)
  validateCurriculum(ctx)
  validatePublicData(ctx)
  validateDocs(ctx)

  console.log('=== 数据管线校验 ===')
  for (const note of ctx.notes) console.log(`· ${note}`)
  if (ctx.failures.length === 0) {
    console.log('\n✅ 全部通过')
    process.exitCode = 0
    return
  }
  console.error(`\n❌ ${ctx.failures.length} 项失败：`)
  for (const failure of ctx.failures.slice(0, 60)) console.error(`  - ${failure}`)
  process.exitCode = 1
}

try {
  main()
} catch (error) {
  console.error('❌ 校验异常：', error)
  process.exitCode = 1
}
