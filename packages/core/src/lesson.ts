/**
 * 课程装配与门槛/评分（合并原 stages.ts + scoring.ts + 课池派生）。
 *
 * 阶段口径（docs/ARCHITECTURE.md）：
 * - drill：single → word → exam；review：exam；exam：exam；
 * - 各阶段最低词数由 `KIND_STAGE_MIN_WORDS` 按课型给出；
 * - 无提示考核阶段（exam）在最低词数外还要达到本课评分标准（stageGate）；
 * - 教学页示例：由 Lexicon.syllableExamples 派生的每音节代表字。
 *
 * 评分口径（唯一权威）：
 * - 普通课（accuracy）：完成即通过；星级按正确率（★★≥90%、★★★≥95% 且未揭示）；
 * - speed / accuracy-speed：通过 = 正确率 ≥ criteria.accuracy 且 cpm ≥ minCpm；
 * - 星级：speed 按 starCpm；accuracy-speed 另要求正确率 90/95 与未揭示；
 * - 入门课完成即通过，统一 ★★★。
 */
import type {
  AtomId,
  AtomMemory,
  LessonDef,
  LessonKind,
  LessonMetrics,
  LessonResult,
  LessonPool,
  ResolvedLexicon,
  MetricTier,
  PassCriteria,
  PassCriteriaLine,
  PassMode,
  PracticeStage,
  PracticeWord,
  SchemeCodeEntry,
  SchemeEngine,
  StageGate,
  StageGateMetrics,
  StageInput,
  Syllable,
  TutorialInput,
  WordEntry,
  WordStageInput,
} from './types.ts'
import { FINALS, INITIALS, atomId, focusHitsOf, parseAtomId } from './pinyin.ts'
import { analyzeSchemeCodes, isFreeAtom } from './scheme.ts'
import { mulberry32, selectWords, shuffle } from './selector.ts'
import { buildPracticeWord, buildPracticeWordFromSyllable } from './session.ts'

// ── 阶段计划 ──────────────────────────────────────────────────

/** 阶段顺序（运行时值；web 持久化校验 / 训练场阶段选择共用） */
export const PRACTICE_STAGES: readonly PracticeStage[] = ['single', 'word', 'exam']

/**
 * 各课程类型的阶段最低词数：
 * - drill：字 15 → 词语部分提示 15 → 无提示考核 25；
 * - review：无提示 50；exam：无提示 100。
 */
export const KIND_STAGE_MIN_WORDS: Record<LessonKind, Partial<Record<PracticeStage, number>>> = {
  intro: {},
  drill: { single: 15, word: 15, exam: 25 },
  review: { exam: 50 },
  exam: { exam: 100 },
}

const STAGE_ORDER: Record<LessonKind, PracticeStage[]> = {
  intro: [],
  drill: ['single', 'word', 'exam'],
  review: ['exam'],
  exam: ['exam'],
}

/** 本课包含的练习阶段（不含 tutorial；intro 返回空数组，走独立入门组件） */
export function lessonStages(lesson: LessonDef): PracticeStage[] {
  return [...STAGE_ORDER[lesson.kind]]
}

/** 本课各阶段最低完成词数 */
export function lessonStageMinWords(lesson: LessonDef): Partial<Record<PracticeStage, number>> {
  return { ...KIND_STAGE_MIN_WORDS[lesson.kind] }
}

/**
 * 阶段门槛：字 / 词语部分提示阶段只看最低词数；无提示考核阶段（每课最后一场）
 * 还要求达到本课考核标准（正确率 ≥ criteria.accuracy，速度课再加 minCpm）。
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
        reasons.push(
          `正确率 ${Math.round(metrics.accuracy * 100)}% < ${Math.round(criteria.accuracy * 100)}%`,
        )
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

// ── 课池派生 ──────────────────────────────────────────────────

/**
 * 从统一 Lexicon 派生某一课所需的词/字/教学示例：
 * - initial focus 展开该声母 × 全部韵母（含 er）；
 * - final focus 展开全部声母 × 该韵母（不含零声母音节：零声母是独立知识点）；
 * - zero focus 只取该音节自身；
 * - 示例全部来自 Lexicon.syllableExamples（405 个音节示例，由词表校验保证覆盖）。
 */
