/**
 * 方案数据校验：索引一致性、每套方案可构造引擎、判题用例规模。
 */
import fs from 'node:fs'
import { createSchemeEngine } from '../../packages/core/src/index.ts'
import { SCHEME_DIR } from '../lib/data-contract.mjs'

/** 产品约束：方案套数（单点定义；其余数量全部从索引推导）。 */
const EXPECTED_SCHEME_COUNT = 19
/** 判题用例（engine-cases.json）的最低规模。 */
const ENGINE_CASES_MIN_POSITIVE = 1500
const ENGINE_CASES_MIN_NEGATIVE = 150

export function validateSchemes(ctx) {
  const schemeIndex = ctx.readDataJSON('data/schemes/index.json')
  if (!schemeIndex) return
  const schemes = schemeIndex.schemes ?? []
  const schemeIds = schemes.map((summary) => summary.id)
  const courseSupported = schemeIndex.courseSupported ?? []

  ctx.ok(schemeIds.length === EXPECTED_SCHEME_COUNT, `方案数 = ${schemeIds.length}，期望 ${EXPECTED_SCHEME_COUNT}`)
  ctx.ok(new Set(schemeIds).size === schemeIds.length, '方案索引有重复方案')
  ctx.ok(
    courseSupported.length === schemeIds.length,
    `courseSupported 数量 = ${courseSupported.length}，期望 ${schemeIds.length}`,
  )
  ctx.ok(new Set(courseSupported).size === courseSupported.length, 'courseSupported 有重复方案')
  for (const id of courseSupported) ctx.ok(schemeIds.includes(id), `courseSupported 含未知方案：${id}`)
  for (const summary of schemes) {
    ctx.ok(Boolean(summary.course?.supportsGuidedCourse), `${summary.id}: 课程方案缺 course.supportsGuidedCourse`)
  }
  // 方案目录与索引一一对应（多出的目录 = 陈旧数据）。
  const dirs = fs
    .readdirSync(SCHEME_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  ctx.ok(
    JSON.stringify(dirs) === JSON.stringify([...schemeIds].sort()),
    `方案目录与索引不一致：目录 ${dirs.length} 个 / 索引 ${schemeIds.length} 个`,
  )

  const engines = new Map()
  for (const summary of schemes) {
    const scheme = ctx.readDataJSON(`data/schemes/${summary.id}/scheme.json`)
    if (!scheme) continue
    ctx.ok(scheme.id === summary.id, `${summary.id}: scheme.json 的 id 与索引不一致`)
    try {
      const engine = createSchemeEngine(scheme)
      const diff = engine.diff()
      engines.set(scheme.id, { engine, diff, scheme })
      ctx.ok(
        Array.isArray(diff.learnInitials) && Array.isArray(diff.learnFinals),
        `${scheme.id}: diff() 缺 learn 列表`,
      )
    } catch (error) {
      ctx.ok(false, `${scheme.id}: createSchemeEngine 失败：${error.message}`)
    }
  }
  ctx.ok(engines.size === EXPECTED_SCHEME_COUNT, `可加载方案 = ${engines.size}，期望 ${EXPECTED_SCHEME_COUNT}`)

  const engineCases = ctx.readDataJSON('data/schemes/engine-cases.json')
  if (engineCases) {
    const cases = Object.values(engineCases.schemes ?? {})
    const caseIds = Object.keys(engineCases.schemes ?? {}).sort()
    const positive = cases.reduce((sum, item) => sum + (item.positive?.length ?? 0), 0)
    const negative = cases.reduce((sum, item) => sum + (item.negative?.length ?? 0), 0)
    ctx.ok(
      JSON.stringify(caseIds) === JSON.stringify([...schemeIds].sort()),
      `判题用例覆盖方案与索引不一致：用例 ${caseIds.length} 套 / 索引 ${schemeIds.length} 套`,
    )
    ctx.ok(
      positive >= ENGINE_CASES_MIN_POSITIVE && negative >= ENGINE_CASES_MIN_NEGATIVE,
      `判题用例不足：正例 ${positive} / 反例 ${negative}`,
    )
    ctx.note(`方案：${schemeIds.length} 套；判题用例正例 ${positive} / 反例 ${negative}`)
  }

  ctx.schemeIndex = schemeIndex
  ctx.engines = engines
}
