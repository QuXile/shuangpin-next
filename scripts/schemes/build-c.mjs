#!/usr/bin/env node
/**
 * C 双拼数据重建：整音节码（394 override）→ 组合式（声母 / 多键韵母 / 少量音节特例）。
 *
 * 数据来源（事实键位映射）：
 *   fcitx/fcitx5-chinese-addons @ e8d930f402e359cfd76a101ee3e46815d1331d83
 *   im/pinyin/sp.dat.example（LGPL-2.1-or-later）
 *   本地快照：scripts/schemes/fcitx-c-sp.dat（sha256 校验见 CONFIG_SHA256）
 *
 * 解析规则（与 libime ShuangpinProfile 的 sp.dat 解析一致）：
 *   - [声母] / [韵母] 的 1 键值：`pinyin=键`（例：ch=u、ai=h）。
 *     同一 pinyin 多行（如 ch=u / ch=;）保留为多键数组；
 *   - 2 字符值（如 `ju=jv`）：整音节键序列 → overrides；
 *   - 空零声母标识 `=` 忽略；零声母沿用 c.json 原表（core 测试把 zero:eng 视为数据缺口）。
 *
 * 默认映射：core INITIALS / FINALS 的恒等映射为底，覆盖配置中的非恒等项。
 * overrides = 配置中的整音节条目 ∪ 旧整音节码回归所需条目：
 *   - 与组合展开完全等价的 [音节] 条目省略；
 *   - 旧 recommended 码必须被接受，且作为主键（键帽显示）；
 *   - 有旧码但组合不出的音节补 override，有配置条目但缺旧码的合并旧码。
 *
 * 同时按最新 c.json 重算 data/schemes/index.json 的 C 条目统计（core 契约测试要求
 * diff() 与 index.json 的 atoms 统计一致）。
 *
 * 写入顺序：build-c → sync-data（重建 data/packages/c 并同步 public/data）→ validate-c。
 *
 * 用法：node scripts/schemes/build-c.mjs [--config=<sp.dat>] [--no-index] [--dry-run]
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  INITIALS,
  FINALS,
  ZERO_INITIALS,
  createSchemeEngine,
  freeAtomsOf,
  splitPinyin,
} from '../../packages/core/src/index.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCHEME_FILE = path.join(ROOT, 'data/schemes/c.json')
const INDEX_FILE = path.join(ROOT, 'data/schemes/index.json')
const CASES_FILE = path.join(ROOT, 'data/schemes/engine-cases.json')
export const SCHEMES_DIR = path.join(ROOT, 'data/schemes')
export const DEFAULT_CONFIG = path.join(ROOT, 'scripts/schemes/fcitx-c-sp.dat')

/** vendored sp.dat 快照校验（来源 commit 见文件头）。 */
export const CONFIG_SHA256 = 'e4101442faa7ae0c16471b0eee8fdaf2034175d0bb76ceed7a2f9a48136480cb'
export const SOURCE_COMMIT = 'e8d930f402e359cfd76a101ee3e46815d1331d83'

const argv = process.argv.slice(2)
const configPath = argv.find((arg) => arg.startsWith('--config='))?.slice('--config='.length) ?? DEFAULT_CONFIG
const writeIndex = !argv.includes('--no-index')
const dryRun = argv.includes('--dry-run')

const FINAL_SET = new Set(FINALS)
const INITIAL_SET = new Set(INITIALS)
const canonOrder = (list, value) => list.indexOf(value)

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

