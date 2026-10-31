#!/usr/bin/env node
/**
 * C 双拼数据校验（只读，不修改 data）：
 *   1. 结构：compositional、23 声母 / 33 韵母 / 11 零声母（eng 缺口保留）、多键数组合法；
 *   2. 405 标准音节覆盖（engine-cases 全部正例命中原 recommended 码）；
 *   3. 旧数据回归：394 条旧整音节 override 码全部仍被接受；11 条零声母码不变；
 *   4. 10 条旧反例仍被拒绝；zero:eng 保持显式缺数据；
 *   5. sp.dat 转换完整：每个 [音节] 条目被 overrides 覆盖，或与组合展开等价；
 *   6. data/schemes/index.json 的 C 统计、data/packages/c 与 c.json 一致；
 *   7. 训练场可用：free atoms 非空，按全部/样例声母韵母范围可过滤出词与字。
 *
 * 用法：node scripts/schemes/validate-c.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  INITIALS,
  FINALS,
  ZERO_INITIALS,
  createSchemeEngine,
  filterTrainingEntries,
  freeAtomsOf,
  freeTrainingAtoms,
  splitPinyin,
} from '../../packages/core/src/index.ts'
import { DEFAULT_CONFIG, SOURCE_COMMIT, loadBaseline, parseConfig } from './build-c.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'))
const failures = []
const notes = []
const ok = (condition, message) => {
  if (!condition) failures.push(message)
}
const sortedJoin = (list) => [...list].sort().join('|')
const specOf = (pinyin) => {
  const split = splitPinyin(pinyin)
  if (!split) throw new Error(`无法拆分音节：${pinyin}`)
  return { initial: split.initial, final: split.final, zeroInitial: split.zeroInitial }
}

function main() {
  const scheme = read('data/schemes/c.json')
  const index = read('data/schemes/index.json')
  const cases = read('data/schemes/engine-cases.json').schemes.c
  const baseline = loadBaseline()
  const config = parseConfig(DEFAULT_CONFIG)
  const engine = createSchemeEngine(scheme)

  // ── 1. 结构 ────────────────────────────────────────────────
  ok(scheme.id === 'c' && scheme.name === 'C双拼', 'c.json 的 id/name 异常')
  ok(scheme.type === 'compositional', `type = ${scheme.type}，期望 compositional`)
  ok(sortedJoin(Object.keys(scheme.initials)) === sortedJoin(INITIALS), '声母表必须覆盖全部 23 个规范声母')
  ok(sortedJoin(Object.keys(scheme.finals)) === sortedJoin(FINALS), '韵母表必须覆盖全部 33 个规范韵母')
  const zeroKeys = Object.keys(scheme.zeroInitial)
  ok(zeroKeys.length === 11, `zeroInitial = ${zeroKeys.length}，期望 11（保留 eng 缺口）`)
  ok(!zeroKeys.includes('eng'), 'zeroInitial.eng 不应出现（core 测试按数据缺口处理）')
  for (const final of zeroKeys) ok(ZERO_INITIALS.includes(final), `未知零声母：${final}`)
  for (const [label, table] of [['声母', scheme.initials], ['韵母', scheme.finals]]) {
    for (const [name, keys] of Object.entries(table)) {
      ok(Array.isArray(keys) && keys.length > 0 && keys.length <= 2, `${label} ${name} 键位数组非法`)
      for (const key of keys) ok(/^[a-z;]$/.test(key), `${label} ${name} 键位非法：${key}`)
    }
  }
  const overrideEntries = Object.entries(scheme.overrides ?? {})
  ok(overrideEntries.length > 0 && overrideEntries.length < 197, `overrides = ${overrideEntries.length}，应 < 197（旧 394 的一半）`)
  for (const [key, codes] of overrideEntries) {
    ok(Array.isArray(codes) && codes.length > 0 && codes.length <= 4, `override ${key} 码数组非法`)
    for (const code of codes) ok(/^[a-z;]{2}$/.test(code), `override ${key} 码非法：${code}`)
  }

  // ── 2/3/4. 405 覆盖 + 394 旧 override 回归 + 零声母 + 反例 ────
  let accepted = 0
  let nonZeroAccepted = 0
  let zeroAccepted = 0
  for (const item of cases.positive) {
    const spec = { initial: item.initial, final: item.final, zeroInitial: item.zeroInitial === true }
    const code = item.accepted[0]
    if (!engine.judge(code, spec)) continue
    accepted += 1
    if (item.zeroInitial) zeroAccepted += 1
    else nonZeroAccepted += 1
    ok(engine.primarySequence(spec).join('') === code, `主键不一致：${item.pinyin} 期望 ${code}`)
  }
  ok(accepted === 405, `405 标准音节覆盖 = ${accepted}/405`)
  ok(nonZeroAccepted === 394, `旧整音节 override 回归 = ${nonZeroAccepted}/394`)
  ok(zeroAccepted === 11, `零声母码回归 = ${zeroAccepted}/11`)
  for (const item of cases.negative) {
    for (const code of item.rejected) {
      ok(!engine.judge(code, specOf(item.pinyin)), `反例被接受：${item.pinyin} → ${code}`)
    }
  }
  ok(
    engine.acceptedSequences({ initial: '', final: 'eng', zeroInitial: true }).length === 0,
    'zero:eng 应保持显式缺数据（空接受集）',
  )

  // 主键口径（与 engine.test.ts 的 C 双拼断言一致）
  ok(engine.primarySequence({ initial: 'b', final: 'a' }).join('') === 'ba', 'b+a 主键应为 ba')
  ok(engine.primarySequence({ initial: 'b', final: 'ai' }).join('') === 'bh', 'b+ai 主键应为 bh')
  ok(engine.primarySequence({ initial: '', final: 'a', zeroInitial: true }).join('') === 'ah', 'zero a 主键应为 ah')

  // ── 5. sp.dat 转换完整性 ───────────────────────────────────
  let configMapped = 0
  let configEquivalent = 0
  for (const [key, configCodes] of config.syllableOverrides) {
    const override = scheme.overrides[key]
    if (override) {
      configMapped += 1
      for (const code of configCodes) ok(override.includes(code), `sp.dat 码未进入 override：${key} → ${code}`)
      continue
    }
    const acceptedCodes = engine.acceptedSequences(specOf(key)).map((sequence) => sequence.join(''))
    if (sortedJoin(acceptedCodes) === sortedJoin(configCodes)) configEquivalent += 1
    else failures.push(`sp.dat [音节] 条目既未转 override 也不等价：${key}（${configCodes.join('|')}）`)
  }
  for (const [initial, keys] of config.initialOverrides) {
    for (const key of keys) ok(scheme.initials[initial]?.includes(key), `sp.dat 声母映射丢失：${initial}=${key}`)
  }
  for (const [final, keys] of config.finalOverrides) {
    for (const key of keys) ok(scheme.finals[final]?.includes(key), `sp.dat 韵母映射丢失：${final}=${key}`)
  }
  notes.push(`sp.dat [音节] 条目 ${config.syllableOverrides.size}：override ${configMapped} / 等价省略 ${configEquivalent}`)

  // ── 6. index 统计 / 方案包一致性 ────────────────────────────
  const free = freeAtomsOf(scheme)
  const overrideFree = overrideEntries.filter(([key, codes]) => {
    const split = splitPinyin(key)
    return Boolean(split) && codes.some((code) => code === `${split.initial}${split.final}`)
  }).length
  const summary = index.schemes.find((item) => item.id === 'c')
  ok(Boolean(summary), 'data/schemes/index.json 缺少 c 条目')
  if (summary) {
    ok(summary.type === 'compositional', `index c.type = ${summary.type}`)
    ok(summary.keys?.initials === INITIALS.length, `index keys.initials = ${summary.keys?.initials}`)
    ok(summary.keys?.finals === FINALS.length, `index keys.finals = ${summary.keys?.finals}`)
    ok(summary.keys?.zeroInitial === zeroKeys.length, `index keys.zeroInitial = ${summary.keys?.zeroInitial}`)
    ok(summary.keys?.overrides === overrideEntries.length, `index keys.overrides = ${summary.keys?.overrides}`)
    ok(summary.atoms?.initials?.free === free.freeInitials.length, 'index 声母 free 统计不一致')
    ok(summary.atoms?.initials?.learn === INITIALS.length - free.freeInitials.length, 'index 声母 learn 统计不一致')
    ok(summary.atoms?.finals?.free === free.freeFinals.length, 'index 韵母 free 统计不一致')
    ok(summary.atoms?.finals?.learn === FINALS.length - free.freeFinals.length, 'index 韵母 learn 统计不一致')
    ok(summary.atoms?.zeroInitial?.free === free.freeZero.length, 'index 零声母 free 统计不一致')
    ok(summary.atoms?.zeroInitial?.total === zeroKeys.length, 'index 零声母 total 统计不一致')
    ok(summary.atoms?.overrides?.total === overrideEntries.length, 'index overrides total 统计不一致')
    ok(summary.atoms?.overrides?.learn === overrideEntries.length - overrideFree, 'index overrides learn 统计不一致')
    ok(
      summary.atoms?.total?.free ===
        free.freeInitials.length + free.freeFinals.length + free.freeZero.length + overrideFree,
      'index total free 统计不一致',
    )
    ok(
      summary.atoms?.total?.total === INITIALS.length + FINALS.length + zeroKeys.length + overrideEntries.length,
      'index total.total 统计不一致',
    )
    const codeMap = new Map()
    for (const item of cases.positive) {
      const spec = { initial: item.initial, final: item.final, zeroInitial: item.zeroInitial === true }
      const code = engine.primarySequence(spec).join('')
      codeMap.set(code, (codeMap.get(code) ?? 0) + 1)
    }
    ok(summary.ambiguity?.codes === codeMap.size, `index ambiguity.codes = ${summary.ambiguity?.codes}，重算 ${codeMap.size}`)
    ok(
      summary.ambiguity?.ambiguousCodes === [...codeMap.values()].filter((count) => count > 1).length,
      'index ambiguity.ambiguousCodes 与重算不一致',
    )
    ok(summary.course?.supportsGuidedCourse === false, 'C 仍应为纯练习方案（不伪造课程）')
    ok(summary.recommendation?.rank === 19, 'index recommendation.rank 应保持 19')
  }
  ok(scheme.source?.repo === 'fcitx/fcitx5-chinese-addons', 'provenance 未指向 fcitx 配置')
  ok(String(scheme.source?.note ?? '').includes(SOURCE_COMMIT), 'provenance 缺 sp.dat commit')
  ok(String(scheme.source?.note ?? '').includes('BlueSky-07/Shuang'), 'provenance 未保留旧数据来源')
  ok(Array.isArray(scheme.notes) && scheme.notes.length > 0, 'c.json 缺 notes')
  if (fs.existsSync(path.join(ROOT, 'data/packages/c/scheme.json'))) {
    ok(
      JSON.stringify(read('data/packages/c/scheme.json')) === JSON.stringify(scheme),
      'data/packages/c/scheme.json 与 data/schemes/c.json 不一致',
    )
    const manifest = read('data/packages/c/manifest.json')
    ok(manifest.capabilities?.zeroInitial === true, 'c 包 manifest.zeroInitial 应为 true')
    ok(manifest.capabilities?.course === false, 'c 包 manifest.course 应为 false')
    ok(manifest.curriculum === null, 'practice-only 包不应带 curriculum')
  } else {
    notes.push('未找到 data/packages/c/scheme.json（先运行 scheme-packages/build.mjs）')
  }

  // ── 7. 训练场可用性 ───────────────────────────────────────
  const trainingFree = freeTrainingAtoms(scheme)
  ok(
    trainingFree.initials.length > 0 && trainingFree.finals.length > 0 && trainingFree.zeroFinals.length > 0,
    'free atoms 为空，训练场不会出现范围',
  )
  const words = read('data/words/words.sample.json').words
  const chars = read('data/training/bank.json').chars
  const allScope = { initials: [...INITIALS], finals: [...FINALS], zeroFinals: zeroKeys }
  const sampleScope = {
    initials: ['zh', 'ch', 'sh', 'b', 'p', 'm'],
    finals: ['a', 'ai', 'ao', 'an', 'ang', 'ong'],
    zeroFinals: [],
  }
  const filteredWords = filterTrainingEntries(words, allScope)
  const filteredChars = filterTrainingEntries(chars, allScope)
  const sampleWords = filterTrainingEntries(words, sampleScope)
  ok(filteredWords.length > 0, '按全部声母/韵母范围过滤词库为空')
  ok(filteredChars.length > 0, '按全部声母/韵母范围过滤字库为空')
  ok(sampleWords.length > 0, '样例声母/韵母范围过滤词库为空（训练场无法练词）')
  notes.push(
    `训练场：free 声母 ${trainingFree.initials.length} / 韵母 ${trainingFree.finals.length} / 零声母 ${trainingFree.zeroFinals.length}；` +
      `全范围词 ${filteredWords.length} / 字 ${filteredChars.length}；样例范围词 ${sampleWords.length}`,
  )

  // ── 输出 ──────────────────────────────────────────────────
  notes.unshift(
    `结构：initials ${Object.keys(scheme.initials).length} / finals ${Object.keys(scheme.finals).length} / ` +
      `zeroInitial ${zeroKeys.length} / overrides ${overrideEntries.length}（旧 394）`,
  )
  notes.push('回归：405/405 正例、394/394 旧 override、11/11 零声母、10/10 反例拒绝通过')
  if (failures.length > 0) {
    console.error('✗ C 双拼校验失败：')
    for (const failure of failures) console.error(`  - ${failure}`)
    process.exitCode = 1
    return
  }
  console.log('=== C 双拼校验 ===')
  for (const note of notes) console.log(`· ${note}`)
  console.log('\n✅ 全部通过')
}

try {
  main()
} catch (error) {
  console.error('❌ C 双拼校验异常：', error)
  process.exitCode = 1
}
