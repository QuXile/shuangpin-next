/**
 * 阶段（单字 / 词语 / 考核）计划与内容装配：web 只调用这里的纯函数。
 *
 * 口径（docs/ARCHITECTURE.md）：
 * - drill：single → word；review：word；exam：word（混合练习）→ exam；
 * - 每课目标由课程数据 `stageTargets` 给出（缺省按课程类型用 KIND_STAGE_TARGETS）；
 * - 阶段实际目标 = 生成词的总字数（整词对齐）；
 * - 教学页示例：课程数据生成的 examples（每个合法音节一张卡、学习顺序），全量展示、不截断。
 */
import type {
  AtomId,
  LessonDef,
  LessonKind,
  LessonPool,
  PracticeStage,
  PracticeWord,
  SchemeEngine,
  StageGate,
  StageGateMetrics,
  Syllable,
  SyllableFinal,
  WordEntry,
} from './types.ts'
import { atomMatchesWord, focusHitsOf } from './atoms.ts'
import { sampleBalancedTargets } from './balancedSampling.ts'
import { parseAtomId } from './pinyin.ts'
import { buildPracticeWord, buildPracticeWordFromSyllable } from './practice.ts'
import { shuffleSeeded } from './random.ts'
import { selectWords, targetCountsOf } from './selector.ts'

/**
 * 各课程类型的阶段最低词数：
 * - drill：字 15 → 半遮挡词 15 → 全遮挡考核 25；
 * - review：全遮挡 50；
 * - exam：全遮挡 100。
 * 数据里的 stageMinWords 覆盖优先。
 */
export const KIND_STAGE_MIN_WORDS: Record<LessonKind, Partial<Record<PracticeStage, number>>> = {
  intro: {},
  drill: { single: 15, word: 15, exam: 25 },
  review: { exam: 50 },
  exam: { exam: 100 },
}

const STAGE_ORDER: Record<LessonDef['kind'], PracticeStage[]> = {
  intro: [],
  drill: ['single', 'word', 'exam'],
  review: ['exam'],
  exam: ['exam'],
}

/** 本课包含的练习阶段（不含 tutorial；intro 返回空数组，走独立入门组件） */
export function lessonStages(lesson: LessonDef): PracticeStage[] {
  return lesson.kind === 'intro' ? [] : [...STAGE_ORDER[lesson.kind]]
}

/** 本课各阶段最低完成词数（课程数据覆盖 kind 默认值） */
export function lessonStageMinWords(lesson: LessonDef): Partial<Record<PracticeStage, number>> {
  return { ...KIND_STAGE_MIN_WORDS[lesson.kind], ...(lesson.stageMinWords ?? {}) }
}

/**
 * 阶段门槛：字/半遮挡词阶段只看最低词数；全遮挡考核阶段（每课最后一场）
 * 还要求达到本课考核标准（正确率 ≥ criteria.accuracy，速度课再加 minCpm）。
 * 返回未达标原因，供工具栏展示。
 */
export function stageGate(
  lesson: LessonDef,
  stage: PracticeStage,
  metrics: StageGateMetrics,
): StageGate {
  const minWords = lessonStageMinWords(lesson)[stage] ?? 0
  const completedWords = metrics.completedWords
  const strict = stage === 'exam'
  const reasons: string[] = []
  const sampleOk = completedWords >= minWords
  if (!sampleOk) reasons.push(`再练 ${minWords - completedWords} 词`)

  let criteriaOk = true
  if (strict) {
    const criteria = lesson.passCriteria
    if (!criteria) {
      criteriaOk = false
      reasons.push('缺少考核标准')
    } else {
      const accuracyOk = metrics.accuracy >= criteria.accuracy
      if (!accuracyOk) {
        criteriaOk = false
        reasons.push(`正确率 ${Math.round(metrics.accuracy * 100)}% < ${Math.round(criteria.accuracy * 100)}%`)
      }
      const minCpm = criteria.minCpm ?? 0
      if (minCpm > 0 && metrics.cpm < minCpm) {
        criteriaOk = false
        reasons.push(`速度 ${metrics.cpm} < ${minCpm} WPM`)
      }
    }
  }

  return {
    stage,
    minWords,
    strict,
    completedWords,
    met: sampleOk && criteriaOk,
    reasons,
  }
}

/** 提示档位由阶段唯一决定：单字全显、半遮挡词隐藏本课 focus、考核全遮挡 */
export function hintTierFor(stage: PracticeStage): 1 | 2 | 3 {
  if (stage === 'single') return 1
  if (stage === 'word') return 2
  return 3
}

