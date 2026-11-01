/**
 * 通用入门课模型：只消费当前 SchemeDef / SchemeEngine / 词表，不写死任何方案名或键位。
 *
 * 口径见 tmp/intro-lesson-design.md：
 * - 声母 / 韵母 / 零声母原子全部由方案数据生成，数组第一条为主键，其余为副键；
 * - 多键 section 仅当存在多键原子时生成；
 * - 推荐码 / 兼容编码 section 仅当方案数据非空时生成；
 * - 不出现「对偶」等某个方案专有术语，不假设任何方案的编码形态。
 */
import { splitPinyin, toToneMarks } from '@shuangpin/core'
import type {
  AtomId,
  SchemeDef,
  SchemeDiff,
  SchemeEngine,
  SyllableFinal,
  SyllableSpec,
  WordEntry,
} from '@shuangpin/core'

export type AtomKind = 'initial' | 'final' | 'zero'

/** 胶囊里的一个键（零声母时为一个完整键序列） */
export interface KeyChipView {
  sequence: string
  primary: boolean
}

/** 一个声母 / 韵母 / 零声母映射（教学原子） */
export interface KeyAtom {
  atomId: AtomId
  kind: AtomKind
  label: string
  keys: KeyChipView[]
  /** 键位与全拼习惯一致（声母 / 韵母 / 零声母各自判定） */
  free: boolean
}

/** 「声母 + 韵母」组合示例 */
export interface ComposeExample {
  syllable: string
  /** 展示用拼音（ü 显示为 ü） */
  display: string
  initial: KeyAtom
  final: KeyAtom
  /** 主键序列，大写 */
  primary: string[]
  /** 全部被接受的序列，大写 */
  accepted: string[]
}

/** 零声母示例：整段序列（作为一个整体展示，不拆成单键） */
export interface ZeroExample {
  syllable: string
  atom: KeyAtom
  primary: string
}

export interface AtomsSectionBase {
  atoms: KeyAtom[]
  /** 需要重新记的映射数 */
  learnCount: number
  /** 与全拼习惯一致的映射数 */
  freeCount: number
  /** 多键映射数 */
  multiCount: number
}

export interface PinyinBasicsSection {
  kind: 'pinyin-basics'
}

export interface InitialsSection extends AtomsSectionBase {
  kind: 'initials'
  example: ComposeExample | null
}

export interface FinalsSection extends AtomsSectionBase {
  kind: 'finals'
  example: ComposeExample | null
}

export interface ZeroInitialsSection extends AtomsSectionBase {
  kind: 'zero-initials'
  example: ZeroExample | null
}

export interface SharedKeyNote {
  key: string
  labels: string[]
}

export interface MultiKeySection {
  kind: 'multi-key'
  atoms: KeyAtom[]
  totalCount: number
  hasRecommended: boolean
  sharedKey: SharedKeyNote | null
}

export type CodeExampleReason = 'recommended-override' | 'recommended-default' | 'compat-extra'

/** 推荐码 / 兼容编码示例（整音节级编码） */
export interface CodeExample {
  syllable: string
  /** 展示用拼音（ü 显示为 ü） */
  display: string
  /** 是否为零声母音节（展示时加「零 」前缀区分同音韵母） */
  zeroInitial: boolean
  /** 标答序列，大写 */
  primary: string
  /** 全部被接受的序列，大写 */
  accepted: string[]
  /** 主声母键 × 主韵母键（默认组合），大写；无法计算时为 null */
  mainKeys: string | null
  /** 推荐码本身（recommended-*）或额外兼容码（compat-extra），大写 */
  extra: string
  reason: CodeExampleReason
}

export interface CodesSection {
  kind: 'codes'
  recommended: CodeExample[]
  compat: CodeExample[]
  hasRecommended: boolean
  hasCompat: boolean
  /** 推荐码中是否存在与「主键组合」不同的音节 */
  hasOverride: boolean
  recommendedTotal: number
  compatTotal: number
}

