/**
 * 拼音基础：规范声母/韵母常量、音节拆分（y/w 作声母、ü→v、jqxy 后 u 系口径）、
 * 声调符号转换与知识点 ID 解析。
 *
 * 纯 TS，无框架/DOM/Node 依赖；运行期只消费预计算数据，不引第三方拼音库。
 * 「哪些键位是 free（与全拼一致）」属于方案属性，由 SchemeEngine.diff() 推导，本文件不硬编码。
 */
import type {
  AtomId,
  AtomRef,
  AtomType,
  Final,
  Initial,
  SplitResult,
  Syllable,
  SyllableFinal,
  Tone,
} from './types.ts'

// ── 常量 ──────────────────────────────────────────────────────

/** 23 个规范声母（不含空声母；zh/ch/sh 与单字母声母并列） */
export const INITIALS: readonly Initial[] = [
  'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h',
  'j', 'q', 'x', 'zh', 'ch', 'sh', 'r', 'z', 'c', 's', 'y', 'w',
]

/** 33 个规范韵母（ü 一律记 v；ue/ve 并存） */
export const FINALS: readonly Final[] = [
  'a', 'o', 'e', 'i', 'u', 'v',
  'ai', 'ei', 'ui', 'ao', 'ou', 'iu', 'ie', 've',
  'an', 'en', 'in', 'un',
  'ang', 'eng', 'ing', 'ong',
  'ia', 'iao', 'ian', 'iang', 'iong',
  'ua', 'uo', 'uai', 'uan', 'uang', 'ue',
]

/** 12 个零声母音节（独立知识点 zero:*；er 不属于 33 韵母） */
export const ZERO_INITIALS: readonly SyllableFinal[] = [
  'a', 'ai', 'an', 'ang', 'ao', 'e', 'ei', 'en', 'eng', 'er', 'o', 'ou',
]

/** j/q/x/y：与 ü 相拼时全拼写作 u，因此主键取 U 键 */
export const JQXY: ReadonlySet<string> = new Set(['j', 'q', 'x', 'y'])

const INITIAL_SET: ReadonlySet<string> = new Set(INITIALS)
const FINAL_SET: ReadonlySet<string> = new Set(FINALS)
const ZERO_SET: ReadonlySet<string> = new Set(ZERO_INITIALS)

/** 最长匹配优先的声母顺序（zh/ch/sh 必须先于 z/c/s） */
const LONGEST_INITIALS: readonly string[] = ['zh', 'ch', 'sh']

// ── 声调符号 ──────────────────────────────────────────────────

const TONE_MARK_TO_BASE: Readonly<Record<string, string>> = {
  'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a',
  'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o',
  'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e',
  'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i',
  'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u',
  'ǖ': 'v', 'ǘ': 'v', 'ǚ': 'v', 'ǜ': 'v',
}

const TONE_MARK_TO_LEVEL: Readonly<Record<string, Tone>> = {
  'ā': 1, 'á': 2, 'ǎ': 3, 'à': 4,
  'ō': 1, 'ó': 2, 'ǒ': 3, 'ò': 4,
  'ē': 1, 'é': 2, 'ě': 3, 'è': 4,
  'ī': 1, 'í': 2, 'ǐ': 3, 'ì': 4,
  'ū': 1, 'ú': 2, 'ǔ': 3, 'ù': 4,
  'ǖ': 1, 'ǘ': 2, 'ǚ': 3, 'ǜ': 4,
}

const VOWEL_TONE_MARKS: Readonly<Record<string, readonly string[]>> = {
  a: ['ā', 'á', 'ǎ', 'à'],
  o: ['ō', 'ó', 'ǒ', 'ò'],
  e: ['ē', 'é', 'ě', 'è'],
  i: ['ī', 'í', 'ǐ', 'ì'],
  u: ['ū', 'ú', 'ǔ', 'ù'],
  'ü': ['ǖ', 'ǘ', 'ǚ', 'ǜ'],
}

// ── 规范化与拆分 ──────────────────────────────────────────────

/**
 * 规范化拼音：转小写、去声调符号/数字、ü→v（含 u: 写法）。
 * 例：'Chóng' → 'chong'；'nǚ'/'nv3'/'nü' → 'nv'；'lüè' → 'lve'。
 */
export function normalizePinyin(input: string): string {
  if (!input) return ''
  const lower = input.trim().toLowerCase().replace(/u:/g, 'ü')
  let out = ''
  for (const ch of lower) {
    if (ch === 'ü') {
      out += 'v'
      continue
    }
    const base = TONE_MARK_TO_BASE[ch]
    if (base) {
      out += base
      continue
    }
    if (ch >= '1' && ch <= '5') continue // 去声调数字
    out += ch
  }
  return out
}

/** 从带调拼音中识别声调（声调符号优先，其次末尾数字）；无调返回 undefined */
export function detectTone(input: string): Tone | undefined {
  const text = input.trim().toLowerCase()
  for (const ch of text) {
    const tone = TONE_MARK_TO_LEVEL[ch]
    if (tone) return tone
  }
  const matched = /([1-5])\s*$/.exec(text)
  return matched?.[1] ? (Number(matched[1]) as Tone) : undefined
}