export function buildLessonPool(lesson: LessonDef, lexicon: ResolvedLexicon): LessonPool {
  const examples: LessonPool['examples'] = []
  const seen = new Set<string>()
  const add = (syllable: string) => {
    if (seen.has(syllable)) return
    const example = lexicon.syllableExamples[syllable]
    if (!example) return
    examples.push(example)
    seen.add(syllable)
  }
  for (const atom of lesson.focusAtoms) {
    if (atom.startsWith('initial:')) {
      const initial = atom.slice('initial:'.length)
      for (const final of [...FINALS, 'er']) add(`${initial}${final}`)
    } else if (atom.startsWith('final:')) {
      const final = atom.slice('final:'.length)
      // 只展开真实声母：零声母音节（如 ao 单独成音）是 zero: 知识点，
      // 与 final: 同名字但不应出现在韵母课的示例里。
      for (const initial of INITIALS) add(`${initial}${final}`)
    } else if (atom.startsWith('zero:')) {
      add(atom.slice('zero:'.length))
    }
  }
  return { lessonId: lesson.id, words: lexicon.words, chars: lexicon.chars, examples }
}

// ── 原子展示 / 编码 tips（运行时派生，不写入课程数据） ──────────

/** 生成课程 tips 只允许两类前缀；推荐码 / 兼容码由运行时按课程范围归位。 */
export const CODE_TIP_RECOMMENDED_PREFIX = '推荐码：'
export const CODE_TIP_COMPAT_PREFIX = '兼容编码：'
export const CODE_TIP_PREFIXES: readonly string[] = Object.freeze([
  CODE_TIP_RECOMMENDED_PREFIX,
  CODE_TIP_COMPAT_PREFIX,
])
/** 一条 tips 里最多压缩几个编码条目（C 双拼这类例外多的方案会分多条 tip）。 */
const CODE_TIPS_CHUNK = 5

function upperKeys(keys: readonly string[]): string {
  return keys.map((key) => key.toUpperCase()).join(' / ')
}

function tableKeysOf(table: Record<string, string[]> | undefined, key: string): string[] {
  return (table?.[key] ?? []).map((value) => String(value).toLowerCase())
}

/** 与主键同键的另一侧原子：声母找同键韵母，韵母找同键声母。 */
function sameKeyPartners(engine: SchemeEngine, type: 'initial' | 'final', primaryKey: string): string[] {
  const table = type === 'initial' ? engine.def.finals : engine.def.initials
  const candidates = type === 'initial' ? FINALS : INITIALS
  return candidates.filter((candidate) => tableKeysOf(table, candidate).includes(primaryKey))
}

function partnerMnemonic(
  type: 'initial' | 'final',
  key: string,
  partner: string,
  primaryKey: string,
): string {
  const left = type === 'initial' ? key : partner
  const right = type === 'initial' ? partner : key
  return `${left.toUpperCase()} + ${right.toUpperCase()} = ${(left + right).toUpperCase()}（同在 ${primaryKey.toUpperCase()} 键）`
}

/**
 * 从方案键位 + 当前单字表派生某原子的展示与记忆锚点（tutorial 实时调用）。
 * 只在「同键另一侧原子」能组成真实音节且词表有对应单字时生成 mnemonic / anchors；
 * 没有可用同键组合时只返回键位，不给示例字。
 */
export function buildAtomMemory(
  engine: SchemeEngine,
  atom: AtomId,
  chars: readonly WordEntry[] = [],
): AtomMemory | null {
  const ref = parseAtomId(atom)
  if (!ref) return null
  const { type, key } = ref
  const keys = engine.keysForAtom(atom)
  const memory: AtomMemory = {
    atomId: atom,
    type,
    pinyin: key,
    keys: [...keys],
    free: isFreeAtom(engine, atom),
    anchors: [],
  }
  const primaryKey = keys[0]?.toLowerCase()
  if (!primaryKey) return memory
  if (type === 'zero') {
    memory.mnemonic = `零声母 ${key} = ${upperKeys(keys)}，整段输入`
    return memory
  }

  const anchorsOf = (predicate: (syllable: Syllable) => boolean): string[] => {
    const anchors: string[] = []
    for (const entry of chars) {
      if (anchors.length >= 5) break
      const syllable = entry.syllables[0]
      if (syllable && predicate(syllable)) anchors.push(entry.text)
    }
    return anchors
  }

  const partners = sameKeyPartners(engine, type, primaryKey)
  for (const partner of partners) {
    const anchors = anchorsOf((syllable) =>
      type === 'initial'
        ? syllable.initial === key && syllable.final === partner
        : syllable.initial === partner && syllable.final === key,
    )
    if (anchors.length > 0) {
      memory.anchors = anchors
      memory.mnemonic = partnerMnemonic(type, key, partner, primaryKey)
      return memory
    }
  }

  return memory
}