export interface ToolLegendSection {
  kind: 'tool-legend'
  initialCount: number
  finalCount: number
  zeroCount: number
  hasMulti: boolean
  hasCodes: boolean
}

export type IntroSection =
  | PinyinBasicsSection
  | InitialsSection
  | FinalsSection
  | ZeroInitialsSection
  | MultiKeySection
  | CodesSection
  | ToolLegendSection

export type IntroSectionKind = IntroSection['kind']

export interface IntroLessonModel {
  schemeName: string
  sections: IntroSection[]
}

/** 扫描词表抽取真实音节示例时的最大词数（按词频序，靠前的词更常用） */
const MAX_WORD_SCAN = 3000

// ── 基础工具 ─────────────────────────────────────────────────

/** 方案数据里的键位数组 → 去重、保序、大写序列 */
function normalizedSequences(values: readonly string[] | undefined): string[] {
  if (!values || values.length === 0) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const sequence = Array.from(String(value).toLowerCase()).join('')
    if (!sequence || seen.has(sequence)) continue
    seen.add(sequence)
    out.push(sequence.toUpperCase())
  }
  return out
}

function atomOf(
  kind: AtomKind,
  name: string,
  values: readonly string[] | undefined,
  free: boolean,
): KeyAtom | null {
  const sequences = normalizedSequences(values)
  if (sequences.length === 0) return null
  return {
    atomId: `${kind}:${name}` as AtomId,
    kind,
    // 零声母与同音韵母同名，统一加「零 」前缀区分（与课程 / 键位图显示口径一致）。
    label: kind === 'zero' ? `零 ${name}` : name,
    keys: sequences.map((sequence, index) => ({ sequence, primary: index === 0 })),
    free,
  }
}

function buildAtoms(
  table: Record<string, string[]>,
  kind: AtomKind,
  freeNames: ReadonlySet<string>,
): KeyAtom[] {
  const atoms: KeyAtom[] = []
  for (const name of Object.keys(table)) {
    const atom = atomOf(kind, name, table[name], freeNames.has(name))
    if (atom) atoms.push(atom)
  }
  return atoms
}

function isMulti(atom: KeyAtom): boolean {
  return atom.keys.length > 1
}

function atomCounts(atoms: readonly KeyAtom[]): { learnCount: number; freeCount: number; multiCount: number } {
  return {
    learnCount: atoms.filter((atom) => !atom.free).length,
    freeCount: atoms.filter((atom) => atom.free).length,
    multiCount: atoms.filter(isMulti).length,
  }
}

function specOf(syllable: string): SyllableSpec | null {
  const split = splitPinyin(syllable)
  if (!split) return null
  return { initial: split.initial, final: split.final, zeroInitial: split.zeroInitial }
}

// ── 组合示例 ─────────────────────────────────────────────────

function composeExample(
  engine: SchemeEngine,
  spec: SyllableSpec,
  initial: KeyAtom,
  final: KeyAtom,
): ComposeExample | null {
  const primary = engine.primarySequence(spec)
  if (!primary.length) return null
  const accepted = engine.acceptedSequences(spec).map((sequence) => sequence.join('').toUpperCase())
  const syllable = `${spec.initial}${spec.final}`
  return {
    syllable,
    display: toToneMarks(syllable),
    initial,
    final,
    primary: primary.map((key) => key.toUpperCase()),
    accepted,
  }
}

/**
 * 从词表里挑一个真实音节做示例：
 * - mode = initial：优先声母为多键 / 需要重新记的映射；
 * - mode = final：优先韵母为多键 / 需要重新记的映射。
 * 词表不可用时退回通用且合法的 zh + ai / sh + ai。
 */
