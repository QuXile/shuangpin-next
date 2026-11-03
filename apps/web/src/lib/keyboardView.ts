/**
 * 键位图 / 键帽展示的纯函数（从 SchemeKeycaps、KeyboardMap 抽出，可单测）。
 *
 * - 「文本 → 双拼键帽」：汉字按固定读音表取声母/韵母主键，字母原样；
 * - 分行规则：汉字两键不拆、连续英文尽量不拆、每行 ≤5；
 * - 键位图视图模型：每键的声母/韵母映射、focus 强调、隐藏/全拼沿用过滤、零声母与兼容编码映射行。
 *
 * 所有函数都不依赖 Vue / DOM；随机散落位置通过 injectable random 保持可测。
 */
import {
  atomId,
  parseAtomId,
  splitSyllable,
  type AtomId,
  type LetterKey,
  type SchemeEngine,
} from '@shuangpin/core'

// ── 文本 → 键帽 ──────────────────────────────────────────────

/** 键帽文本固定读音表；标题里出现的拉丁字母原样展示。 */
const CHAR_PINYIN: Readonly<Record<string, readonly [string, string]>> = {
  小: ['x', 'iao'],
  鹤: ['h', 'e'],
  双: ['sh', 'uang'],
  拼: ['p', 'in'],
  自: ['z', 'i'],
  然: ['r', 'an'],
  码: ['m', 'a'],
  微: ['w', 'ei'],
  软: ['r', 'uan'],
  搜: ['s', 'ou'],
  狗: ['g', 'ou'],
  智: ['zh', 'i'],
  能: ['n', 'eng'],
  训: ['x', 'un'],
  练: ['l', 'ian'],
  场: ['ch', 'ang'],
  习: ['x', 'i'],
  音: ['y', 'in'],
  加: ['j', 'ia'],
  紫: ['z', 'i'],
  光: ['g', 'uang'],
  蓝: ['l', 'an'],
  天: ['t', 'ian'],
  白: ['b', 'ai'],
  云: ['y', 'un'],
  月: ['y', 'ue'],
  国: ['g', 'uo'],
  标: ['b', 'iao'],
  开: ['k', 'ai'],
  源: ['y', 'uan'],
  鹳: ['g', 'uan'],
  浪: ['l', 'ang'],
  韵: ['y', 'un'],
  块: ['k', 'uai'],
  星: ['x', 'ing'],
  空: ['k', 'ong'],
  大: ['d', 'a'],
  牛: ['n', 'iu'],
  键: ['j', 'ian'],
  道: ['d', 'ao'],
}

const KEYCAP_MAX = 10
const KEYCAPS_PER_ROW = 5
const FALLBACK_CAPS = ['E', 'R', 'R', 'O', 'R'] as const

interface CapSpec {
  key: string
  /** 同一个汉字的声母键 + 韵母键：不能在中间断开。 */
  chineseGroup?: number
  /** 连续英文属于同一 run：尽量不在中间断开。 */
  latinRun?: number
  error?: boolean
}

/** 文本 → 键帽序列（最多 10 个；汉字组整组保留；无法生成时返回 ERROR 兜底）。 */
export function keycapsOf(text: string, engine: SchemeEngine): CapSpec[] {
  const groups: CapSpec[][] = []
  let chineseGroup = 0
  let latinRun = 0
  let inLatinRun = false
  for (const char of text) {
    if (/^[A-Za-z]$/.test(char)) {
      if (!inLatinRun) latinRun += 1
      inLatinRun = true
      groups.push([{ key: char.toUpperCase(), latinRun }])
      continue
    }
    inLatinRun = false
    const pinyin = CHAR_PINYIN[char]
    if (!pinyin) continue
    const [initial, final] = pinyin
    const group: CapSpec[] = []
    for (const id of [atomId('initial', initial), atomId('final', final)]) {
      const key = engine.keysForAtom(id)[0]
      if (key) group.push({ key: key.toUpperCase(), chineseGroup })
    }
    if (group.length > 0) {
      chineseGroup += 1
      groups.push(group)
    }
  }

  // 最多 10 个键帽；汉字组只能整组保留，不能为了凑满 10 而劈开。
  const out: CapSpec[] = []
  for (const group of groups) {
    if (out.length + group.length > KEYCAP_MAX) break
    out.push(...group)
  }
  return out.length > 0 ? out : FALLBACK_CAPS.map((key) => ({ key, error: true }))
}

