/**
 * 方案引擎：把 data/schemes/<id>.json 的 SchemeDef 变成「音节 → 键序列」的判题/展示能力。
 *
 * 判题语义（权威）：
 *   1) 零声母音节优先 → zeroInitial 的整段键序列；
 *   2) 否则命中整音节 overrides → override 的整段键序列（替代组合展开）；
 *   3) 否则 accepted = initials[声母] × finals[韵母] 的笛卡尔积；
 *      当韵母 = u 且声母 ∈ {j,q,x,y} 时额外并入 initials[声母] × finals[v]
 *      （j/q/x/y + ü 的 ü 键容错；主键仍取 U 键，因为全拼写作 u）；
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
import { JQXY, parseAtomId } from './pinyin.ts'

const KEYBOARD_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']

function lowerKeys(values: readonly string[] | undefined): string[] {
  if (!values || values.length === 0) return []
  const out: string[] = []
  for (const value of values) {
    for (const ch of String(value).toLowerCase()) out.push(ch)
  }
  return out
}

/** 整段键序列数组（zeroInitial / overrides）→ 字符数组序列（去重、保序） */
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

export function createSchemeEngine(def: SchemeDef): SchemeEngine {
  const { initials, finals, zeroInitial } = def
  const overrides = def.overrides ?? {}

  function overrideFor(syl: SyllableSpec): string[][] | null {
    const matched = sequencesOf(overrides[`${syl.initial}${syl.final}`])
    return matched.length > 0 ? matched : null
  }

  function combinationOf(initialKeys: readonly string[], finalKeys: readonly string[]): string[][] {
    const out: string[][] = []
    for (const initialKey of initialKeys) {
      for (const finalKey of finalKeys) out.push([initialKey, finalKey])
    }
    return out
  }

  function acceptedSequences(syl: SyllableSpec): string[][] {
    if (isZeroSyllable(syl)) {
      // 零声母优先；数据缺口返回空数组（由上层显式报错），不做组合兜底
      return sequencesOf(zeroInitial[syl.final])
    }
    const override = overrideFor(syl)
    if (override) return override
    const initialKeys = lowerKeys(initials[syl.initial])
    const finalKeys = lowerKeys(finals[syl.final])
    if (initialKeys.length === 0 || finalKeys.length === 0) return []
    const sequences = combinationOf(initialKeys, finalKeys)
    // j/q/x/y + ü：全拼写作 u，主键用 U；方案 ü 键（finals.v）作为容忍多解
    if (JQXY.has(syl.initial) && syl.final === 'u') {
      sequences.push(...combinationOf(initialKeys, lowerKeys(finals['v'])))
    }
    return sequencesOf(sequences.map((sequence) => sequence.join('')))
  }

  function primarySequence(syl: SyllableSpec): string[] {
    const override = overrideFor(syl)
    if (override) return override[0] ?? []
    const accepted = acceptedSequences(syl)
    return accepted[0] ?? []
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

  function isIdentityKey(values: readonly string[] | undefined, atom: string): boolean {
    return values?.length === 1 && String(values[0]).toLowerCase() === atom
  }

  function diff(): SchemeDiff {
    const initialNames = Object.keys(initials)
    const finalNames = Object.keys(finals)
    const zeroNames = Object.keys(zeroInitial)
    const freeInitials = initialNames.filter((name) => isIdentityKey(initials[name], name))
    const freeFinals = finalNames.filter((name) => isIdentityKey(finals[name], name))
    const freeZero = zeroNames.filter((name) =>
      (zeroInitial[name] ?? []).some((sequence) => String(sequence).toLowerCase() === name),
    )
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