function finalizeSplit(initial: Initial, finalText: string): SplitResult {
  if (!FINAL_SET.has(finalText)) return null
  // er 只作为零声母音节出现（非零声母拼写如 "ter" 非法）
  if (finalText === 'er') return null
  const final = finalText as Final
  // n/l 后 ü 记 v/ve；其余声母不允许 v 系
  if ((final === 'v' || final === 've') && initial !== 'n' && initial !== 'l') return null
  return { initial, final, zeroInitial: false }
}

/**
 * 规范拆分无声调拼音（内部会先 normalizePinyin）。
 * 规则：零声母 12 音节优先；zh/ch/sh 最长匹配；y/w 作声母；
 * j/q/x/y 后 u/ue/un/uan 仍记 u 系（ü 键位规则由方案引擎处理）；非法音节返回 null。
 */
export function splitPinyin(pinyin: string): SplitResult {
  const text = normalizePinyin(pinyin)
  if (!text || !/^[a-z]+$/.test(text)) return null
  if (ZERO_SET.has(text)) return { initial: '', final: text as SyllableFinal, zeroInitial: true }
  for (const initial of LONGEST_INITIALS) {
    if (text.startsWith(initial)) {
      return finalizeSplit(initial as Initial, text.slice(initial.length))
    }
  }
  const first = text.slice(0, 1)
  if (!INITIAL_SET.has(first)) return null
  return finalizeSplit(first as Initial, text.slice(1))
}

/** 带调拼音 → 规范音节（含声调与零声母标记）；text 可选（对应汉字） */
export function splitSyllable(pinyinWithTone: string, text?: string): Syllable | null {
  const split = splitPinyin(pinyinWithTone)
  if (!split) return null
  const tone = detectTone(pinyinWithTone)
  const syllable: Syllable = {
    text: text ?? '',
    pinyin: `${split.initial}${split.final}`,
    initial: split.initial,
    final: split.final,
    zeroInitial: split.zeroInitial,
  }
  if (tone !== undefined) syllable.tone = tone
  return syllable
}

// ── 声调标注 ──────────────────────────────────────────────────

function toneVowelIndex(chars: readonly string[]): number {
  // 优先标在 a / o / e 上（按优先级），否则标在最后一个 i/u/ü 上
  for (const target of ['a', 'o', 'e']) {
    const index = chars.indexOf(target)
    if (index >= 0) return index
  }
  for (let index = chars.length - 1; index >= 0; index--) {
    const ch = chars[index]
    if (ch === 'i' || ch === 'u' || ch === 'ü') return index
  }
  return -1
}

/**
 * 生成带声调符号的展示拼音（ü 正常显示，不显示 v）。
 * 例：('chong', 2) → 'chóng'；('nv', 3) → 'nǚ'；('qu', 4) → 'qù'。
 * 轻声（5）或未给声调时只做 ü 展示，不加符号。
 */
export function toToneMarks(pinyin: string, tone?: Tone): string {
  const base = normalizePinyin(pinyin)
  if (!base) return ''
  const chars = Array.from(base).map((ch) => (ch === 'v' ? 'ü' : ch))
  const joint = chars.join('')
  if (tone === undefined || tone === 5) return joint
  const index = toneVowelIndex(chars)
  if (index < 0) return joint
  const vowel = chars[index]
  if (!vowel) return joint
  const mark = VOWEL_TONE_MARKS[vowel]?.[tone - 1]
  if (!mark) return joint
  chars[index] = mark
  return chars.join('')
}

// ── 知识点 ID ─────────────────────────────────────────────────

const ATOM_TYPES: readonly AtomType[] = ['initial', 'final', 'zero']

/**
 * 知识点显示标签的唯一规则：零声母统一加「零 」前缀，其余类型原样返回。
 * 零声母音节与韵母同音（如 zero:ai vs final:ai），所有课程/位置都必须可区分。
 * label 允许调用方传展示用的拼音（如 final:v 传 'ü'），默认用 AtomId 的 key。
 */
export function atomDisplayLabel(atomId: AtomId, label?: string): string {
  const ref = parseAtomId(atomId)
  const text = label ?? ref?.key ?? atomId
  if (!ref) return text
  return ref.type === 'zero' ? `零 ${text}` : text
}

/**
 * 解析 AtomId（如 'initial:zh'、'final:ai'、'zero:er'）。
 * 非法输入返回 null。
 */
export function parseAtomId(atomId: AtomId | string): AtomRef | null {
  if (typeof atomId !== 'string') return null
  const index = atomId.indexOf(':')
  if (index <= 0 || index === atomId.length - 1) return null
  const type = atomId.slice(0, index)
  const key = atomId.slice(index + 1)
  if (!ATOM_TYPES.includes(type as AtomType)) return null
  return { atomId: atomId as AtomId, type: type as AtomType, key }
}

/** 组合 AtomId 的便捷函数 */
export function atomId(type: AtomType, key: string): AtomId {
  return `${type}:${key}`
}
