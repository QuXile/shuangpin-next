/**
 * 方案引擎：把 data/schemes/<id>.json 的 SchemeDef 变成「音节 → 键序列」的判题/展示能力。
 *
 * 判题语义（权威）：
 *   1) 零声母音节优先 → zeroInitial 的整段键序列；
 *   2) 否则 accepted = 推荐码 ∪ 兼容编码 ∪（initials[声母] × finals[韵母] 的笛卡尔积）；
 *      兼容编码命中即成功，未命中继续回退组合；
 *   3) 组合规则：initials[声母] × finals[韵母]；
 *   4) 输入与任一 accepted 序列完全相等即正确。
 *
 * 只做正向判题（音节 → 键序列），不做键序列 → 音节反查（大量同码方案）。
 */
import type {
  AtomId,
  AtomType,
  Final,
  LetterKey,
  SchemeDef,
  SchemeDiff,
  SchemeEngine,
  SyllableSpec,
} from './types.ts'
import { parseAtomId } from './pinyin.ts'

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

export interface FreeAtomSets {
  freeInitials: string[]
  freeFinals: string[]
  freeZero: string[]
}

function isIdentityKey(values: readonly string[] | undefined, atom: string): boolean {
  return values?.length === 1 && String(values[0]).toLowerCase() === atom
}

/** 与全拼拼写完全一致的键位（课程、入门课、训练场共用唯一口径）。 */
export function freeAtomsOf(def: SchemeDef): FreeAtomSets {
  const freeInitials = Object.keys(def.initials).filter((name) =>
    isIdentityKey(def.initials[name as keyof typeof def.initials], name),
  )
  const freeFinals = Object.keys(def.finals).filter((name) =>
    isIdentityKey(def.finals[name as keyof typeof def.finals], name),
  )
  const freeZero = Object.keys(def.zeroInitial).filter((name) =>
    (def.zeroInitial[name as keyof typeof def.zeroInitial] ?? []).some(
      (sequence) => String(sequence).toLowerCase() === name,
    ),
  )
  return { freeInitials, freeFinals, freeZero }
}

export function createSchemeEngine(def: SchemeDef): SchemeEngine {
  const { initials, finals, zeroInitial } = def

  function combinationOf(initialKeys: readonly string[], finalKeys: readonly string[]): string[][] {
    const out: string[][] = []
    for (const initialKey of initialKeys) {
      for (const finalKey of finalKeys) out.push([initialKey, finalKey])
    }
    return out
  }

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

  function compositionOf(syl: SyllableSpec): string[][] {
    if (isZeroSyllable(syl)) return sequencesOf(zeroInitial[syl.final])
    const initialKeys = lowerKeys(initials[syl.initial])
    const finalKeys = lowerKeys(finals[syl.final])
    if (initialKeys.length === 0 || finalKeys.length === 0) return []
    return sequencesOf(combinationOf(initialKeys, finalKeys).map((sequence) => sequence.join('')))
  }

  function acceptedSequences(syl: SyllableSpec): string[][] {
    // 顺序：推荐码 → 额外特殊码 → 基础组合；去重保序。
    const merged = [
      ...recommendedOf(syl),
      ...compatOf(syl),
      ...compositionOf(syl),
    ]
    return sequencesOf(merged.map((sequence) => sequence.join('')))
  }

  function primarySequence(syl: SyllableSpec): string[] {
    const recommended = recommendedOf(syl)
    if (recommended[0]) return recommended[0]
    const compat = compatOf(syl)
    if (compat[0]) return compat[0]
    const composition = compositionOf(syl)
    return composition[0] ?? []
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
      const sequence = acceptedSequences({
        initial: '',
        final: ref.key as Final,
        zeroInitial: true,
      })[0]
      return sequence ? [sequence.join('')] : []
    }
    return [] // 未知知识点
  }

  function diff(): SchemeDiff {
    const initialNames = Object.keys(initials)
    const finalNames = Object.keys(finals)
    const zeroNames = Object.keys(zeroInitial)
    const { freeInitials, freeFinals, freeZero } = freeAtomsOf(def)
    const freeInitialSet = new Set(freeInitials)
    const freeFinalSet = new Set(freeFinals)
    const freeZeroSet = new Set(freeZero)
    return {
      freeInitials,
      learnInitials: initialNames.filter((name) => !freeInitialSet.has(name)),
      freeFinals,
      learnFinals: finalNames.filter((name) => !freeFinalSet.has(name)),
      learnZero: zeroNames.filter((name) => !freeZeroSet.has(name)),
      freeZero,
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
      for (const key of lowerKeys(keys)) add(key, `initial:${initial}` as AtomId)
    }
    for (const [final, keys] of Object.entries(finals)) {
      for (const key of lowerKeys(keys)) add(key, `final:${final}` as AtomId)
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
    keyMap,
  }
}

/** 便于外部按类型取原子集合：'initial' | 'final' | 'zero' | 'rule' */
export function atomsOfType(atomIds: readonly AtomId[], type: AtomType): AtomId[] {
  return atomIds.filter((atom) => atom.startsWith(`${type}:`))
}
