/**
 * 方案引擎：把 data/schemes/<id>/scheme.json 的 SchemeDef 变成「音节 → 键序列」的判题/展示能力。
 *
 * 判题语义（权威）：
 *   1) 零声母音节优先 → zeroInitial 的整段键序列；
 *   2) 否则 accepted = 推荐码 ∪ 兼容编码 ∪（initials[声母] × finals[韵母] 的笛卡尔积）；
 *      兼容编码命中即成功，未命中继续回退组合；
 *   3) 组合规则：initials[声母] × finals[韵母]；
 *   4) 输入与任一 accepted 序列完全相等即正确。
 *
 * 只做正向判题（音节 → 键序列），不做键序列 → 音节反查（大量同码方案）。
 * 推荐码 / 兼容码的数据分析（analyzeSchemeCodes）也在这里，作为 scripts 与 web 共用的唯一口径。
 */
import type {
  AtomId,
  Final,
  FreeAtomSets,
  LetterKey,
  SchemeCodeAnalysis,
  SchemeCodeEntry,
  SchemeDef,
  SchemeDiff,
  SchemeEngine,
  SyllableSpec,
} from './types.ts'
import { atomId, parseAtomId, splitPinyin } from './pinyin.ts'

const KEYBOARD_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']

function lowerKeys(values: readonly string[] | undefined): string[] {
  if (!values || values.length === 0) return []
  const out: string[] = []
  for (const value of values) {
    for (const ch of String(value).toLowerCase()) out.push(ch)
  }
  return out
}

/** 整段键序列数组（zeroInitial / recommended / compatCodes）→ 字符数组序列（去重、保序） */
function sequencesOf(values: readonly string[] | undefined): string[][] {
  if (!values || values.length === 0) return []
  const seen = new Set<string>()
  const out: string[][] = []
  for (const value of values) {
    const sequence = Array.from(String(value).toLowerCase())
    const signature = sequence.join('')
    if (sequence.length === 0 || seen.has(signature)) continue
    seen.add(signature)
    out.push(sequence)
  }
  return out
}

function isZeroSyllable(syl: SyllableSpec): boolean {
  return syl.zeroInitial === true || syl.initial === ''
}

/** 输入归一化：字符串按字符拆分，数组逐键展开，统一小写 */
function normalizeInput(input: string[] | string): string[] {
  const source = typeof input === 'string' ? Array.from(input) : input
  const out: string[] = []
  for (const key of source) {
    for (const ch of String(key).toLowerCase().trim()) out.push(ch)
  }
  return out
}

function isIdentityKey(values: readonly string[] | undefined, atom: string): boolean {
  return values?.length === 1 && String(values[0]).toLowerCase() === atom
}

/**
 * 与全拼拼写完全一致的键位（课程、入门课、训练场共用唯一口径）。
 *
 * contract-only：当前生成器 / 课程 / 门课都用 `engine.freeSets()`，本导出保留为
 * 「自由与全拼一致」的公开契约（W2 scripts 也可直接消费）。
 */
export function freeAtomsOf(def: SchemeDef): FreeAtomSets {
  return {
    initials: new Set(
      Object.keys(def.initials).filter((name) => isIdentityKey(def.initials[name], name)),
    ),
    finals: new Set(Object.keys(def.finals).filter((name) => isIdentityKey(def.finals[name], name))),
    zero: new Set(
      Object.keys(def.zeroInitial).filter((name) =>
        (def.zeroInitial[name] ?? []).some((sequence) => String(sequence).toLowerCase() === name),
      ),
    ),
  }
}

/** 该知识点是否与全拼拼写一致（free）：initial/final/zero 三类统一判定 */
export function isFreeAtom(engine: SchemeEngine, atom: AtomId): boolean {
  const ref = parseAtomId(atom)
  if (!ref) return false
  const free = engine.freeSets()
  if (ref.type === 'initial') return free.initials.has(ref.key)
  if (ref.type === 'final') return free.finals.has(ref.key)
  return free.zero.has(ref.key)
}

