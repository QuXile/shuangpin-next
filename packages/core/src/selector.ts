/**
 * 选词组卷（纯函数、可复现）。
 *
 * 口径（docs/ARCHITECTURE.md §7）：
 * - free 原子（键位与全拼一致）始终视为已学；只有 initial/final 阻塞选词；
 * - newFocus = 本课 blockingAtoms 中尚未掌握的原子（复习/考核课为空）；
 * - 候选分层：S = 未知阻塞原子 ⊆ newFocus；A = 额外 ≤ maxUnfamiliar 个预习原子；B = 无未知原子；
 * - 组卷：使用概率均衡抽样（balancedSampling.ts）：
 *   每个 focus 音的期望出现次数相等；含目标音次数多的词权重更高；
 * - 只有 newFocus 为空（复习/考核/规则课）时，候选词必须命中至少 1 个 focus 原子。
 */
import type { AtomId, SelectWordsInput, WordEntry } from './types.ts'
import { focusHitsOf } from './atoms.ts'
import { parseAtomId } from './pinyin.ts'
import { mulberry32, shuffle } from './random.ts'
import { sampleBalancedTargets, type BalancedCandidate } from './balancedSampling.ts'

type Tier = 'S' | 'A' | 'B'

interface Candidate {
  word: WordEntry
  score: number
  focusHits: AtomId[]
  tier: Tier
}

const TIER_SCORE: Record<Tier, number> = { S: 100, A: 70, B: 40 }