// ── 内容装配 ──────────────────────────────────────────────────

export interface StageInput {
  engine: SchemeEngine
  lesson: LessonDef
  pool: LessonPool
  learnedAtoms: readonly AtomId[]
  /** 单字阶段：最多生成多少张单字卡 */
  count: number
  seed?: number
}

export interface WordStageInput {
  engine: SchemeEngine
  lesson: LessonDef
  pool: LessonPool
  learnedAtoms: readonly AtomId[]
  /** 词语/考核阶段：抽词直到词数 ≥ targetWords */
  targetWords: number
  seed?: number
}

export interface TutorialInput {
  engine: SchemeEngine
  lesson: LessonDef
  pool: LessonPool
}

function isKnownBlockingAtom(
  atom: AtomId,
  learned: ReadonlySet<AtomId>,
  freeInitials: ReadonlySet<string>,
  freeFinals: ReadonlySet<string>,
): boolean {
  const ref = parseAtomId(atom)
  if (!ref) return false
  if (ref.type === 'initial') return freeInitials.has(ref.key) || learned.has(atom)
  if (ref.type === 'final') return freeFinals.has(ref.key) || learned.has(atom)
  return learned.has(atom)
}

function syllableOfWord(word: WordEntry): Syllable | null {
  const source = word.syllables[0]
  if (!source) return null
  const syllable: Syllable = {
    text: source.text,
    pinyin: source.pinyin,
    initial: source.initial,
    final: source.final as SyllableFinal,
    zeroInitial: source.initial === '',
  }
  if (source.tone !== undefined) syllable.tone = source.tone
  return syllable
}

function keySetOf(engine: SchemeEngine, atoms: readonly AtomId[]): Set<string> {
  const keys = new Set<string>()
  for (const atom of atoms) {
    for (const key of engine.keysForAtom(atom)) keys.add(key.toLowerCase())
  }
  return keys
}

/**
 * 单字阶段：从课程词池 chars 中挑「本课 focus + 已学/free」的单字，不足时用同键位已学字补齐。
 * 结果可能少于 count（该课单字确实不足），由调用方以实际字数作为阶段目标。
 */
export function buildSingleCharWords(input: StageInput): PracticeWord[] {
  const { engine, lesson, pool, learnedAtoms } = input
  const learned = new Set(learnedAtoms)
  const diff = engine.diff()
  const freeInitials = new Set(diff.freeInitials)
  const freeFinals = new Set(diff.freeFinals)
  const focusAtoms = lesson.focusAtoms
  const focusSet = new Set(focusAtoms)
  const focusKeys = keySetOf(engine, lesson.blockingAtoms)
  const needSameKeyFallback = true

  const hitsFocus = (word: WordEntry) => focusHitsOf(word, focusAtoms).length > 0
  const allAtomsKnown = (word: WordEntry) =>
    word.syllables.every((syllable) => {
      if (syllable.initial === '') {
        const zeroAtom = `zero:${syllable.final}` as AtomId
        return focusSet.has(zeroAtom) || learned.has(zeroAtom)
      }
      const atoms: AtomId[] = [
        `initial:${syllable.initial}` as AtomId,
        `final:${syllable.final}` as AtomId,
      ]
      return atoms.every((atom) =>
        isKnownBlockingAtom(atom, learned, freeInitials, freeFinals) ||
        focusSet.has(atom),
      )
    })
  const sharesFocusKey = (word: WordEntry) =>
    word.syllables.some((syllable) => {
      const keys: string[] = []
      if (syllable.initial !== '') {
        keys.push(...engine.keysForAtom(`initial:${syllable.initial}` as AtomId))
        keys.push(...engine.keysForAtom(`final:${syllable.final}` as AtomId))
      } else {
        keys.push(...engine.keysForAtom(`zero:${syllable.final}` as AtomId))
      }
      return keys.some((key) => focusKeys.has(key.toLowerCase()))
    })

  const primary: WordEntry[] = []
  const sameKey: WordEntry[] = []
  const known: WordEntry[] = []
  const seen = new Set<string>()
  // 单字池可能很薄（稀有韵母课尤其明显）；词语中的字也作为单字候选兜底。
  for (const entry of [...pool.chars, ...pool.words]) {
    for (const source of entry.syllables) {
      if (seen.has(source.text)) continue
      const syllable = syllableOfWord({ ...entry, text: source.text, length: 1, syllables: [source], chars: [source.text] })
      if (!syllable) continue
      const word: WordEntry = { ...entry, text: source.text, length: 1, syllables: [source], chars: [source.text] }
      if (!allAtomsKnown(word)) continue
      // 零声母字只在本课直接教授它们时入选，不占用其它课的单字填充额度
      if (syllable.initial === '' && !hitsFocus(word)) continue
      seen.add(source.text)
      if (hitsFocus(word)) primary.push(word)
      else if (needSameKeyFallback && sharesFocusKey(word)) sameKey.push(word)
      else known.push(word)
    }
  }

  // 目标音概率均衡：单字池中的 focus 字按音校准后抽样；不足部分用同键/已学字补齐。
  const seed = input.seed ?? 1
  const target = Math.max(1, input.count)
  const balanced = primary
    .map((word) => ({
      item: word,
      counts: targetCountsOf(word, focusAtoms),
      quality: 0.5 + Math.log1p(Math.max(0, word.freq)) / 10,
    }))
    .filter((candidate) => candidate.counts.size > 0)
  const sampled = sampleBalancedTargets(balanced, Math.min(target, balanced.length), seed)
  const sampledTexts = new Set(sampled.map((word) => word.text))
  const rest = [
    ...shuffleSeeded(primary.filter((word) => !sampledTexts.has(word.text)), seed),
    ...shuffleSeeded(sameKey, seed + 1),
    ...shuffleSeeded(known, seed + 2),
  ].filter((word) => !sampledTexts.has(word.text))
  return [...sampled, ...rest].slice(0, target).map((word) => buildPracticeWord(engine, word))
}

