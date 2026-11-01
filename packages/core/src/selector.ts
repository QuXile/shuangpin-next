/**
 * 选词组卷：确定性 focus 槽位 + 加权随机。
 *
 * 口径：
 * - 每个 focus 原子每轮获得一个槽位；
 * - 候选词必须包含当前 focus，并符合已学/预览原子约束；
 * - 多命中其他「本轮尚未覆盖」的 focus 会获得更高权重；
 * - 不使用词频权重（词频只作为词库入库门槛）；
 * - 没有候选词时使用字符兜底。
 */
import type { AtomId, SelectWordsInput, WordEntry } from './types.ts'
import { focusHitsOf } from './atoms.ts'
import { parseAtomId } from './pinyin.ts'
import { mulberry32, shuffle } from './random.ts'

interface Candidate {
  word: WordEntry
  focusHits: AtomId[]
}

/** 该词的阻塞原子（initial/final；零声母不阻塞） */
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

function buildCandidates(input: SelectWordsInput): Candidate[] {
  const { engine, lesson, words } = input
  const diff = engine.diff()
  const freeInitials = new Set(diff.freeInitials)
  const freeFinals = new Set(diff.freeFinals)
  const learned = new Set(input.learnedAtoms)
  const [minLength, maxLength] = input.lengthRange ?? lesson.wordPlan.lengthRange ?? [2, 3]
  const maxUnfamiliar = Math.max(0, Math.floor(input.maxUnfamiliar ?? lesson.wordPlan.maxUnfamiliar ?? 0))
  const fullFocus = lesson.focusAtoms
  const newFocus = lesson.blockingAtoms.filter(
    (atom) => !learned.has(atom) && !isFreeAtom(atom, freeInitials, freeFinals),
  )
  const newFocusSet = new Set(newFocus)
  const focusSet = new Set(fullFocus)
  const zeroKnown = (final: string): boolean => {
    const atom = `zero:${final}` as AtomId
    return focusSet.has(atom) || learned.has(atom)
  }

  const candidates: Candidate[] = []
  const seen = new Set<string>()
  const addCandidate = (word: WordEntry, allowShort = false) => {
    if (seen.has(word.text)) return
    if (!allowShort && (word.length < minLength || word.length > maxLength)) return
    if (word.syllables.some((syllable) => syllable.initial === '' && !zeroKnown(syllable.final))) return
    const blocking = blockingAtomsOf(word, freeInitials, freeFinals)
    const unknown = blocking.filter((atom) => !learned.has(atom))
    const hits = focusHitsOf(word, fullFocus)
    if (newFocus.length > 0) {
      const unknownFocus = unknown.filter((atom) => newFocusSet.has(atom))
      const unknownPreview = unknown.filter((atom) => !newFocusSet.has(atom))
      if (unknownPreview.length > maxUnfamiliar) return
      if (unknown.length > 0 && unknownFocus.length === 0) return
    } else {
      // 无 newFocus 的复习课（尤其是全拼沿用）允许少量预习原子：
      // 只有在课程数据显式给出 maxUnfamiliar > 0 时才放宽。
      if (unknown.length > maxUnfamiliar) return
      if (fullFocus.length > 0 && hits.length === 0) return
    }
    if (hits.length === 0 && fullFocus.length > 0) return
    seen.add(word.text)
    candidates.push({ word, focusHits: hits })
  }

  for (const word of words) addCandidate(word)
  for (const word of input.extraWords ?? []) addCandidate(word, true)
  return candidates
}

/** 加权随机选择：优先覆盖尚未覆盖的 focus，多命中不惩罚。 */
function weightedPick(
  candidates: Candidate[],
  focus: AtomId,
  covered: ReadonlySet<AtomId>,
  used: ReadonlySet<string>,
  rng: () => number,
): Candidate | null {
  const eligible = candidates.filter(
    (candidate) => candidate.focusHits.includes(focus) && !used.has(candidate.word.text),
  )
  if (eligible.length === 0) {
    // 词池耗尽后允许重复，但仍优先包含当前 focus。
    const fallback = candidates.filter((candidate) => candidate.focusHits.includes(focus))
    if (fallback.length === 0) return null
    return fallback[Math.floor(rng() * fallback.length)] ?? fallback[0] ?? null
  }
  const weights = eligible.map((candidate) => {
    let weight = 1
    for (const hit of candidate.focusHits) {
      if (!covered.has(hit)) weight += 2
    }
    // 多命中作为加成，但每次只奖励一次。
    weight += Math.max(0, candidate.focusHits.length - 1) * 0.5
    return weight
  })
  const total = weights.reduce((sum, value) => sum + value, 0)
  let value = rng() * total
  for (let index = 0; index < eligible.length; index += 1) {
    value -= weights[index] ?? 0
    if (value <= 0) return eligible[index] ?? null
  }
  return eligible[eligible.length - 1] ?? null
}

/**
 * 为一节课选出一组练习词（确定性 focus 槽位 + seeded 加权随机）。
 */
export function selectWords(input: SelectWordsInput): WordEntry[] {
  const { lesson } = input
  const count = Math.max(1, Math.floor(input.count))
  const seed = Math.floor(input.seed ?? 0)
  const candidates = buildCandidates(input)
  if (candidates.length === 0) return []
  if (lesson.focusAtoms.length === 0) {
    return shuffle(candidates, mulberry32(seed))
      .slice(0, count)
      .map((candidate) => candidate.word)
  }

  const rng = mulberry32(seed ^ 0x85ebca6b)
  const covered = new Set<AtomId>()
  const used = new Set<string>()
  const result: WordEntry[] = []
  let round = 0
  while (result.length < count) {
    const order = shuffle([...lesson.focusAtoms], mulberry32(seed + round * 7919))
    let pickedThisRound = 0
    for (const focus of order) {
      if (result.length >= count) break
      const candidate = weightedPick(candidates, focus, covered, used, rng)
      if (!candidate) continue
      result.push(candidate.word)
      used.add(candidate.word.text)
      pickedThisRound += 1
      for (const hit of candidate.focusHits) covered.add(hit)
    }
    if (pickedThisRound === 0) break
    round += 1
    // 一轮全部用完后进入下一轮，允许重复，但轮内不重复。
    if (result.length < count && used.size >= candidates.length) {
      used.clear()
    }
  }
  return result.slice(0, count)
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