function logNorm(value: number, min: number, max: number): number {
  if (!(value > 0) || !(min > 0) || !(max > min)) return 0
  const ratio = (Math.log(value) - Math.log(min)) / (Math.log(max) - Math.log(min))
  return Math.min(1, Math.max(0, ratio))
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/** 该音的阻塞原子（initial/final；零声母不阻塞） */
function blockingAtomsOf(
  word: WordEntry,
  freeInitials: ReadonlySet<string>,
  freeFinals: ReadonlySet<string>,
): AtomId[] {
  const atoms = new Set<AtomId>()
  for (const syllable of word.syllables) {
    if (syllable.initial === '') continue
    if (!freeInitials.has(syllable.initial)) atoms.add(`initial:${syllable.initial}` as AtomId)
    if (!freeFinals.has(syllable.final)) atoms.add(`final:${syllable.final}` as AtomId)
  }
  return [...atoms]
}

/**
 * 为一节课选出一组练习词（纯函数、可复现）。
 * 返回值可能少于 count（词池不足时），调用方自行决定兜底策略。
 */
export function selectWords(input: SelectWordsInput): WordEntry[] {
  const { engine, lesson, words } = input
  const diff = engine.diff()
  const freeInitials = new Set(diff.freeInitials)
  const freeFinals = new Set(diff.freeFinals)
  const learned = new Set(input.learnedAtoms)
  const count = Math.max(1, Math.floor(input.count))
  const maxUnfamiliar = Math.max(
    0,
    Math.floor(input.maxUnfamiliar ?? lesson.wordPlan.maxUnfamiliar ?? 0),
  )
  const [minLength, maxLength] = input.lengthRange ?? lesson.wordPlan.lengthRange ?? [2, 3]
  const fullFocus = lesson.focusAtoms
  const newFocus = lesson.blockingAtoms.filter((atom) => !learned.has(atom) && !isFreeAtom(atom, freeInitials, freeFinals))
  const newFocusSet = new Set(newFocus)
  const focusSet = new Set(fullFocus)
  /** 零声母音节逐音节判定：在本课 focus 中或已学，才允许出现在候选词里 */
  const zeroKnown = (final: string): boolean => {
    const atom = `zero:${final}` as AtomId
    return focusSet.has(atom) || learned.has(atom)
  }
  const seed = Math.floor(input.seed ?? 0)

  // 频次归一化区间
  let freqMin = Infinity
  let freqMax = 0
  for (const word of words) {
    if (word.freq > 0) {
      freqMin = Math.min(freqMin, word.freq)
      freqMax = Math.max(freqMax, word.freq)
    }
  }
  if (!Number.isFinite(freqMin) || freqMax <= freqMin) {
    freqMin = 1
    freqMax = Math.max(freqMax, 2)
  }

  const jitterRng = mulberry32(seed)
  const jitters = new Map<string, number>()
  const candidates: Candidate[] = []
  const seen = new Set<string>()

  for (const word of words) {
    if (seen.has(word.text)) continue
    seen.add(word.text)
    if (word.length < minLength || word.length > maxLength) continue

    if (word.syllables.some((syllable) => syllable.initial === '' && !zeroKnown(syllable.final))) {
      continue
    }

    const blocking = blockingAtomsOf(word, freeInitials, freeFinals)
    const unknown = blocking.filter((atom) => !learned.has(atom))
    const hits = focusHitsOf(word, fullFocus)

    let tier: Tier
    if (newFocus.length > 0) {
      const unknownFocus = unknown.filter((atom) => newFocusSet.has(atom))
      const unknownPreview = unknown.filter((atom) => !newFocusSet.has(atom))
      if (unknownPreview.length > maxUnfamiliar) continue
      if (unknown.length > 0 && unknownFocus.length === 0) continue
      tier = unknown.length === 0 ? 'B' : unknownPreview.length === 0 ? 'S' : 'A'
    } else {
      if (unknown.length > 0) continue
      if (fullFocus.length > 0 && hits.length === 0) continue
      tier = 'B'
    }

    const freqScore = logNorm(word.freq, freqMin, freqMax)
    const lengthFit = word.length === minLength ? 1 : word.length === minLength + 1 ? 0.6 : 0.2
    const charDifficulty = clamp01(((word.minCharRank ?? 500) - 500) / 3000)
    const jitter = (jitters.get(word.text) ?? jitterRng() * 1) // 同一词只抖动一次
    jitters.set(word.text, jitter)
    const score =
      TIER_SCORE[tier] +
      15 * freqScore +
      5 * lengthFit -
      10 * (word.polyphone ? 1 : 0) -
      5 * charDifficulty +
      jitter * 0.8
    candidates.push({ word, score, focusHits: hits, tier })
  }

  const selectedWords = new Set<string>()
  const balanced: BalancedCandidate<WordEntry>[] = []
  for (const candidate of candidates) {
    const counts = targetCountsOf(candidate.word, fullFocus)
    if (counts.size === 0) continue
    balanced.push({
      item: candidate.word,
      counts,
      quality: Math.exp((candidate.score - 60) / 25),
    })
    selectedWords.add(candidate.word.text)
  }

  // 「以字代词」：词池不足时补充单字候选，单字不设特殊标记，直接参与同一套概率抽样。
  for (const word of input.extraWords ?? []) {
    if (selectedWords.has(word.text)) continue
    const counts = targetCountsOf(word, fullFocus)
    if (counts.size === 0) continue
    balanced.push({
      item: word,
      counts,
      quality: 0.45 + Math.log1p(Math.max(0, word.freq)) / 20,
    })
    selectedWords.add(word.text)
  }

  // 无 focus 的兜底课：没有可均衡的目标音，按原质量随机选词。
  if (fullFocus.length === 0) {
    return shuffle([...candidates], mulberry32(seed ^ 0x85ebca6b))
      .slice(0, count)
      .map((candidate) => candidate.word)
  }
  if (balanced.length === 0) return []
  return sampleBalancedTargets(balanced, count, seed)
}

/** 目标音的逐音节出现次数（同一音在一个词中出现多次会计多次）。 */
export function targetCountsOf(word: WordEntry, focusAtoms: readonly AtomId[]): Map<AtomId, number> {
  if (focusAtoms.length === 0) return new Map()
  const focus = new Set(focusAtoms)
  const counts = new Map<AtomId, number>()
  for (const syllable of word.syllables) {
    if (syllable.initial === '') {
      const atom = `zero:${syllable.final}` as AtomId
      if (focus.has(atom)) counts.set(atom, (counts.get(atom) ?? 0) + 1)
      continue
    }
    const initialAtom = `initial:${syllable.initial}` as AtomId
    if (focus.has(initialAtom)) counts.set(initialAtom, (counts.get(initialAtom) ?? 0) + 1)
    const finalAtom = `final:${syllable.final}` as AtomId
    if (focus.has(finalAtom)) counts.set(finalAtom, (counts.get(finalAtom) ?? 0) + 1)
  }
  return counts
}

function isFreeAtom(
  atom: AtomId,
  freeInitials: ReadonlySet<string>,
  freeFinals: ReadonlySet<string>,
): boolean {
  const ref = parseAtomId(atom)
  if (!ref) return false
  if (ref.type === 'initial') return freeInitials.has(ref.key)
  if (ref.type === 'final') return freeFinals.has(ref.key)
  return false
}

/** 便于测试/诊断：统计一组词中每个 focus 原子的出现次数 */
export function countFocusHits(words: readonly WordEntry[], focusAtoms: readonly AtomId[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const atom of focusAtoms) result[atom] = 0
  for (const word of words) {
    for (const atom of focusHitsOf(word, focusAtoms)) {
      result[atom] = (result[atom] ?? 0) + 1
    }
  }
  return result
}