function pickComposeExample(
  engine: SchemeEngine,
  words: readonly WordEntry[],
  initialAtoms: readonly KeyAtom[],
  finalAtoms: readonly KeyAtom[],
  mode: 'initial' | 'final',
): ComposeExample | null {
  const initialByName = new Map(initialAtoms.map((atom) => [atom.label, atom]))
  const finalByName = new Map(finalAtoms.map((atom) => [atom.label, atom]))
  const weight = (atom: KeyAtom | undefined): number => {
    if (!atom) return 0
    return (isMulti(atom) ? 6 : 0) + (atom.free ? 0 : 2)
  }

  let best: { score: number; spec: SyllableSpec; initial: KeyAtom; final: KeyAtom } | null = null
  const scanLength = Math.min(words.length, MAX_WORD_SCAN)
  for (let index = 0; index < scanLength; index++) {
    const word = words[index]
    if (!word) continue
    for (const syllable of word.syllables) {
      if (!syllable.initial) continue
      const initial = initialByName.get(syllable.initial)
      const final = finalByName.get(syllable.final)
      if (!initial || !final) continue
      const initialWeight = weight(initial)
      const finalWeight = weight(final)
      const score = mode === 'initial' ? initialWeight * 10 + finalWeight : finalWeight * 10 + initialWeight
      if (!best || score > best.score) {
        best = {
          score,
          spec: { initial: syllable.initial, final: syllable.final, zeroInitial: false },
          initial,
          final,
        }
      }
    }
  }
  if (best) return composeExample(engine, best.spec, best.initial, best.final)

  // 通用兜底：zh + ai 是任何拼音方案都会覆盖的合法音节。
  const fallbackInitial = initialByName.get('zh') ?? initialByName.get('sh') ?? initialAtoms[0]
  const fallbackFinal = finalByName.get('ai') ?? finalAtoms[0]
  if (!fallbackInitial || !fallbackFinal) return null
  const initialName = fallbackInitial.atomId.slice('initial:'.length)
  const finalName = fallbackFinal.atomId.slice('final:'.length)
  return composeExample(
    engine,
    { initial: initialName as SyllableSpec['initial'], final: finalName as SyllableFinal, zeroInitial: false },
    fallbackInitial,
    fallbackFinal,
  )
}

function pickZeroExample(
  engine: SchemeEngine,
  words: readonly WordEntry[],
  zeroAtoms: readonly KeyAtom[],
): ZeroExample | null {
  const zeroByName = new Map(zeroAtoms.map((atom) => [atom.label.replace(/^零 /, ''), atom]))
  const build = (atom: KeyAtom): ZeroExample | null => {
    const name = atom.label.replace(/^零 /, '')
    const spec: SyllableSpec = { initial: '', final: name as SyllableFinal, zeroInitial: true }
    const primary = engine.primarySequence(spec)
    if (!primary.length) return null
    return { syllable: name, atom, primary: primary.join('').toUpperCase() }
  }
  const scanLength = Math.min(words.length, MAX_WORD_SCAN)
  for (let index = 0; index < scanLength; index++) {
    const word = words[index]
    if (!word) continue
    for (const syllable of word.syllables) {
      if (syllable.initial !== '') continue
      const atom = zeroByName.get(syllable.final)
      if (!atom) continue
      const example = build(atom)
      if (example) return example
    }
  }
  const fallback = zeroAtoms[0]
  return fallback ? build(fallback) : null
}

// ── 多键 ─────────────────────────────────────────────────────

/** 找一个「同键对应多个韵母」的通用例子，用于解释键位复用。 */
function findSharedKey(scheme: SchemeDef): SharedKeyNote | null {
  const namesByKey = new Map<string, string[]>()
  for (const [name, values] of Object.entries(scheme.finals)) {
    for (const sequence of normalizedSequences(values)) {
      const list = namesByKey.get(sequence) ?? []
      if (!list.includes(name)) list.push(name)
      namesByKey.set(sequence, list)
    }
  }
  for (const [key, names] of namesByKey) {
    if (names.length < 2) continue
    const hasMultiKeyAtom = names.some((name) => (scheme.finals[name]?.length ?? 0) > 1)
    if (!hasMultiKeyAtom) continue
    return { key, labels: names.slice(0, 3) }
  }
  return null
}

// ── 推荐码 / 兼容编码 ────────────────────────────────────────