/** 词语/考核阶段：概率均衡抽词；词池不足的目标音用单字候选补足。 */
export function buildWordStageWords(input: WordStageInput): PracticeWord[] {
  const target = Math.max(1, input.targetWords)
  const seed = input.seed ?? 1
  const extraWords = fallbackCharsForSparseFocus(input.lesson, input.pool, target)
  const words = selectWords({
    words: input.pool.words,
    engine: input.engine,
    lesson: input.lesson,
    learnedAtoms: input.learnedAtoms,
    count: target,
    seed,
    extraWords,
  })
  return words.map((word) => buildPracticeWord(input.engine, word))
}

/**
 * 「以字代词」候选：某个 focus 在词池里的合法词太少，连按目标词数均分后的
 * 期望候选都不够时，把该音的单字加入候选。不做替换、不设特殊标记。
 */
function fallbackCharsForSparseFocus(
  lesson: LessonDef,
  pool: LessonPool,
  target: number,
): WordEntry[] {
  const focus = lesson.focusAtoms
  if (focus.length === 0) return []
  const expected = Math.ceil(target / focus.length)
  const support = new Map<AtomId, number>(focus.map((atom) => [atom, 0]))
  for (const word of pool.words) {
    for (const atom of targetCountsOf(word, focus).keys()) {
      support.set(atom, (support.get(atom) ?? 0) + 1)
    }
  }
  const extra: WordEntry[] = []
  const seen = new Set<string>()
  for (const atom of focus) {
    if ((support.get(atom) ?? 0) >= expected) continue
    for (const word of pool.chars) {
      if (seen.has(word.text)) continue
      if (!targetCountsOf(word, [atom]).has(atom)) continue
      seen.add(word.text)
      extra.push(word)
    }
  }
  return extra
}

/**
 * 教学页示例：课程数据已按「focus 原子学习顺序 × 该知识点包含的音节」生成 examples，
 * 这里按原顺序转成展示模型，并按音节（pinyin）去重：每个音一张卡，全量不截断。
 */
export function buildTutorialWords(input: TutorialInput): PracticeWord[] {
  const { engine, pool } = input
  const words: PracticeWord[] = []
  const seen = new Set<string>()
  for (const example of pool.examples) {
    const key = `${example.initial}${example.final}`
    if (seen.has(key)) continue
    seen.add(key)
    const syllable: Syllable = {
      text: example.char,
      pinyin: example.pinyin,
      initial: example.initial,
      final: example.final,
      zeroInitial: example.initial === '',
    }
    if (example.tone !== undefined) syllable.tone = example.tone as Syllable['tone']
    words.push(buildPracticeWordFromSyllable(engine, syllable))
  }
  return words
}

/** 课程原子在词中的命中（教学/调试辅助） */
export function wordMatchesAtom(word: WordEntry, atom: AtomId): boolean {
  return atomMatchesWord(atom, word)
}
