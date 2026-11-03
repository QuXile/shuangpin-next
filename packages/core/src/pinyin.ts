/**
 * 拼音与知识点（atom）基础：规范声母/韵母常量、音节拆分、声调显示、AtomId 与词/原子匹配谓词。
 *
 * 纯 TS，无框架/DOM/Node 依赖；不引第三方拼音库，外部拼音 token 由调用方传入并在此规范化为音节。
 * 「哪些键位是 free（与全拼一致）」属于方案属性，由 SchemeEngine.freeSets()/diff() 推导，本文件不硬编码。
 * 合并自原 pinyin.ts + atoms.ts：知识点标记与匹配谓词和拼音同属一个领域。
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
  WordEntry,
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

const INITIAL_SET: ReadonlySet<string> = new Set(INITIALS)
const FINAL_SET: ReadonlySet<string> = new Set(FINALS)
const ZERO_SET: ReadonlySet<string> = new Set(ZERO_INITIALS)

/** 最长匹配优先的声母顺序（zh/ch/sh 必须先于 z/c/s） */
const LONGEST_INITIALS: readonly string[] = ['zh', 'ch', 'sh']

/** 零声母判定（initial === '' 即零声母；zeroInitial 显式传入只用于外部数据的兼容写法） */
export function isZeroSyllable(syllable: { initial: string; zeroInitial?: boolean }): boolean {
  return syllable.zeroInitial === true || syllable.initial === ''
}

// ── 声调符号 ──────────────────────────────────────────────────

/**
 * 带调字符唯一来源（ü 记 v）：vowel → [一声, 二声, 三声, 四声]。
 * normalize / detectTone / toToneMarks 全部由这张表派生，避免三份手工映射漂移。
 */
const TONE_MARKS: Readonly<Record<string, readonly [string, string, string, string]>> = {
  a: ['ā', 'á', 'ǎ', 'à'],
  o: ['ō', 'ó', 'ǒ', 'ò'],
  e: ['ē', 'é', 'ě', 'è'],
  i: ['ī', 'í', 'ǐ', 'ì'],
  u: ['ū', 'ú', 'ǔ', 'ù'],
  v: ['ǖ', 'ǘ', 'ǚ', 'ǜ'],
}

const TONE_MARK_TO_BASE: ReadonlyMap<string, string> = new Map(
  Object.entries(TONE_MARKS).flatMap(([base, marks]) => marks.map((mark) => [mark, base] as const)),
)
const TONE_MARK_TO_LEVEL: ReadonlyMap<string, Tone> = new Map(
  Object.entries(TONE_MARKS).flatMap(([, marks]) =>
    marks.map((mark, index) => [mark, (index + 1) as Tone] as const),
  ),
)

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
    const base = TONE_MARK_TO_BASE.get(ch)
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
    const tone = TONE_MARK_TO_LEVEL.get(ch)
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

/** 带调拼音 → 规范音节（含声调；text 可选，对应汉字） */
export function splitSyllable(pinyinWithTone: string, text?: string): Syllable | null {
  const split = splitPinyin(pinyinWithTone)
  if (!split) return null
  const syllable: Syllable = {
    text: text ?? '',
    pinyin: `${split.initial}${split.final}`,
    initial: split.initial,
    final: split.final,
  }
  const tone = detectTone(pinyinWithTone)
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
  const toneMark = vowel === 'ü' ? TONE_MARKS.v?.[tone - 1] : TONE_MARKS[vowel]?.[tone - 1]
  if (!toneMark) return joint
  chars[index] = toneMark
  return chars.join('')
}

// ── 外部拼音结果 → 规范音节 ──────────────────────────────────

/**
 * 外部拼音库（如 pinyin-pro）的 token → (无声调拼音, 声调)。
 * 支持 `yin2` / `lü4` / `yi0`（0 与 5 都表示轻声）；无法解析时返回 null。
 */
export function parsePinyinToken(token: string): { pinyin: string; tone: Tone } | null {
  const match = /^([a-zA-Zü:]+?)([0-5])$/.exec(token.trim())
  if (!match?.[1] || !match[2]) return null
  const pinyin = normalizePinyin(match[1])
  if (!pinyin) return null
  const value = Number(match[2])
  return { pinyin, tone: (value === 0 ? 5 : value) as Tone }
}

/** 单字 + 带调拼音 token → 规范音节；声母/韵母不在本应用口径内时返回 null。 */
export function syllableFromPinyinToken(char: string, token: string): Syllable | null {
  const parsed = parsePinyinToken(token)
  if (!parsed) return null
  const split = splitPinyin(parsed.pinyin)
  if (!split) return null
  const supported = split.initial === '' ? ZERO_SET.has(split.final) : FINAL_SET.has(split.final)
  if (!supported) return null
  return {
    text: char,
    pinyin: parsed.pinyin,
    initial: split.initial,
    final: split.final,
    tone: parsed.tone,
  }
}

/** 整词拼音 token 列表 → WordEntry；长度不符或任一音节不可表示时返回 null。 */
export function entryFromPinyin(
  text: string,
  freq: number,
  tokens: readonly string[],
  freqRank?: number,
): WordEntry | null {
  const chars = Array.from(text)
  if (tokens.length !== chars.length) return null
  const syllables: Syllable[] = []
  for (let index = 0; index < chars.length; index += 1) {
    const syllable = syllableFromPinyinToken(chars[index]!, tokens[index]!)
    if (!syllable) return null
    syllables.push(syllable)
  }
  return {
    text,
    length: chars.length,
    freq,
    ...(freqRank !== undefined ? { freqRank } : {}),
    syllables,
    chars,
  }
}

// ── 知识点 ID / 匹配谓词 ─────────────────────────────────────

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

/** 解析 AtomId（如 'initial:zh'、'final:ai'、'zero:er'）；非法输入返回 null */
export function parseAtomId(atomId: AtomId | string): AtomRef | null {
  if (typeof atomId !== 'string') return null
  const index = atomId.indexOf(':')
  if (index <= 0 || index === atomId.length - 1) return null
  const type = atomId.slice(0, index)
  const key = atomId.slice(index + 1)
  if (!ATOM_TYPES.includes(type as AtomType)) return null
  return { atomId: atomId as AtomId, type: type as AtomType, key }
}

/** 组合 AtomId */
export function atomId(type: AtomType, key: string): AtomId {
  return `${type}:${key}`
}

/** 匹配只需要 (initial, final)：词条与展示模型都满足该结构 */
type MatchableSyllable = { readonly initial: string; readonly final: string }
type MatchableWord = { readonly syllables: readonly MatchableSyllable[] }

/** 该知识点是否在本词中命中（initial / final / zero 三类具体键位） */
export function atomMatchesWord(atom: AtomId, word: MatchableWord): boolean {
  const ref = parseAtomId(atom)
  if (!ref) return false
  switch (ref.type) {
    case 'initial':
      return word.syllables.some((syllable) => syllable.initial === ref.key)
    case 'final':
      // final 只匹配有真实声母的音节；零声母音节是另一类知识点。
      return word.syllables.some(
        (syllable) => syllable.initial !== '' && syllable.final === ref.key,
      )
    case 'zero':
      return word.syllables.some((syllable) => syllable.initial === '' && syllable.final === ref.key)
    default:
      return false
  }
}

/** 本词命中的全部 focus 原子（保持 focus 顺序） */
export function focusHitsOf(word: MatchableWord, focusAtoms: readonly AtomId[]): AtomId[] {
  return focusAtoms.filter((atom) => atomMatchesWord(atom, word))
}