function formatCodeEntry(entry: SchemeCodeEntry): string {
  const upper = (value: string) => value.toUpperCase()
  const parts: string[] = []
  if (entry.recommendedOverride && entry.recommended) {
    parts.push(
      `${CODE_TIP_RECOMMENDED_PREFIX}${entry.syllable} 所推荐的键位组合为特别的 ${upper(entry.recommended)}`,
    )
  }
  if (entry.compat.length > 0) {
    parts.push(
      `${CODE_TIP_COMPAT_PREFIX}${entry.syllable} 兼容的特别键位组合还包括 ${entry.compat.map(upper).join(' / ')}`,
    )
  }
  return parts.join('；')
}

/**
 * 推荐码例外 / 兼容编码 tips 的唯一归位规则：
 * 放到「范围首次包含该完整音节」的课程（即该音节非 free 原子中最晚被学到的原子所在课）；
 * 完整音节没有对应课程（含全部由 free 原子组成）时，统一放到第一节正式练习课
 * （入门课没有练习/tips 展示位）。
 */
export function buildLessonCodeTips(engine: SchemeEngine, lessons: readonly LessonDef[]): Map<string, string[]> {
  const result = new Map<string, string[]>()
  if (lessons.length === 0) return result
  const fallbackIndex = Math.max(0, lessons.findIndex((lesson) => lesson.kind !== 'intro'))

  const lessonIndexOfAtom = new Map<AtomId, number>()
  lessons.forEach((lesson, index) => {
    for (const atom of [...lesson.prerequisites, ...lesson.focusAtoms]) {
      if (!lessonIndexOfAtom.has(atom)) lessonIndexOfAtom.set(atom, index)
    }
  })

  const groups = new Map<number, SchemeCodeEntry[]>()
  for (const entry of analyzeSchemeCodes(engine.def).entries) {
    if (!entry.recommendedOverride && entry.compat.length === 0) continue
    const nonFreeAtoms = entry.atoms.filter((atom) => !isFreeAtom(engine, atom))
    let targetIndex = fallbackIndex
    if (nonFreeAtoms.length > 0) {
      const indexes = nonFreeAtoms.map((atom) => lessonIndexOfAtom.get(atom))
      const complete = indexes.every((index): index is number => index !== undefined)
      targetIndex = complete ? Math.max(...(indexes as number[])) : fallbackIndex
    }
    const list = groups.get(targetIndex) ?? []
    list.push(entry)
    groups.set(targetIndex, list)
  }

  for (const [index, entries] of groups) {
    const lesson = lessons[index]
    if (!lesson) continue
    entries.sort((a, b) => a.syllable.localeCompare(b.syllable))
    const tips: string[] = []
    for (let start = 0; start < entries.length; start += CODE_TIPS_CHUNK) {
      tips.push(entries.slice(start, start + CODE_TIPS_CHUNK).map(formatCodeEntry).join('；'))
    }
    if (tips.length > 0) result.set(lesson.id, tips)
  }
  return result
}

// ── 阶段内容装配 ──────────────────────────────────────────────

/**
 * 单字阶段：对当前可学的整音做轮转抽取。
 * - 每轮每个整音最多取一个单字；每轮按 seed 打乱整音顺序；
 * - 每个整音从 top10 字符中得到一个字；目标数超过整音数时重新洗牌进入下一轮。
 */
