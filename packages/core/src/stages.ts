/**
 * 阶段（单字 / 词语 / 考核）计划与内容装配：web 只调用这里的纯函数。
 *
 * 口径（docs/ARCHITECTURE.md）：
 * - drill：single → word；review：word；exam：word（混合练习）→ exam；
 * - 每课目标由课程数据 `stageTargets` 给出（缺省按课程类型用 KIND_STAGE_TARGETS）；
 * - 阶段实际目标 = 生成词的总字数（整词对齐）；
 * - 教学页示例：课程数据生成的 examples（每个合法音节一张卡、学习顺序）按原顺序展示。
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
  WordEntry,
} from './types.ts'
import { atomMatchesWord, focusHitsOf } from './atoms.ts'
import { buildPracticeWord, buildPracticeWordFromSyllable } from './practice.ts'
import { mulberry32, shuffle } from './random.ts'
import { selectWords, targetCountsOf } from './selector.ts'

/**
 * 各课程类型的阶段最低词数：
 * - drill：字 15 → 词语部分提示 15 → 无提示考核 25；
 * - review：无提示 50；
 * - exam：无提示 100。
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
 * 阶段门槛：字 / 词语部分提示阶段只看最低词数；无提示考核阶段（每课最后一场）
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

/** 提示级别由阶段唯一决定：单字完整提示、词语部分提示、考核无提示 */
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




/**
 * 单字阶段：对当前可学的整音做轮转抽取。
 * - 每轮每个整音最多取一个单字；
 * - 每轮按 seed 打乱整音顺序；
 * - 每个整音从 top10 字符中得到一个字；
 * - 目标数超过整音数时重新洗牌进入下一轮。
 */
export function buildSingleCharWords(input: StageInput): PracticeWord[] {
  const { engine, lesson, pool, learnedAtoms } = input
  const learned = new Set(learnedAtoms)
  const diff = engine.diff()
  const freeInitials = new Set(diff.freeInitials)
  const freeFinals = new Set(diff.freeFinals)
  const focusAtoms = lesson.focusAtoms
  const focusSet = new Set(focusAtoms)
  const seed = input.seed ?? 1
  const target = Math.max(1, input.count)

  const groups = new Map<string, WordEntry[]>()
  for (const entry of pool.chars) {
    const source = entry.syllables[0]
    if (!source) continue
    if (source.initial === '') {
      if (!focusSet.has(`zero:${source.final}` as AtomId) && !learned.has(`zero:${source.final}` as AtomId)) continue
    } else {
      if (!freeInitials.has(source.initial) && !learned.has(`initial:${source.initial}` as AtomId) && !focusSet.has(`initial:${source.initial}` as AtomId)) continue
      if (!freeFinals.has(source.final) && !learned.has(`final:${source.final}` as AtomId) && !focusSet.has(`final:${source.final}` as AtomId)) continue
    }
    const key = source.initial ? `${source.initial}${source.final}` : source.final
    const list = groups.get(key) ?? []
    if (!list.some((word) => word.text === entry.text)) list.push(entry)
    groups.set(key, list)
  }

  const focusKeys: string[] = []
  const otherKeys: string[] = []
  for (const [key, list] of groups) {
    const isFocus = list.some((word) => focusHitsOf(word, focusAtoms).length > 0)
    if (isFocus) focusKeys.push(key)
    else otherKeys.push(key)
  }
  const order = focusKeys.length > 0 ? focusKeys : otherKeys
  if (order.length === 0) return []

  const result: WordEntry[] = []
  let round = 0
  while (result.length < target) {
    const shuffledKeys = shuffle(order, mulberry32(seed + round * 104729))
    const rng = mulberry32(seed * 31 + round)
    for (const key of shuffledKeys) {
      if (result.length >= target) break
      const list = groups.get(key) ?? []
      if (list.length === 0) continue
      result.push(list[Math.floor(rng() * list.length)] ?? list[0]!)
    }
    round += 1
    if (round > target * 2 + 10) break
  }
  return result.map((word) => buildPracticeWord(engine, word))
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
 * 这里按原顺序转成展示模型，并按音节（pinyin）去重：每个音一张卡。
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
