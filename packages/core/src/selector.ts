/**
 * 确定性选词 + 随机原语（合并原 selector.ts + random.ts）。
 *
 * 选词口径：
 * - 每个 focus 原子每轮获得一个槽位；
 * - 候选词必须包含当前 focus，并符合已学/预览原子约束；
 * - 多命中其他「本轮尚未覆盖」的 focus 会获得更高权重；
 * - 不使用词频权重（词频只作为词库入库门槛）；
 * - 没有候选词时使用字符兜底。
 *
 * 性能约定（与旧实现逐词等价）：
 * - focus 原子在选词入口一次性预解析成「类型 + key → focus 原子」表，逐词匹配时不再
 *   parseAtomId / 构造 AtomId，也不再为每个词分配 Set；
 * - 候选按命中原子建倒排表（保持候选顺序）；权重复用「1 + 2×未覆盖数 + 0.5×(命中数-1)」
 *   的增量维护（半整数精确），weightedPick 每次只做一次权重扫描；
 * - 同一 (方案, 词表, 课程, 已学原子) 的候选表只在首次组卷时构建，后续换 seed 重新组卷
 *   直接复用（候选词序不变，每轮只重置 used/权重状态）；缓存按对象身份 + 内容快照校验；
 * - 权重公式、rng() 调用次数与顺序、候选顺序与旧实现完全一致，同 seed 结果逐词相同。
 */
import type { AtomId, SelectWordsInput, WordEntry } from './types.ts'
import { focusHitsOf, parseAtomId } from './pinyin.ts'
import { isFreeAtom } from './scheme.ts'

// ── 随机原语（确定性：同一 seed 同一结果） ────────────────────

/** mulberry32：32 位种子伪随机数生成器（返回 [0, 1)） */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher–Yates 洗牌（不修改入参） */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(rng() * (index + 1))
    const value = result[index] as T
    result[index] = result[swap] as T
    result[swap] = value
  }
  return result
}

/** 以数值 seed 洗牌的便捷函数（同 seed 完全可复现） */
export function shuffleSeeded<T>(items: readonly T[], seed: number): T[] {
  return shuffle(items, mulberry32(seed))
}

// ── 选词 ──────────────────────────────────────────────────────

interface Candidate {
  word: WordEntry
  focusHits: AtomId[]
  /** 所有命中都未覆盖时的权重（focus 覆盖时递减） */
  initialWeight: number
  /** 当前权重：focus 被覆盖时同步递减 */
  weight: number
  /** 本轮是否已被选过（等价旧实现的 used Set；词池耗空后统一清空） */
  used: boolean
}

/** focus 原子预解析：类型 + key → focus 原子（同名原子出现多次时保留按序号匹配的慢口径） */
interface FocusIndex {
  readonly unique: boolean
  readonly initialAtom: Map<string, AtomId>
  readonly finalAtom: Map<string, AtomId>
  readonly zeroAtom: Map<string, AtomId>
}

function buildFocusIndex(focusAtoms: readonly AtomId[]): FocusIndex {
  const initialAtom = new Map<string, AtomId>()
  const finalAtom = new Map<string, AtomId>()
  const zeroAtom = new Map<string, AtomId>()
  let unique = true
  for (const atom of focusAtoms) {
    const ref = parseAtomId(atom)
    if (!ref) continue
    if (ref.type === 'initial') {
      if (initialAtom.has(ref.key)) unique = false
      else initialAtom.set(ref.key, atom)
    } else if (ref.type === 'final') {
      if (finalAtom.has(ref.key)) unique = false
      else finalAtom.set(ref.key, atom)
    } else {
      if (zeroAtom.has(ref.key)) unique = false
      else zeroAtom.set(ref.key, atom)
    }
  }
  return { unique, initialAtom, finalAtom, zeroAtom }
}

/** 已学原子按类型拆 key：判断「未知阻塞原子」时不再逐词构造 AtomId */
interface LearnedKeys {
  readonly initials: ReadonlySet<string>
  readonly finals: ReadonlySet<string>
  readonly zero: ReadonlySet<string>
}

function learnedKeysOf(atoms: readonly AtomId[]): LearnedKeys {
  const initials = new Set<string>()
  const finals = new Set<string>()
  const zero = new Set<string>()
  for (const atom of atoms) {
    const ref = parseAtomId(atom)
    if (!ref) continue
    if (ref.type === 'initial') initials.add(ref.key)
    else if (ref.type === 'final') finals.add(ref.key)
    else zero.add(ref.key)
  }
  return { initials, finals, zero }
}