/** 方案全部 free 知识点（规范顺序：声母 → 韵母 → 零声母；键位图/展示层共用） */
export function freeAtomIdsOf(engine: SchemeEngine): AtomId[] {
  const free = engine.freeSets()
  return [
    ...[...free.initials].map((key) => atomId('initial', key)),
    ...[...free.finals].map((key) => atomId('final', key)),
    ...[...free.zero].map((key) => atomId('zero', key)),
  ]
}

/** 声母键 × 韵母键的笛卡尔积；零声母返回 zeroInitial 的整段序列（去重、保序） */
function compositionOf(def: SchemeDef, syl: SyllableSpec): string[][] {
  if (isZeroSyllable(syl)) return sequencesOf(def.zeroInitial[syl.final])
  const initialKeys = lowerKeys(def.initials[syl.initial])
  const finalKeys = lowerKeys(def.finals[syl.final])
  if (initialKeys.length === 0 || finalKeys.length === 0) return []
  const combined: string[] = []
  for (const initialKey of initialKeys) {
    for (const finalKey of finalKeys) combined.push(`${initialKey}${finalKey}`)
  }
  return sequencesOf(combined)
}

/** 方案数据里能否完整描述该音节（声母+韵母或零声母整段序列） */
function canResolve(def: SchemeDef, syl: SyllableSpec): boolean {
  if (isZeroSyllable(syl)) return (def.zeroInitial[syl.final] ?? []).length > 0
  return (
    (def.initials[syl.initial] ?? []).length > 0 && (def.finals[syl.final] ?? []).length > 0
  )
}

export function createSchemeEngine(def: SchemeDef): SchemeEngine {
  const { initials, finals, zeroInitial } = def
  const freeSets = freeAtomsOf(def)

  function syllableKey(syl: SyllableSpec): string {
    return isZeroSyllable(syl) ? syl.final : `${syl.initial}${syl.final}`
  }

  function recommendedOf(syl: SyllableSpec): string[][] {
    const recommended = def.recommended?.[syllableKey(syl)]
    return recommended ? sequencesOf([recommended]) : []
  }

  function compatOf(syl: SyllableSpec): string[][] {
    return sequencesOf(def.compatCodes?.[syllableKey(syl)])
  }

  function compositionSequence(syl: SyllableSpec): string[][] {
    return compositionOf(def, syl)
  }

  function acceptedSequences(syl: SyllableSpec): string[][] {
    // 顺序：推荐码 → 额外特殊码 → 基础组合；去重保序。
    const merged = [...recommendedOf(syl), ...compatOf(syl), ...compositionSequence(syl)]
    return sequencesOf(merged.map((sequence) => sequence.join('')))
  }

  function primarySequence(syl: SyllableSpec): string[] {
    const recommended = recommendedOf(syl)
    if (recommended[0]) return recommended[0]
    const compat = compatOf(syl)
    if (compat[0]) return compat[0]
    return compositionSequence(syl)[0] ?? []
  }

  function judge(input: string[] | string, syl: SyllableSpec): boolean {
    const typed = normalizeInput(input).join('')
    return acceptedSequences(syl).some((sequence) => sequence.join('') === typed)
  }

  function keysForAtom(atom: AtomId): string[] {
    const ref = parseAtomId(atom)
    if (!ref) return []
    if (ref.type === 'initial' || ref.type === 'final') {
      const table: Record<string, string[]> = ref.type === 'initial' ? initials : finals
      return lowerKeys(table[ref.key])
    }
    if (ref.type === 'zero') {
      // 与课程数据 atomMeta 口径一致：零声母主键为「整段序列」单元素
      const sequence = primarySequence({
        initial: '',
        final: ref.key as Final,
        zeroInitial: true,
      })
      return sequence.length > 0 ? [sequence.join('')] : []
    }
    return [] // 未知知识点
  }

  function diff(): SchemeDiff {
    return {
      freeInitials: [...freeSets.initials],
      learnInitials: Object.keys(initials).filter((name) => !freeSets.initials.has(name)),
      freeFinals: [...freeSets.finals],
      learnFinals: Object.keys(finals).filter((name) => !freeSets.finals.has(name)),
      learnZero: Object.keys(zeroInitial).filter((name) => !freeSets.zero.has(name)),
      freeZero: [...freeSets.zero],
    }
  }

  function keyMap(): LetterKey[][] {
    const atomIdsByKey = new Map<string, AtomId[]>()
    const add = (key: string, atom: AtomId) => {
      if (!/^[a-z;]$/.test(key)) return
      const list = atomIdsByKey.get(key) ?? []
      if (!list.includes(atom)) list.push(atom)
      atomIdsByKey.set(key, list)
    }
    for (const [initial, keys] of Object.entries(initials)) {
      for (const key of lowerKeys(keys)) add(key, atomId('initial', initial))
    }
    for (const [final, keys] of Object.entries(finals)) {
      for (const key of lowerKeys(keys)) add(key, atomId('final', final))
    }
    const rows = KEYBOARD_ROWS.map((row) => row.split(''))
    // 部分方案把韵母放在分号键（如微软/搜狗 ing=';'），仅在使用时补进主行
    if (atomIdsByKey.has(';')) rows[1]?.push(';')
    return rows.map((row) =>
      row.map((letter) => ({ letter, atomIds: atomIdsByKey.get(letter) ?? [] })),
    )
  }

  return {
    def,
    acceptedSequences,
    primarySequence,
    judge,
    keysForAtom,
    diff,
    freeSets: () => freeSets,
    compositionSequence,
    keyMap,
  }
}