export function buildSingleCharWords(input: StageInput): PracticeWord[] {
  const { engine, lesson, pool, learnedAtoms } = input
  const learned = new Set(learnedAtoms)
  const free = engine.freeSets()
  const focusAtoms = lesson.focusAtoms
  const focusSet = new Set(focusAtoms)
  const seed = input.seed ?? 1
  const target = Math.max(1, input.count)

  const groups = new Map<string, WordEntry[]>()
  for (const entry of pool.chars) {
    const source = entry.syllables[0]
    if (!source) continue
    if (source.initial === '') {
      const atom = atomId('zero', source.final)
      if (!focusSet.has(atom) && !learned.has(atom)) continue
    } else {
      const initialAtom = atomId('initial', source.initial)
      const finalAtom = atomId('final', source.final)
      if (!free.initials.has(source.initial) && !learned.has(initialAtom) && !focusSet.has(initialAtom)) {
        continue
      }
      if (!free.finals.has(source.final) && !learned.has(finalAtom) && !focusSet.has(finalAtom)) {
        continue
      }
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

/** 目标音的逐音节出现次数（同一音在一个词中出现多次会计多次） */
function targetCountsOf(word: WordEntry, focusAtoms: readonly AtomId[]): Map<AtomId, number> {
  if (focusAtoms.length === 0) return new Map()
  const focus = new Set(focusAtoms)
  const counts = new Map<AtomId, number>()
  for (const syllable of word.syllables) {
    if (syllable.initial === '') {
      const atom = atomId('zero', syllable.final)
      if (focus.has(atom)) counts.set(atom, (counts.get(atom) ?? 0) + 1)
      continue
    }
    const initialAtom = atomId('initial', syllable.initial)
    if (focus.has(initialAtom)) counts.set(initialAtom, (counts.get(initialAtom) ?? 0) + 1)
    const finalAtom = atomId('final', syllable.final)
    if (focus.has(finalAtom)) counts.set(finalAtom, (counts.get(finalAtom) ?? 0) + 1)
  }
  return counts
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
    }
    if (example.tone !== undefined) syllable.tone = example.tone
    words.push(buildPracticeWordFromSyllable(engine, syllable))
  }
  return words
}

// ── 评分 ──────────────────────────────────────────────────────

const STAR2_ACCURACY = 0.9
const STAR3_ACCURACY = 0.95

function buildTiers(thresholds: readonly number[], unit: string, graded: boolean): MetricTier[] {
  const values = [
    ...new Set(thresholds.filter((value) => Number.isFinite(value)).map((value) => Math.round(value))),
  ].sort((a, b) => a - b)
  if (values.length === 0) return []
  const tiers: MetricTier[] = []
  const starsAt = (index: number): 0 | 1 | 2 | 3 | null =>
    graded ? (Math.min(index, 3) as 0 | 1 | 2 | 3) : null
  tiers.push({ min: null, max: values[0]!, label: `<${values[0]}${unit}`, stars: starsAt(0) })
  for (let index = 1; index < values.length; index += 1) {
    tiers.push({
      min: values[index - 1]!,
      max: values[index]!,
      label: `${values[index - 1]}–${values[index]}${unit}`,
      stars: starsAt(index),
    })
  }
  const last = values[values.length - 1]!
  tiers.push({ min: last, max: null, label: `≥${last}${unit}`, stars: starsAt(values.length) })
  return tiers
}

/** 速度星级的默认门槛（与 evaluate/describe/tiers 共用同一份，避免三处漂移） */
function defaultStarCpm(criteria: PassCriteria, mode: PassMode): [number, number, number] {
  if (criteria.starCpm) return criteria.starCpm
  const minCpm = criteria.minCpm ?? 0
  return mode === 'speed' ? [minCpm, 45, 60] : [minCpm, 40, 50]
}

/**
 * 正确率档位：
 * - 普通/准确率+速度：通过线、90%、95% 四档；
 * - 速度模式：正确率作为通过底线。
 */
export function accuracyTiers(criteria: PassCriteria): MetricTier[] {
  const thresholds = [Math.round(criteria.accuracy * 100)]
  if (criteria.mode !== 'speed') thresholds.push(Math.round(STAR2_ACCURACY * 100), Math.round(STAR3_ACCURACY * 100))
  return buildTiers(thresholds, '%', true)
}

/**
 * 速度档位：
 * - speed / accuracy-speed：最低速度 + 两档星级速度，四档；
 * - accuracy + minCpm：速度只作通过底线，低于底线 0 星，达到底线即满足全部星级行，显示 3 星；
 * - 未配置速度要求：null，只显示原始速度。
 */
export function speedTiers(criteria: PassCriteria): MetricTier[] | null {
  const minCpm = criteria.minCpm ?? 0
  if (criteria.mode === 'speed' || criteria.mode === 'accuracy-speed') {
    return buildTiers([minCpm, ...defaultStarCpm(criteria, criteria.mode)].filter((value) => value > 0), ' WPM', true)
  }
  if (minCpm <= 0) return null
  const tiers = buildTiers([minCpm], ' WPM', false)
  return tiers.map((tier, index) => ({
    ...tier,
    stars: index === tiers.length - 1 ? 3 : 0,
  }))
}

/** 当前值落入的档位；tiers 必须来自 accuracyTiers / speedTiers。 */
export function tierOf(tiers: readonly MetricTier[], value: number): MetricTier | null {
  if (tiers.length === 0) return null
  for (const tier of tiers) {
    if (tier.max === null || value < tier.max) return tier
  }
  return tiers[tiers.length - 1] ?? null
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`
}

/** 判定一节课是否通过、获得几星（课程数据缺失评分配置时显式报错） */
export function evaluateLesson(lesson: LessonDef, metrics: LessonMetrics): LessonResult {
  if (lesson.kind === 'intro') {
    // 入门课完成即通过，并统一记三星（与普通课程同一套星级展示）
    return { passed: true, stars: 3, reasons: [] }
  }
  const criteria = lesson.passCriteria
  if (!criteria) {
    throw new Error(`课程 ${lesson.id} 缺少 passCriteria`)
  }
  const mode = criteria.mode
  if (mode === 'accuracy') {
    // 普通课 / 带速度底线的复习课：星级按正确率，速度底线不达标则不通过
    const minCpm = criteria.minCpm ?? 0
    if (minCpm > 0 && metrics.cpm < minCpm) {
      return {
        passed: false,
        stars: 0,
        reasons: [`速度 ${metrics.cpm} < ${minCpm} WPM`],
      }
    }
    let accuracyStars: 1 | 2 | 3 = 1
    if (metrics.accuracy >= STAR2_ACCURACY) accuracyStars = 2
    if (metrics.accuracy >= STAR3_ACCURACY && !metrics.revealed) accuracyStars = 3
    return { passed: true, stars: accuracyStars, reasons: [] }
  }
  const speedRequired = mode === 'speed' || mode === 'accuracy-speed'
  const minCpm = criteria.minCpm ?? 0
  const accuracyOk = metrics.accuracy >= criteria.accuracy
  const speedOk = !speedRequired || metrics.cpm >= minCpm
  if (!accuracyOk || !speedOk) {
    const reasons: string[] = []
    if (!accuracyOk) reasons.push(`正确率 ${pct(metrics.accuracy)} < ${pct(criteria.accuracy)}`)
    if (!speedOk) reasons.push(`速度 ${metrics.cpm} < ${minCpm} WPM`)
    return { passed: false, stars: 0, reasons }
  }

  const thresholds = defaultStarCpm(criteria, mode)
  let stars: 1 | 2 | 3 = 1
  if (mode === 'speed') {
    if (metrics.cpm >= thresholds[1]) stars = 2
    if (metrics.cpm >= thresholds[2]) stars = 3
  } else {
    // accuracy-speed
    if (metrics.accuracy >= STAR2_ACCURACY && metrics.cpm >= thresholds[1]) stars = 2
    if (
      metrics.accuracy >= STAR3_ACCURACY &&
      metrics.cpm >= thresholds[2] &&
      !metrics.revealed
    ) {
      stars = 3
    }
  }
  return { passed: true, stars, reasons: [] }
}

/**
 * 生成「评分规则」展示文案（与 evaluateLesson 同一份门槛数据）。
 * 只展示 1–3 星三档，1★ 即最低通过。
 */
export function describePassCriteria(criteria: PassCriteria): PassCriteriaLine[] {
  const mode = criteria.mode
  const minCpm = criteria.minCpm ?? 0
  const accuracy = pct(criteria.accuracy)
  const speedFloor = minCpm > 0 ? `，速度 ≥${minCpm} WPM` : ''
  if (mode === 'speed') {
    const thresholds = defaultStarCpm(criteria, mode)
    return [
      { label: '★', text: `正确率 ≥${accuracy}，速度 ≥${thresholds[0]} WPM。` },
      { label: '★★', text: `正确率 ≥${accuracy}，速度 ≥${thresholds[1]} WPM。` },
      { label: '★★★', text: `正确率 ≥${accuracy}，速度 ≥${thresholds[2]} WPM。` },
    ]
  }
  if (mode === 'accuracy-speed') {
    const thresholds = defaultStarCpm(criteria, mode)
    return [
      { label: '★', text: `正确率 ≥${accuracy} 且 ≥${thresholds[0]} WPM。` },
      { label: '★★', text: `正确率 ≥${Math.round(STAR2_ACCURACY * 100)}% 且 ≥${thresholds[1]} WPM。` },
      { label: '★★★', text: `正确率 ≥${Math.round(STAR3_ACCURACY * 100)}%、≥${thresholds[2]} WPM 且未揭示答案。` },
    ]
  }
  return [
    { label: '★', text: `正确率 ≥${accuracy}${speedFloor}。` },
    { label: '★★', text: `正确率 ≥${Math.round(STAR2_ACCURACY * 100)}%${speedFloor}。` },
    { label: '★★★', text: `正确率 ≥${Math.round(STAR3_ACCURACY * 100)}%${speedFloor} 且未揭示答案。` },
  ]
}