/** 2 个 key 集合 → 「key → 位标记」表（1=free，2=已学）：未知判定只需一次查表 */
function flagMapOf(
  freeKeys: ReadonlySet<string>,
  learnedKeys: ReadonlySet<string>,
): Map<string, number> {
  const flags = new Map<string, number>()
  for (const key of freeKeys) flags.set(key, 1)
  for (const key of learnedKeys) flags.set(key, (flags.get(key) ?? 0) | 2)
  return flags
}

/** 一次选词共享的过滤上下文（主词表与 extraWords 候选共用同一口径） */
interface CandidateContext {
  readonly learned: ReadonlySet<AtomId>
  readonly initialFlags: ReadonlyMap<string, number>
  readonly finalFlags: ReadonlyMap<string, number>
  readonly minLength: number
  readonly maxLength: number
  readonly maxUnfamiliar: number
  readonly fullFocus: readonly AtomId[]
  readonly newFocus: readonly AtomId[]
  readonly newFocusKeys: LearnedKeys
  readonly knownZeroKeys: ReadonlySet<string>
  readonly focusIndex: FocusIndex | null
  readonly uniqueFocus: boolean
  /** 每词复用的小数组（单线程顺序构建，构建完即复用） */
  readonly unknownInitials: string[]
  readonly unknownFinals: string[]
  readonly hitAtoms: AtomId[]
}

function createCandidateContext(input: SelectWordsInput): CandidateContext {
  const { engine, lesson } = input
  const free = engine.freeSets()
  const learned = new Set(input.learnedAtoms)
  const learnedKeys = learnedKeysOf(input.learnedAtoms)
  const [minLength, maxLength] = input.lengthRange ?? lesson.wordPlan.lengthRange ?? [2, 3]
  const maxUnfamiliar = Math.max(
    0,
    Math.floor(input.maxUnfamiliar ?? lesson.wordPlan.maxUnfamiliar ?? 0),
  )
  const fullFocus = lesson.focusAtoms
  const focusIndex = fullFocus.length > 0 ? buildFocusIndex(fullFocus) : null
  const newFocus = lesson.blockingAtoms.filter(
    (atom) => !learned.has(atom) && !isFreeAtom(engine, atom),
  )
  // 零声母「已学」口径：zero 原子在 focus 或已学集合中即可用。
  const knownZeroKeys = new Set<string>(learnedKeys.zero)
  for (const key of focusIndex?.zeroAtom.keys() ?? []) knownZeroKeys.add(key)
  return {
    learned,
    initialFlags: flagMapOf(free.initials, learnedKeys.initials),
    finalFlags: flagMapOf(free.finals, learnedKeys.finals),
    minLength,
    maxLength,
    maxUnfamiliar,
    fullFocus,
    newFocus,
    newFocusKeys: learnedKeysOf(newFocus),
    knownZeroKeys,
    focusIndex,
    uniqueFocus: focusIndex?.unique ?? true,
    unknownInitials: [],
    unknownFinals: [],
    hitAtoms: [],
  }
}