/** 键帽是否处于 ERROR 兜底态（整组都是 error）。 */
export function isFallbackCaps(specs: readonly CapSpec[]): boolean {
  return specs.length > 0 && specs.every((spec) => spec.error === true)
}

interface KeycapRow {
  offset: number
  caps: string[]
}

/**
 * 键帽分行（最多两行，每行 ≤5）：
 * 1. 汉字两键内部绝不断；连续英文内部尽量不断；
 * 2. 1–5 个键帽也优先分行，但只在存在「不破坏约束」的断点时分行；
 * 3. 6–10 个时优先选不破坏约束的断点，没有则从中间兜底。
 */
export function splitKeycapLines(
  specs: readonly CapSpec[],
  options: { singleRow?: boolean } = {},
): KeycapRow[] {
  const letters = specs.map((spec) => spec.key)
  if (letters.length === 0) return []
  if (options.singleRow || isFallbackCaps(specs) || letters.length <= 1) {
    return [{ offset: 0, caps: letters }]
  }

  if (letters.length <= KEYCAPS_PER_ROW) {
    const preferredBreak = chooseBreakIndex(specs, true)
    if (preferredBreak === null) return [{ offset: 0, caps: letters }]
    return [
      { offset: 0, caps: letters.slice(0, preferredBreak) },
      { offset: preferredBreak, caps: letters.slice(preferredBreak) },
    ]
  }

  const breakIndex = chooseBreakIndex(specs, false) ?? Math.floor(letters.length / 2)
  return [
    { offset: 0, caps: letters.slice(0, breakIndex) },
    { offset: breakIndex, caps: letters.slice(breakIndex) },
  ]
}

function chooseBreakIndex(specs: readonly CapSpec[], requirePreferred: boolean): number | null {
  const n = specs.length
  const candidates: Array<{ index: number; soft: boolean; balance: number }> = []
  for (let i = 1; i < n; i += 1) {
    if (i > KEYCAPS_PER_ROW || n - i > KEYCAPS_PER_ROW) continue
    const left = specs[i - 1]
    const right = specs[i]
    if (left?.chineseGroup !== undefined && left.chineseGroup === right?.chineseGroup) continue
    const soft = left?.latinRun !== undefined && left.latinRun === right?.latinRun
    candidates.push({ index: i, soft, balance: Math.abs(i - (n - i)) })
  }
  const preferred = candidates.filter((item) => !item.soft)
  if (preferred.length === 0 && requirePreferred) return null
  const pool = preferred.length > 0 ? preferred : candidates
  pool.sort((a, b) => a.balance - b.balance || a.index - b.index)
  return pool[0]?.index ?? null
}

interface CapLayout {
  /** 基础散落 transform（测试与无动效时的静态样式） */
  transform: string
  zIndex: string
  dx: number
  dy: number
  rot: number
  /** 指针跟随强度（越大移动越明显） */
  depth: number
}