/** 解析方案数据中的完整音节（recommended/compatCodes 的 key） */
function resolveSyllable(
  def: SchemeDef,
  syllable: string,
): { spec: SyllableSpec; initial: SyllableSpec['initial']; final: SyllableSpec['final'] } | null {
  const split = splitPinyin(syllable)
  if (!split) return null
  const spec: SyllableSpec = {
    initial: split.initial,
    final: split.final,
    zeroInitial: split.zeroInitial,
  }
  if (!canResolve(def, spec)) return null
  return { spec, initial: split.initial, final: split.final }
}

/**
 * 推荐码 / 兼容码分析（generate 与 web 入门课共用唯一口径）：
 * - composition：首个声母键 + 首个韵母键（零声母为第一条整段序列）；
 * - recommended：仅当数据存在时给出；recommendedOverride 表示它与组合不同；
 * - compat：额外接受码（排除组合与推荐码、去重保序）。
 * 声母/韵母/free 的分组策略不在这里做（属于课程模板/展示策略）。
 */
export function analyzeSchemeCodes(def: SchemeDef): SchemeCodeAnalysis {
  const engine = createSchemeEngine(def)
  const syllables = [
    ...new Set([...Object.keys(def.recommended ?? {}), ...Object.keys(def.compatCodes ?? {})]),
  ].sort()
  const entries: SchemeCodeEntry[] = []
  const unresolved: string[] = []
  let recommendedOverrides = 0
  let compatCount = 0

  for (const syllable of syllables) {
    const resolved = resolveSyllable(def, syllable)
    if (!resolved) {
      unresolved.push(syllable)
      continue
    }
    const { spec } = resolved
    const composition = engine.compositionSequence(spec)[0]?.join('') ?? ''
    const recommendedRaw = def.recommended?.[syllable]
    const recommended = typeof recommendedRaw === 'string' ? recommendedRaw.toLowerCase() : null
    const recommendedOverride = recommended !== null && recommended !== composition
    const compatValues = (def.compatCodes?.[syllable] ?? [])
      .map((value) => String(value).toLowerCase())
      .filter((value) => value.length > 0)
    const compat = [
      ...new Set(
        compatValues.filter((value) => value !== composition && value !== recommended),
      ),
    ]
    if (recommendedOverride) recommendedOverrides += 1
    if (compat.length > 0) compatCount += 1
    const atoms: AtomId[] = spec.zeroInitial
      ? [atomId('zero', spec.final)]
      : [atomId('initial', spec.initial), atomId('final', spec.final)]
    entries.push({
      syllable,
      initial: resolved.initial,
      final: resolved.final,
      zeroInitial: spec.zeroInitial === true,
      atoms,
      composition,
      recommended,
      recommendedOverride,
      compat,
      primary: engine.primarySequence(spec).join(''),
      accepted: engine.acceptedSequences(spec).map((sequence) => sequence.join('')),
    })
  }

  return { entries, unresolved, stats: { recommendedOverrides, compat: compatCount } }
}