/** 过滤单个词并生成候选；不满足条件返回 null。 */
function candidateOf(
  word: WordEntry,
  allowShort: boolean,
  context: CandidateContext,
): Candidate | null {
  if (!allowShort && (word.length < context.minLength || word.length > context.maxLength)) {
    return null
  }
  const syllables = word.syllables
  const { unknownInitials, unknownFinals } = context

  // 未知阻塞原子（非 free 且未学）：同一词内同原子只计一次；零声母音节同时校验 zero 原子。
  unknownInitials.length = 0
  unknownFinals.length = 0
  for (const syllable of syllables) {
    const initial = syllable.initial
    if (initial === '') {
      if (!context.knownZeroKeys.has(syllable.final)) return null
      continue
    }
    const initialFlag = context.initialFlags.get(initial)
    if (initialFlag === undefined || initialFlag === 0) {
      if (!unknownInitials.includes(initial)) unknownInitials.push(initial)
    }
    const final = syllable.final
    const finalFlag = context.finalFlags.get(final)
    if (finalFlag === undefined || finalFlag === 0) {
      if (!unknownFinals.includes(final)) unknownFinals.push(final)
    }
  }
  const unknownCount = unknownInitials.length + unknownFinals.length

  if (context.newFocus.length > 0) {
    let unknownFocus = 0
    for (const key of unknownInitials) if (context.newFocusKeys.initials.has(key)) unknownFocus += 1
    for (const key of unknownFinals) if (context.newFocusKeys.finals.has(key)) unknownFocus += 1
    const unknownPreview = unknownCount - unknownFocus
    if (unknownPreview > context.maxUnfamiliar) return null
    if (unknownCount > 0 && unknownFocus === 0) return null
  } else {
    // 无 newFocus 的复习课（尤其是全拼沿用）允许少量预习原子：
    // 只有在课程数据显式给出 maxUnfamiliar > 0 时才放宽。
    if (unknownCount > context.maxUnfamiliar) return null
  }

  // 命中 focus（不要求顺序：权重只与命中数/覆盖数有关）。
  let hits: AtomId[]
  const focusIndex = context.focusIndex
  if (focusIndex === null) {
    hits = []
  } else if (focusIndex.unique) {
    const hitAtoms = context.hitAtoms
    hitAtoms.length = 0
    for (const syllable of syllables) {
      let atom: AtomId | undefined
      if (syllable.initial === '') {
        atom = focusIndex.zeroAtom.get(syllable.final)
      } else {
        atom = focusIndex.initialAtom.get(syllable.initial)
        if (atom && !hitAtoms.includes(atom)) hitAtoms.push(atom)
        atom = focusIndex.finalAtom.get(syllable.final)
      }
      if (atom && !hitAtoms.includes(atom)) hitAtoms.push(atom)
    }
    if (hitAtoms.length === 0) return null
    hits = hitAtoms.slice()
  } else {
    // focus 原子重复（异常数据）：保持旧实现「每个 focus 槽位各记一次」的命中口径。
    hits = focusHitsOf(word, context.fullFocus)
    if (hits.length === 0) return null
  }

  // 初始权重 = 1 + 2×命中数 + 0.5×(命中数-1)：与旧实现逐次累加得到的浮点值相同（半整数精确）。
  const initialWeight = 1 + 2 * hits.length + Math.max(0, hits.length - 1) * 0.5
  return { word, focusHits: hits, initialWeight, weight: initialWeight, used: false }
}

/** 反向登记到倒排表（每个候选 × focus 只登记一次）。 */
function indexCandidate(
  candidate: Candidate,
  index: Map<AtomId, Candidate[]>,
  scratch: AtomId[],
): void {
  scratch.length = 0
  for (const atom of candidate.focusHits) {
    if (scratch.includes(atom)) continue
    scratch.push(atom)
    const list = index.get(atom)
    if (list) list.push(candidate)
    else index.set(atom, [candidate])
  }
}

interface CandidatePool {
  /** 主词表候选（顺序 = 传入词表顺序） */
  candidates: Candidate[]
  index: Map<AtomId, Candidate[]>
  uniqueFocus: boolean
  /** 主词表候选的 text 集合（extraWords 去重用） */
  texts: Set<string>
}

function buildCandidatePool(input: SelectWordsInput, context: CandidateContext): CandidatePool {
  const candidates: Candidate[] = []
  const index = new Map<AtomId, Candidate[]>()
  const seen = new Set<string>()
  const scratch: AtomId[] = []
  for (const word of input.words) {
    if (seen.has(word.text)) continue
    const candidate = candidateOf(word, false, context)
    if (!candidate) continue
    seen.add(word.text)
    candidates.push(candidate)
    indexCandidate(candidate, index, scratch)
  }
  return { candidates, index, uniqueFocus: context.uniqueFocus, texts: seen }
}

/** extraWords → 追加候选（旧实现口径：放在主词表之后、可绕过词长过滤、按 text 去重）。 */
function buildExtraCandidates(
  extraWords: readonly WordEntry[],
  mainTexts: ReadonlySet<string>,
  context: CandidateContext,
): Candidate[] {
  if (extraWords.length === 0) return []
  const extras: Candidate[] = []
  const seen = new Set<string>()
  for (const word of extraWords) {
    if (mainTexts.has(word.text) || seen.has(word.text)) continue
    const candidate = candidateOf(word, true, context)
    if (!candidate) continue
    seen.add(word.text)
    extras.push(candidate)
  }
  return extras
}

// ── 候选表跨调用缓存 ─────────────────────────────────────────

interface CandidateCacheEntry {
  /** 课程对象与过滤输入快照：内容不一致时视为失效（防止调用方原地修改 lesson） */
  readonly lesson: SelectWordsInput['lesson']
  readonly learnedAtoms: readonly AtomId[]
  readonly focusSnapshot: readonly AtomId[]
  readonly blockingSnapshot: readonly AtomId[]
  readonly minLength: number
  readonly maxLength: number
  readonly maxUnfamiliar: number
  readonly pool: CandidatePool
}