/** 主键组合：主声母键 × 主韵母键；零声母取 zeroInitial 第一条序列。 */
function mainComposition(scheme: SchemeDef, spec: SyllableSpec): string | null {
  if (spec.zeroInitial) {
    return normalizedSequences(scheme.zeroInitial[spec.final])[0] ?? null
  }
  const initialKeys = normalizedSequences(scheme.initials[spec.initial])
  const finalKeys = normalizedSequences(scheme.finals[spec.final])
  if (!initialKeys.length || !finalKeys.length) return null
  return `${initialKeys[0]}${finalKeys[0]}`
}

function buildRecommendedExample(
  scheme: SchemeDef,
  engine: SchemeEngine,
  syllable: string,
): CodeExample | null {
  const spec = specOf(syllable)
  if (!spec) return null
  const primary = engine.primarySequence(spec)
  if (!primary.length) return null
  const primaryText = primary.join('').toUpperCase()
  const accepted = engine.acceptedSequences(spec).map((sequence) => sequence.join('').toUpperCase())
  if (!accepted.includes(primaryText)) accepted.unshift(primaryText)
  const mainKeys = mainComposition(scheme, spec)
  return {
    syllable,
    display: toToneMarks(syllable),
    zeroInitial: spec.zeroInitial === true,
    primary: primaryText,
    accepted,
    mainKeys,
    extra: primaryText,
    reason: mainKeys !== null && mainKeys !== primaryText ? 'recommended-override' : 'recommended-default',
  }
}

function buildCompatExample(
  scheme: SchemeDef,
  engine: SchemeEngine,
  syllable: string,
  code: string,
): CodeExample | null {
  const spec = specOf(syllable)
  if (!spec) return null
  const compatKeys = normalizedSequences([code])
  const compatText = compatKeys[0]
  if (!compatText) return null
  const primarySequence = engine.primarySequence(spec)
  if (!primarySequence.length) return null
  const primaryText = primarySequence.join('').toUpperCase()
  const accepted = engine.acceptedSequences(spec).map((sequence) => sequence.join('').toUpperCase())
  // 兼容码必须真的被判题接受，否则说明数据异常，跳过该示例。
  if (!accepted.includes(compatText)) return null
  if (!accepted.includes(primaryText)) accepted.unshift(primaryText)
  return {
    syllable,
    display: toToneMarks(syllable),
    zeroInitial: spec.zeroInitial === true,
    primary: primaryText,
    accepted,
    mainKeys: mainComposition(scheme, spec),
    extra: compatText,
    reason: 'compat-extra',
  }
}

interface PickedCodes {
  recommended: CodeExample[]
  compat: CodeExample[]
  hasOverride: boolean
  recommendedTotal: number
  compatTotal: number
}

function pickCodeExamples(scheme: SchemeDef, engine: SchemeEngine): PickedCodes {
  const recommendedEntries = Object.entries(scheme.recommended ?? {})
  const overrideExamples: CodeExample[] = []
  const defaultExamples: CodeExample[] = []
  for (const [syllable] of recommendedEntries) {
    const example = buildRecommendedExample(scheme, engine, syllable)
    if (!example) continue
    if (example.reason === 'recommended-override') overrideExamples.push(example)
    else defaultExamples.push(example)
  }
  // 推荐码默认示例：优先非零声母音节，避免与「零声母」页的例子重复。
  defaultExamples.sort((left, right) => Number(left.zeroInitial) - Number(right.zeroInitial))
  const recommended = (overrideExamples.length > 0 ? overrideExamples : defaultExamples).slice(0, 2)

  const usedSyllables = new Set(recommended.map((example) => example.syllable))
  // 兼容编码示例：优先「额外接受码确实不同于标答」且未在推荐码示例里出现的音节。
  const compatCandidates: CodeExample[] = []
  for (const [syllable, codes] of Object.entries(scheme.compatCodes ?? {})) {
    const first = codes?.[0]
    if (!first) continue
    const example = buildCompatExample(scheme, engine, syllable, first)
    if (example) compatCandidates.push(example)
  }
  const compatRank = (example: CodeExample): number =>
    (example.extra !== example.primary ? 0 : 2) +
    (example.zeroInitial ? 1 : 0) +
    (usedSyllables.has(example.syllable) ? 4 : 0)
  compatCandidates.sort((left, right) => compatRank(left) - compatRank(right))
  const compat: CodeExample[] = []
  for (const example of compatCandidates) {
    if (compat.some((item) => item.syllable === example.syllable)) continue
    compat.push(example)
    if (compat.length >= 2) break
  }
  return {
    recommended,
    compat,
    hasOverride: overrideExamples.length > 0,
    recommendedTotal: recommendedEntries.length,
    compatTotal: Object.keys(scheme.compatCodes ?? {}).length,
  }
}

