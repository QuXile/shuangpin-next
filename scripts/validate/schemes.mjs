/**
 * 方案数据校验：索引一致性、每套方案可构造引擎、判题用例规模。
 */
import fs from 'node:fs'
import { createSchemeEngine } from '../../packages/core/src/index.ts'
import { SCHEME_DIR } from '../lib/data-contract.mjs'

const EXPECTED_SCHEME_COUNT = 19
const ENGINE_CASES_MIN_POSITIVE = 1500
const ENGINE_CASES_MIN_NEGATIVE = 150

export function validateSchemes(ctx) {
  const index = ctx.readDataJSON('data/schemes/index.json')
  if (!index) return
  const ids = (index.schemes ?? []).map((item) => item.id)
  const names = new Set((index.schemes ?? []).map((item) => item.name))
  const custom = index.customCourses ?? []

  ctx.ok(ids.length === EXPECTED_SCHEME_COUNT, `方案数 = ${ids.length}，期望 ${EXPECTED_SCHEME_COUNT}`)
  ctx.ok(new Set(ids).size === ids.length, '方案索引有重复方案')
  ctx.ok(names.size === ids.length, '方案显示名有重复')
  ctx.ok(ids.includes(index.defaultScheme), `defaultScheme ${index.defaultScheme} 不在方案列表`)
  ctx.ok(new Set(custom).size === custom.length, 'customCourses 有重复方案')
  ctx.ok(custom.every((id) => ids.includes(id)), 'customCourses 含未知方案')

  const dirs = fs
    .readdirSync(SCHEME_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  ctx.ok(
    JSON.stringify(dirs) === JSON.stringify([...ids].sort()),
    `方案目录与索引不一致：目录 ${dirs.length} 个 / 索引 ${ids.length} 个`,
  )

  const engines = new Map()
  for (const id of ids) {
    const scheme = ctx.readDataJSON(`data/schemes/${id}/scheme.json`)
    if (!scheme) continue
    ctx.ok(scheme.id === id, `${id}: scheme.json 的 id 与索引不一致`)
    const summaryName = index.schemes.find((item) => item.id === id)?.name
    ctx.ok(!summaryName || scheme.name === summaryName, `${id}: scheme.json 的 name 与索引不一致`)
    try {
      const engine = createSchemeEngine(scheme)
      const diff = engine.diff()
      engines.set(id, { engine, diff, scheme })
      ctx.ok(
        Array.isArray(diff.learnInitials) && Array.isArray(diff.learnFinals),
        `${id}: diff() 缺 learn 列表`,
      )
    } catch (error) {
      ctx.ok(false, `${id}: createSchemeEngine 失败：${error.message}`)
    }
  }
  ctx.ok(engines.size === EXPECTED_SCHEME_COUNT, `可加载方案 = ${engines.size}，期望 ${EXPECTED_SCHEME_COUNT}`)

  const cases = ctx.readDataJSON('data/schemes/engine-cases.json')
  if (cases) {
    const caseIds = Object.keys(cases.schemes ?? {}).sort()
    const all = Object.values(cases.schemes ?? {})
    const positive = all.reduce((sum, item) => sum + (item.positive?.length ?? 0), 0)
    const negative = all.reduce((sum, item) => sum + (item.negative?.length ?? 0), 0)
    ctx.ok(
      JSON.stringify(caseIds) === JSON.stringify([...ids].sort()),
      `判题用例覆盖方案与索引不一致：用例 ${caseIds.length} 套 / 索引 ${ids.length} 套`,
    )
    ctx.ok(
      positive >= ENGINE_CASES_MIN_POSITIVE && negative >= ENGINE_CASES_MIN_NEGATIVE,
      `判题用例不足：正例 ${positive} / 反例 ${negative}`,
    )
    ctx.note(`方案：${ids.length} 套（定制课程 ${custom.length} 套）；判题用例正例 ${positive} / 反例 ${negative}`)
  }

  ctx.schemeIndex = index
  ctx.engines = engines
}