/** scheme engine → 词表 → 最近一次候选表（同一词表只保留最近一课，避免无界内存） */
const CANDIDATE_CACHE = new WeakMap<
  SelectWordsInput['engine'],
  WeakMap<readonly WordEntry[], CandidateCacheEntry>
>()

function sameAtoms(left: readonly AtomId[], right: readonly AtomId[]): boolean {
  if (left === right) return true
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

/** 取出可复用的候选表：命中时复用候选对象并重置 used/权重，不重新过滤 5 万词。 */
function acquireCandidatePool(input: SelectWordsInput): {
  pool: CandidatePool
  context: CandidateContext
} {
  const context = createCandidateContext(input)
  const cacheable = input.lengthRange === undefined && input.maxUnfamiliar === undefined
  if (cacheable) {
    const byWords = CANDIDATE_CACHE.get(input.engine)
    const cached = byWords?.get(input.words)
    if (
      cached &&
      cached.lesson === input.lesson &&
      cached.minLength === context.minLength &&
      cached.maxLength === context.maxLength &&
      cached.maxUnfamiliar === context.maxUnfamiliar &&
      sameAtoms(cached.learnedAtoms, input.learnedAtoms) &&
      sameAtoms(cached.focusSnapshot, input.lesson.focusAtoms) &&
      sameAtoms(cached.blockingSnapshot, input.lesson.blockingAtoms)
    ) {
      for (const candidate of cached.pool.candidates) {
        candidate.weight = candidate.initialWeight
        candidate.used = false
      }
      return { pool: cached.pool, context }
    }
  }
  const pool = buildCandidatePool(input, context)
  if (!cacheable) return { pool, context }
  const entry: CandidateCacheEntry = {
    lesson: input.lesson,
    learnedAtoms: [...input.learnedAtoms],
    focusSnapshot: [...input.lesson.focusAtoms],
    blockingSnapshot: [...input.lesson.blockingAtoms],
    minLength: context.minLength,
    maxLength: context.maxLength,
    maxUnfamiliar: context.maxUnfamiliar,
    pool,
  }
  let byWords = CANDIDATE_CACHE.get(input.engine)
  if (!byWords) {
    byWords = new WeakMap()
    CANDIDATE_CACHE.set(input.engine, byWords)
  }
  byWords.set(input.words, entry)
  return { pool, context }
}

/** 加权随机选择：主词表候选 + extraWords 候选（旧实现里两者的稳定顺序）。 */
function weightedPick(
  mainPool: readonly Candidate[] | undefined,
  extraPool: readonly Candidate[] | undefined,
  rng: () => number,
): Candidate | null {
  const mainLength = mainPool?.length ?? 0
  const extraLength = extraPool?.length ?? 0
  if (mainLength + extraLength === 0) return null
  // 第一遍：按候选顺序累加可用候选的权重（浮点求和顺序与旧实现一致）。
  let total = 0
  let eligibleCount = 0
  if (mainPool) {
    for (let position = 0; position < mainLength; position += 1) {
      const candidate = mainPool[position] as Candidate
      if (candidate.used) continue
      eligibleCount += 1
      total += candidate.weight
    }
  }
  if (extraPool) {
    for (let position = 0; position < extraLength; position += 1) {
      const candidate = extraPool[position] as Candidate
      if (candidate.used) continue
      eligibleCount += 1
      total += candidate.weight
    }
  }
  if (eligibleCount === 0) {
    // 词池耗尽后允许重复，但仍优先包含当前 focus（合并主词表 + 扩展词的稳定顺序）。
    const pick = Math.floor(rng() * (mainLength + extraLength))
    return pick < mainLength
      ? (mainPool?.[pick] ?? null)
      : (extraPool?.[pick - mainLength] ?? null)
  }
  // 第二遍：按同一顺序扣减权重，命中区间即选中（rng 调用次数与旧实现一致）。
  let value = rng() * total
  let last: Candidate | null = null
  if (mainPool) {
    for (let position = 0; position < mainLength; position += 1) {
      const candidate = mainPool[position] as Candidate
      if (candidate.used) continue
      last = candidate
      value -= candidate.weight
      if (value <= 0) return candidate
    }
  }
  if (extraPool) {
    for (let position = 0; position < extraLength; position += 1) {
      const candidate = extraPool[position] as Candidate
      if (candidate.used) continue
      last = candidate
      value -= candidate.weight
      if (value <= 0) return candidate
    }
  }
  return last
}

/** 为一节课选出一组练习词（确定性 focus 槽位 + seeded 加权随机）。 */
export function selectWords(input: SelectWordsInput): WordEntry[] {
  const { lesson } = input
  const count = Math.max(1, Math.floor(input.count))
  const seed = Math.floor(input.seed ?? 0)
  const { pool, context } = acquireCandidatePool(input)
  const extras = buildExtraCandidates(input.extraWords ?? [], pool.texts, context)
  if (pool.candidates.length === 0 && extras.length === 0) return []
  if (lesson.focusAtoms.length === 0) {
    const all = extras.length > 0 ? [...pool.candidates, ...extras] : pool.candidates
    return shuffle(all, mulberry32(seed))
      .slice(0, count)
      .map((candidate) => candidate.word)
  }

  // extraWords 的倒排表（通常只有几十个词，逐次扫描成本可忽略）。
  let extraIndex: Map<AtomId, Candidate[]> | null = null
  if (extras.length > 0) {
    extraIndex = new Map<AtomId, Candidate[]>()
    const scratch: AtomId[] = []
    for (const candidate of extras) indexCandidate(candidate, extraIndex, scratch)
  }
  const totalCandidates = pool.candidates.length + extras.length

  const rng = mulberry32(seed ^ 0x85ebca6b)
  const covered = new Set<AtomId>()
  const result: WordEntry[] = []
  // 候选上的 used 标记代替 Set<string>：weightedPick 热路径避免字符串哈希。
  let usedCount = 0
  const markUsed = (candidate: Candidate): void => {
    if (candidate.used) return
    candidate.used = true
    usedCount += 1
  }
  const resetUsed = (): void => {
    for (const candidate of pool.candidates) candidate.used = false
    for (const candidate of extras) candidate.used = false
    usedCount = 0
  }

  /** 递减某原子对应候选的权重（重复 focus 时按出现次数折算）。 */
  const decreaseWeight = (poolOfAtom: readonly Candidate[] | undefined, atom: AtomId): void => {
    if (!poolOfAtom) return
    if (context.uniqueFocus) {
      for (let position = 0; position < poolOfAtom.length; position += 1) {
        ;(poolOfAtom[position] as Candidate).weight -= 2
      }
      return
    }
    for (let position = 0; position < poolOfAtom.length; position += 1) {
      const affected = poolOfAtom[position] as Candidate
      let occurrences = 0
      for (const hit of affected.focusHits) if (hit === atom) occurrences += 1
      affected.weight -= 2 * occurrences
    }
  }

  /** 覆盖候选命中的新原子：同步递减倒排表中受影响候选的当前权重。 */
  const coverHits = (candidate: Candidate): void => {
    const hits = candidate.focusHits
    for (let hitIndex = 0; hitIndex < hits.length; hitIndex += 1) {
      const atom = hits[hitIndex] as AtomId
      if (covered.has(atom)) continue
      covered.add(atom)
      decreaseWeight(pool.index.get(atom), atom)
      decreaseWeight(extraIndex?.get(atom), atom)
    }
  }

  let round = 0
  while (result.length < count) {
    const order = shuffle([...lesson.focusAtoms], mulberry32(seed + round * 7919))
    let pickedThisRound = 0
    for (const focus of order) {
      if (result.length >= count) break
      const candidate = weightedPick(pool.index.get(focus), extraIndex?.get(focus), rng)
      if (!candidate) continue
      result.push(candidate.word)
      markUsed(candidate)
      pickedThisRound += 1
      coverHits(candidate)
    }
    if (pickedThisRound === 0) break
    round += 1
    // 一轮全部用完后进入下一轮，允许重复，但轮内不重复。
    if (result.length < count && usedCount >= totalCandidates) resetUsed()
  }
  return result.slice(0, count)
}

/** 便于测试/诊断：统计一组词中每个 focus 原子的出现次数 */
export function countFocusHits(
  words: readonly WordEntry[],
  focusAtoms: readonly AtomId[],
): Record<string, number> {
  const result: Record<string, number> = {}
  for (const atom of focusAtoms) result[atom] = 0
  for (const word of words) {
    for (const atom of focusHitsOf(word, focusAtoms)) {
      result[atom] = (result[atom] ?? 0) + 1
    }
  }
  return result
}