export function parseConfig(file) {
  const text = fs.readFileSync(file, 'utf8')
  const configSha = sha256(Buffer.from(text, 'utf8'))
  if (configSha !== CONFIG_SHA256) {
    throw new Error(`sp.dat 快照 sha256 不匹配：${configSha}（期望 ${CONFIG_SHA256}）`)
  }
  const initialOverrides = new Map()
  const finalOverrides = new Map()
  const syllableOverrides = new Map()
  const zeroConfig = new Map()
  let optionName = ''
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('方案名称=')) {
      optionName = line.slice('方案名称='.length)
      if (optionName === '自然码' || optionName === '微软' || optionName === '紫光' ||
          optionName === '拼音加加' || optionName === '中文之星' || optionName === '智能ABC' ||
          optionName === '小鹤') {
        throw new Error(`sp.dat 指向内置方案「${optionName}」，不是自定义 C 双拼配置`)
      }
      continue
    }
    // 空零声母标识：解析器会忽略；零声母沿用旧 c.json 原表
    if (line.startsWith('=') && !line.includes('=')) continue
    if (line === '=') continue
    const equal = line.indexOf('=')
    if (equal <= 0) continue
    const pinyin = line.slice(0, equal).trim().toLowerCase()
    const value = line.slice(equal + 1).trim().toLowerCase()
    if (!/^[a-z]+$/.test(pinyin) || !/^[a-z;]{1,2}$/.test(value)) {
      throw new Error(`无法解析 sp.dat 行：${line}`)
    }
    if (value.length === 1) {
      if (FINAL_SET.has(pinyin)) {
        const keys = finalOverrides.get(pinyin) ?? []
        if (!keys.includes(value)) keys.push(value)
        finalOverrides.set(pinyin, keys)
      } else if (INITIAL_SET.has(pinyin)) {
        const keys = initialOverrides.get(pinyin) ?? []
        if (!keys.includes(value)) keys.push(value)
        initialOverrides.set(pinyin, keys)
      } else {
        throw new Error(`未知声母/韵母映射：${line}`)
      }
      continue
    }
    const split = splitPinyin(pinyin)
    if (!split) throw new Error(`无法拆分的 [音节] 条目：${line}`)
    if (split.zeroInitial) {
      const codes = zeroConfig.get(pinyin) ?? []
      if (!codes.includes(value)) codes.push(value)
      zeroConfig.set(pinyin, codes)
      continue
    }
    const key = `${split.initial}${split.final}`
    const codes = syllableOverrides.get(key) ?? []
    if (!codes.includes(value)) codes.push(value)
    syllableOverrides.set(key, codes)
  }
  return { initialOverrides, finalOverrides, syllableOverrides, zeroConfig, configSha }
}

/** 旧数据回归基线：engine-cases 的 405 条正例即旧 c.json 的 recommended 码。 */
export function loadBaseline() {
  const cases = readJSON(CASES_FILE).schemes.c
  if (!cases) throw new Error('engine-cases.json 缺少 c 方案')
  const codes = new Map()
  const zeroCodes = new Map()
  for (const item of cases.positive) {
    const spec = { initial: item.initial, final: item.final, zeroInitial: item.zeroInitial === true }
    const key = item.zeroInitial ? item.final : `${item.initial}${item.final}`
    if (item.zeroInitial) zeroCodes.set(item.final, item.accepted[0])
    else codes.set(key, { code: item.accepted[0], spec })
  }
  if (codes.size !== 394) throw new Error(`非零声母正例 = ${codes.size}，期望 394`)
  if (zeroCodes.size !== 11) throw new Error(`零声母正例 = ${zeroCodes.size}，期望 11`)
  return { cases, codes, zeroCodes }
}

/** 校验旧 c.json（整音节码 + 缺失 eng 的零声母表）与回归基线一致；已重建后则跳过。 */
function checkLegacyData(legacy, baseline) {
  if (!fs.existsSync(SCHEME_FILE)) return
  const old = readJSON(SCHEME_FILE)
  if (old.type !== 'syllable-code') return
  const oldOverrides = old.overrides ?? {}
  const oldZeros = old.zeroInitial ?? {}
  if (Object.keys(oldOverrides).length !== 394) {
    throw new Error(`旧 c.json overrides = ${Object.keys(oldOverrides).length}，期望 394`)
  }
  if (Object.keys(oldZeros).length !== 11) {
    throw new Error(`旧 c.json zeroInitial = ${Object.keys(oldZeros).length}，期望 11`)
  }
  for (const [key, entry] of baseline.codes) {
    if (oldOverrides[key]?.[0] !== entry.code) throw new Error(`旧 c.json 与 engine-cases 不一致：${key}`)
  }
  for (const [final, code] of baseline.zeroCodes) {
    if (oldZeros[final]?.[0] !== code) throw new Error(`旧 c.json 零声母与 engine-cases 不一致：${final}`)
  }
  legacy.seen = true
}