/** 每次渲染重新随机散落，带轻微旋转和层级（同一行右侧压左侧、下行压上行）。 */
export function scatterLayout(
  caps: readonly string[],
  random: () => number = Math.random,
): CapLayout[] {
  return caps.map((_, index) => {
    const dx = (random() * 2 - 1) * 5
    const dy = (random() * 2 - 1) * 7
    const rot = (random() * 2 - 1) * 5
    return {
      transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(${rot.toFixed(1)}deg)`,
      zIndex: String(index + 1),
      dx,
      dy,
      rot,
      depth: 0.35 + random() * 0.75,
    }
  })
}

// ── 键位图视图模型 ──────────────────────────────────────────

interface KeyboardMapInput {
  rows: readonly LetterKey[][]
  highlightAtomIds?: readonly AtomId[]
  conceal?: boolean
  specialInitials?: readonly string[]
  hiddenAtomIds?: readonly AtomId[]
  zeroInitials?: Readonly<Record<string, readonly string[]>>
  compatCodes?: Readonly<Record<string, readonly string[]>>
  freeAtomIds?: readonly AtomId[]
}

interface MappingPartView {
  text: string
  atomId: AtomId
  emphasized: boolean
}

interface KeyView {
  letter: string
  title: string
  initialParts: MappingPartView[]
  finalParts: MappingPartView[]
  focusedKind: 'initial' | 'final' | null
  hasBoth: boolean
}

export interface MappingItemView {
  label: string
  /** 每个编码拆成单字符，统一渲染成按键小格 */
  codes: string[][]
  title: string
  emphasized: boolean
  /**
   * 练习场：点击该映射时上抛的切换描述。
   * 只有声母 / 韵母 / 零声母这类可选的原子才有；兼容编码不可独立选择，
   * 它的强调状态完全由构成该音节的声母、韵母是否在范围内决定。
   */
  toggle?: MappingTogglePayload
}

/** 练习场点击映射的语义：切换该原子的「出现范围」选择。 */
export interface MappingTogglePayload {
  kind: 'atom'
  atomId: AtomId
}

interface KeyboardMapView {
  showMappings: boolean
  keyRows: KeyView[][]
  zeroItems: MappingItemView[]
  compatItems: MappingItemView[]
}

/** 键位图纯视图模型：映射过滤、focus 强调、零声母/兼容编码映射行。 */
export function keyboardMapViewOf(input: KeyboardMapInput): KeyboardMapView {
  const showMappings = input.conceal !== true
  const highlightSet = new Set(input.highlightAtomIds ?? [])
  const specialSet = new Set(input.specialInitials ?? [])
  const hiddenAtomSet = new Set(input.hiddenAtomIds ?? [])
  const freeAtomSet = new Set(input.freeAtomIds ?? [])
  const focusInitials = new Set<string>()
  const focusFinals = new Set<string>()
  const focusZeros = new Set<string>()
  for (const atom of input.highlightAtomIds ?? []) {
    const ref = parseAtomId(atom)
    if (!ref) continue
    if (ref.type === 'initial') focusInitials.add(ref.key)
    else if (ref.type === 'final') focusFinals.add(ref.key)
    else focusZeros.add(ref.key)
  }

  const keyRows = input.rows.map((row) =>
    row.map((key): KeyView => {
      const initialParts: MappingPartView[] = []
      const finalParts: MappingPartView[] = []
      for (const id of key.atomIds) {
        if (hiddenAtomSet.has(id) || freeAtomSet.has(id)) continue
        const ref = parseAtomId(id)
        if (!ref) continue
        const part: MappingPartView = {
          text: ref.key,
          atomId: id,
          emphasized: highlightSet.has(id),
        }
        if (ref.type === 'initial' && specialSet.has(ref.key)) initialParts.push(part)
        else if (ref.type === 'final') finalParts.push(part)
      }
      const focusedParts = [...initialParts, ...finalParts].filter((part) => part.emphasized)
      const focusedKind: KeyView['focusedKind'] =
        focusedParts.some((part) => initialParts.includes(part))
          ? 'initial'
          : focusedParts.length > 0
            ? 'final'
            : null
      const allParts = [...initialParts, ...finalParts]
      const title = !showMappings
        ? `按键 ${key.letter.toUpperCase()}`
        : allParts.length > 0
          ? `${key.letter.toUpperCase()}：${allParts.map((part) => part.text).join(' / ')}`
          : `按键 ${key.letter.toUpperCase()}`
      return {
        letter: key.letter,
        title,
        initialParts,
        finalParts,
        focusedKind,
        hasBoth: initialParts.length > 0 && finalParts.length > 0,
      }
    }),
  )

  const zeroItems: MappingItemView[] = showMappings
    ? Object.entries(input.zeroInitials ?? {})
        .map(([final, keys]) => {
          const atom = atomId('zero', final)
          return {
            label: final,
            codes: keys.map((key) => [key.toUpperCase()]),
            title: `${final} → ${keys.join(' / ')}`,
            emphasized: highlightSet.has(atom),
            toggle: { kind: 'atom' as const, atomId: atom },
            atom,
          }
        })
        .filter((entry) => !hiddenAtomSet.has(entry.atom) && !freeAtomSet.has(entry.atom))
        .map(({ atom: _atom, ...item }) => item)
    : []

  const compatItems: MappingItemView[] = showMappings
    ? Object.entries(input.compatCodes ?? {})
        .map(([syllable, codes]) => {
          const parsed = splitSyllable(syllable)
          // 兼容编码强调：音节能真正进入题目（声母与韵母都在范围内）才亮。
          const emphasized = Boolean(
            parsed &&
              (parsed.initial === ''
                ? focusZeros.has(parsed.final)
                : focusInitials.has(parsed.initial) && focusFinals.has(parsed.final)),
          )
          return {
            label: syllable,
            codes: codes.map((code) => [code.toUpperCase()]),
            title: `${syllable} → ${codes.map((code) => code.toUpperCase()).join(' / ')}`,
            emphasized,
          }
        })
        .filter((entry) => entry.codes.length > 0)
    : []

  return { showMappings, keyRows, zeroItems, compatItems }
}