// ── 入口 ─────────────────────────────────────────────────────

function diffOf(engine: SchemeEngine, scheme: SchemeDef): SchemeDiff {
  return engine.diff() ?? {
    freeInitials: [],
    learnInitials: Object.keys(scheme.initials),
    freeFinals: [],
    learnFinals: Object.keys(scheme.finals),
    learnZero: Object.keys(scheme.zeroInitial),
    freeZero: [],
  }
}

/**
 * 生成通用入门课模型。
 *
 * @param scheme 当前方案
 * @param engine 当前方案的引擎（由调用方创建，保证判题口径一致）
 * @param words  词表（用于抽取真实音节示例；允许为空）
 */
export function buildIntroLessonModel(
  scheme: SchemeDef,
  engine: SchemeEngine,
  words: readonly WordEntry[] = [],
): IntroLessonModel {
  const diff = diffOf(engine, scheme)
  const initials = buildAtoms(scheme.initials, 'initial', new Set(diff.freeInitials))
  const finals = buildAtoms(scheme.finals, 'final', new Set(diff.freeFinals))
  const zeroInitials = buildAtoms(scheme.zeroInitial, 'zero', new Set(diff.freeZero))

  const multiInitials = initials.filter(isMulti)
  const multiFinals = finals.filter(isMulti)
  const multiZeros = zeroInitials.filter(isMulti)
  const multiTotal = multiInitials.length + multiFinals.length + multiZeros.length

  const codes = pickCodeExamples(scheme, engine)
  const hasRecommended = codes.recommendedTotal > 0
  const hasCompat = codes.compatTotal > 0
  const hasCodes = hasRecommended || hasCompat

  const sections: IntroSection[] = [
    { kind: 'pinyin-basics' },
    {
      kind: 'initials',
      atoms: initials,
      ...atomCounts(initials),
      example: pickComposeExample(engine, words, initials, finals, 'initial'),
    },
    {
      kind: 'finals',
      atoms: finals,
      ...atomCounts(finals),
      example: pickComposeExample(engine, words, initials, finals, 'final'),
    },
    {
      kind: 'zero-initials',
      atoms: zeroInitials,
      ...atomCounts(zeroInitials),
      example: pickZeroExample(engine, words, zeroInitials),
    },
  ]

  if (multiTotal > 0) {
    sections.push({
      kind: 'multi-key',
      atoms: [
        ...multiInitials.slice(0, 2),
        ...multiFinals.slice(0, 2),
        ...multiZeros.slice(0, 2),
      ],
      totalCount: multiTotal,
      hasRecommended,
      sharedKey: findSharedKey(scheme),
    })
  }

  if (hasCodes) {
    sections.push({
      kind: 'codes',
      recommended: codes.recommended,
      compat: codes.compat,
      hasRecommended,
      hasCompat,
      hasOverride: codes.hasOverride,
      recommendedTotal: codes.recommendedTotal,
      compatTotal: codes.compatTotal,
    })
  }

  sections.push({
    kind: 'tool-legend',
    initialCount: initials.length,
    finalCount: finals.length,
    zeroCount: zeroInitials.length,
    hasMulti: multiTotal > 0,
    hasCodes,
  })

  return { schemeName: scheme.name, sections }
}