function buildScheme({ initialOverrides, finalOverrides, syllableOverrides }, baseline, zeroInitial) {
  const initials = {}
  for (const initial of INITIALS) {
    initials[initial] = initialOverrides.get(initial) ?? [initial]
  }
  const finals = {}
  for (const final of FINALS) {
    finals[final] = finalOverrides.get(final) ?? [final]
  }
  const composition = {
    id: 'c',
    name: 'C双拼',
    type: 'compositional',
    initials,
    finals,
    zeroInitial,
    overrides: {},
  }
  const compositionEngine = createSchemeEngine(composition)
  const composed = new Map()
  for (const [key, entry] of baseline.codes) {
    composed.set(
      key,
      compositionEngine.acceptedSequences(entry.spec).map((sequence) => sequence.join('')),
    )
  }

  const overrides = {}
  let omittedEquivalent = 0
  let mergedLegacyCode = 0
  for (const [key, configCodes] of syllableOverrides) {
    const legacyCode = baseline.codes.get(key)?.code
    const compositionCodes = composed.get(key) ?? []
    const merged = [...(legacyCode ? [legacyCode] : []), ...configCodes.filter((code) => code !== legacyCode)]
    const sameSet =
      merged.length === compositionCodes.length &&
      merged.every((code) => compositionCodes.includes(code))
    if (sameSet) {
      omittedEquivalent += 1
      continue
    }
    overrides[key] = merged
    if (legacyCode && !configCodes.includes(legacyCode)) mergedLegacyCode += 1
  }

  let addedWithoutConfig = 0
  let forcedPrimary = 0
  for (const [key, entry] of baseline.codes) {
    if (overrides[key]) continue
    const legacyCode = entry.code
    const compositionCodes = composed.get(key) ?? []
    if (!compositionCodes.includes(legacyCode)) {
      overrides[key] = [legacyCode]
      addedWithoutConfig += 1
      continue
    }
    if (compositionCodes[0] !== legacyCode) {
      // 旧 recommended 码作为主键（键帽展示），同时保留组合式多解
      overrides[key] = [legacyCode, ...compositionCodes.filter((code) => code !== legacyCode)]
      forcedPrimary += 1
    }
  }

  // 旧数据里只有组合解的音节不需要 override；only-override 的音节按字典序输出便于 diff。
  const sortedOverrides = {}
  for (const key of Object.keys(overrides).sort()) sortedOverrides[key] = overrides[key]

  return {
    scheme: {
      id: 'c',
      name: 'C双拼',
      type: 'compositional',
      initials,
      finals,
      zeroInitial,
      overrides: sortedOverrides,
      umlautNote:
        'j/q/x/y + u：组合式默认主键 U；配置中的 [音节] 条目（如 ju=jv）会收窄为该整段码。',
      sameKeyGroups: sameKeyGroups(finals),
      source: {
        repo: 'fcitx/fcitx5-chinese-addons',
        file: 'im/pinyin/sp.dat.example',
        note:
          `按 commit ${SOURCE_COMMIT} 的 sp.dat.example 重建（LGPL-2.1-or-later；本地快照 scripts/schemes/fcitx-c-sp.dat，` +
          '仅解析键位事实，未复制实现代码）。旧整音节码回归基线来自 BlueSky-07/Shuang v6.0.0 ' +
          'commit 5a5e71e（GPL-3.0，仅键位事实）。',
      },
      notes: [
        'type=compositional：以 core 的 23 声母 / 33 韵母恒等映射为底，叠加 sp.dat 的非恒等映射；一音多键保留为数组（ch=u/;、zh=o/v、ua=a/m、uo=p/b）。',
        '整音节 overrides 由 sp.dat [音节] 条目与旧整音节码回归共同决定：与组合展开等价者省略，旧 recommended 码优先并作为主键。',
        '零声母沿用旧表 11 条（a/ai/an/ang/ao/e/ei/en/er/o/ou）；eng 暂缺，core 测试与练习侧按数据缺口处理（sp.dat 中的 eng=eg 未启用）。',
        '旧表非规范条目 jv 由组合 j+v 自然命中；nou 保留 override（旧码 nq）；参考表中 394 条旧 override 已全部回归校验通过。',
        '表内仍有同码（约 49 组），只建议用于自由练习 / 实验，不能用于「键序列 → 唯一音节」逆向解码。',
      ],
    },
    stats: { omittedEquivalent, mergedLegacyCode, addedWithoutConfig, forcedPrimary },
  }
}

function sameKeyGroups(finals) {
  const byKey = new Map()
  for (const final of FINALS) {
    for (const key of finals[final]) {
      if (!byKey.has(key)) byKey.set(key, [])
      byKey.get(key).push(final)
    }
  }
  return [...byKey.entries()]
    .filter(([, groupFinals]) => groupFinals.length > 1)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, groupFinals]) => ({
      key,
      finals: [...groupFinals].sort((a, b) => canonOrder(FINALS, a) - canonOrder(FINALS, b)),
    }))
}

function zeroInitialFromBaseline(baseline) {
  const zeroInitial = {}
  for (const final of ZERO_INITIALS) {
    const code = baseline.zeroCodes.get(final)
    if (code) zeroInitial[final] = [code]
  }
  return zeroInitial
}

function buildIndexSummary(scheme, baseline) {
  const engine = createSchemeEngine(scheme)
  const free = freeAtomsOf(scheme)
  const overrides = Object.entries(scheme.overrides)
  const overrideFree = overrides.filter(([key, codes]) => {
    const entry = baseline.codes.get(key)
    if (!entry) return false
    const pinyin = `${entry.spec.initial}${entry.spec.final}`
    return codes.some((code) => code === pinyin)
  })
  const zeroTotal = Object.keys(scheme.zeroInitial).length
  const atoms = {
    initials: {
      total: INITIALS.length,
      free: free.freeInitials.length,
      learn: INITIALS.length - free.freeInitials.length,
    },
    finals: {
      total: FINALS.length,
      free: free.freeFinals.length,
      learn: FINALS.length - free.freeFinals.length,
    },
    zeroInitial: {
      total: zeroTotal,
      free: free.freeZero.length,
      learn: zeroTotal - free.freeZero.length,
    },
    overrides: {
      total: overrides.length,
      free: overrideFree.length,
      learn: overrides.length - overrideFree.length,
    },
  }
  atoms.total = {
    free: atoms.initials.free + atoms.finals.free + atoms.zeroInitial.free + atoms.overrides.free,
    learn: atoms.initials.learn + atoms.finals.learn + atoms.zeroInitial.learn + atoms.overrides.learn,
  }
  atoms.total.total = atoms.total.free + atoms.total.learn

  const codeMap = new Map()
  for (const item of baseline.cases.positive) {
    const spec = { initial: item.initial, final: item.final, zeroInitial: item.zeroInitial === true }
    const code = engine.primarySequence(spec).join('')
    const pinyins = codeMap.get(code) ?? []
    pinyins.push(item.pinyin)
    codeMap.set(code, pinyins)
  }
  const ambiguous = [...codeMap.entries()]
    .filter(([, pinyins]) => pinyins.length > 1)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

  const multiKeyFinals = FINALS.filter((final) => scheme.finals[final].length > 1)
  const flyingInitials = INITIALS.filter((initial) => scheme.initials[initial].length > 1)
  return {
    type: 'compositional',
    keys: {
      initials: INITIALS.length,
      finals: FINALS.length,
      zeroInitial: zeroTotal,
      overrides: overrides.length,
      flyingInitials,
      multiKeyFinals,
      sameKeyGroups: scheme.sameKeyGroups.length,
    },
    atoms,
    zeroInitialFamily: '原表（与组合规则无关）',
    zeroInitialRule: '零声母沿用原表：双字母直出；a/ang/e/er/o 为特例；eng 暂缺。',
    ambiguity: {
      codes: codeMap.size,
      ambiguousCodes: ambiguous.length,
      examples: ambiguous.slice(0, 8).map(([code, pinyins]) => ({ code, pinyin: pinyins })),
      missingSyllables: ['eng'],
    },
    course: {
      supportsGuidedCourse: false,
      courseTier: 'free-practice',
      reason: '已重建为组合式数据，但本期仍无课程模板：保持纯练习方案，不伪造 curriculum。',
      courseNotes: '若后续做课程，可按「声母改造 → 韵母家族 → 音节特例」设计；需要课程生成器支持该方案。',
    },
    recommendation: {
      rank: 19,
      reason: '组合式方案（含整音节特例与较多同码），本期无课程，仅建议自由练习 / 实验。',
    },
    dataGaps: [
      'zeroInitial.eng 缺失：旧参考表未收录且现有 core 测试按数据缺口处理；sp.dat 中的 eng=eg 未启用。',
    ],
  }
}

function validateScheme(scheme, baseline) {
  const engine = createSchemeEngine(scheme)
  const problems = []

  for (const initial of INITIALS) {
    const keys = scheme.initials[initial]
    if (!Array.isArray(keys) || keys.length === 0) problems.push(`声母 ${initial} 缺键位`)
    for (const key of keys) if (!/^[a-z;]$/.test(key)) problems.push(`声母 ${initial} 键位非法：${key}`)
  }
  for (const final of FINALS) {
    const keys = scheme.finals[final]
    if (!Array.isArray(keys) || keys.length === 0) problems.push(`韵母 ${final} 缺键位`)
    for (const key of keys) if (!/^[a-z;]$/.test(key)) problems.push(`韵母 ${final} 键位非法：${key}`)
  }
  const zeroKeys = Object.keys(scheme.zeroInitial)
  if (zeroKeys.length !== 11) problems.push(`zeroInitial = ${zeroKeys.length}，期望 11（eng 缺口保留）`)
  if (zeroKeys.includes('eng')) problems.push('zeroInitial.eng 不应出现（core 测试按缺口处理）')
  for (const [final, codes] of Object.entries(scheme.zeroInitial)) {
    if (codes[0] !== baseline.zeroCodes.get(final)) problems.push(`零声母 ${final} 码被改变：${codes[0]}`)
  }
  if (Object.keys(scheme.overrides).length >= 394) {
    problems.push(`overrides = ${Object.keys(scheme.overrides).length}，未低于旧 394 条`)
  }

  let accepted = 0
  for (const item of baseline.cases.positive) {
    const spec = { initial: item.initial, final: item.final, zeroInitial: item.zeroInitial === true }
    const code = item.accepted[0]
    if (engine.judge(code, spec)) accepted += 1
    else problems.push(`正例未命中：${item.pinyin} → ${code}`)
    const primary = engine.primarySequence(spec).join('')
    if (primary !== code) problems.push(`主键不一致：${item.pinyin} 期望 ${code}，实际 ${primary}`)
  }
  for (const item of baseline.cases.negative) {
    const split = splitPinyin(item.pinyin)
    for (const code of item.rejected) {
      const spec = split
        ? { initial: split.initial, final: split.final, zeroInitial: split.zeroInitial }
        : null
      if (!spec) {
        problems.push(`反例无法拆分：${item.pinyin}`)
        continue
      }
      if (engine.judge(code, spec)) problems.push(`反例被接受：${item.pinyin} → ${code}`)
    }
  }
  if (accepted !== baseline.cases.positive.length) {
    problems.push(`正例通过 ${accepted}/${baseline.cases.positive.length}`)
  }
  if (problems.length > 0) {
    throw new Error(`C 双拼数据校验失败：\n  - ${problems.slice(0, 20).join('\n  - ')}`)
  }
  return { engine, accepted }
}

function main() {
  const parsed = parseConfig(path.resolve(configPath))
  const baseline = loadBaseline()
  const legacy = {}
  checkLegacyData(legacy, baseline)
  const zeroInitial = zeroInitialFromBaseline(baseline)
  const { scheme, stats } = buildScheme(parsed, baseline, zeroInitial)
  const { accepted } = validateScheme(scheme, baseline)
  const indexSummary = buildIndexSummary(scheme, baseline)

  if (!dryRun) {
    fs.writeFileSync(SCHEME_FILE, `${JSON.stringify(scheme, null, 2)}\n`, 'utf8')
    if (writeIndex) {
      const index = readJSON(INDEX_FILE)
      const entry = index.schemes.find((item) => item.id === 'c')
      if (!entry) throw new Error('data/schemes/index.json 缺少 c 条目')
      Object.assign(entry, indexSummary)
      fs.writeFileSync(INDEX_FILE, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
    }
  }

  const oldOverrideCount = 394
  const newOverrideCount = Object.keys(scheme.overrides).length
  console.log('[build-c] 数据源：fcitx5-chinese-addons sp.dat.example @ e8d930f（本地快照校验通过）')
  console.log(
    `[build-c] 声母键：${INITIALS.map((name) => `${name}=${scheme.initials[name].join('|')}`).join(' ')}`,
  )
  console.log(
    `[build-c] 韵母非恒等：${FINALS.filter((final) => scheme.finals[final].length > 1 || scheme.finals[final][0] !== final)
      .map((final) => `${final}=${scheme.finals[final].join('|')}`)
      .join(' ')}`,
  )
  console.log(
    `[build-c] overrides：${oldOverrideCount} → ${newOverrideCount}` +
      `（配置条目 ${parsed.syllableOverrides.size}；等价省略 ${stats.omittedEquivalent}；` +
      `旧码合并 ${stats.mergedLegacyCode}；无配置补旧码 ${stats.addedWithoutConfig}；主键修正 ${stats.forcedPrimary}）`,
  )
  console.log(
    `[build-c] 正例 ${accepted}/${baseline.cases.positive.length}；零声母 ${Object.keys(scheme.zeroInitial).length}/12（eng 缺口保留）；` +
      `index 统计 free=${indexSummary.atoms.total.free} learn=${indexSummary.atoms.total.learn}`,
  )
  if (dryRun) console.log('[build-c] --dry-run：未写文件')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
