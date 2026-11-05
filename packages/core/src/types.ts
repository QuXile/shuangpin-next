/**
 * @shuangpin/core 公共类型契约（唯一权威）。
 *
 * 数据文件契约与 `data/schemes/index.json` / `data/schemes/<id>/scheme.json` /
 * `data/schemes/<id>/curriculum.json` / `data/lexicon/lexicon.json` 的真实结构一致；
 * 运行期模型（practice / session / lesson）也集中在这里，业务模块只 import 不重复声明。
 */

// ── 拼音 / 知识点 ─────────────────────────────────────────────

export type Initial =
  | '' | 'b' | 'p' | 'm' | 'f' | 'd' | 't' | 'n' | 'l' | 'g' | 'k' | 'h'
  | 'j' | 'q' | 'x' | 'zh' | 'ch' | 'sh' | 'r' | 'z' | 'c' | 's' | 'y' | 'w'

/** 33 个规范韵母（ü 一律记 v；ue/ve 并存） */
export type Final =
  | 'a' | 'o' | 'e' | 'i' | 'u' | 'v'
  | 'ai' | 'ei' | 'ui' | 'ao' | 'ou' | 'iu' | 'ie' | 've'
  | 'an' | 'en' | 'in' | 'un'
  | 'ang' | 'eng' | 'ing' | 'ong'
  | 'ia' | 'iao' | 'ian' | 'iang' | 'iong'
  | 'ua' | 'uo' | 'uai' | 'uan' | 'uang' | 'ue'

/** 音节韵母：er 只作为零声母音节出现，因此单独并入 */
export type SyllableFinal = Final | 'er'

export type Tone = 1 | 2 | 3 | 4 | 5

/** 规范音节（零声母由 initial === '' 表达；tone 缺省 = 轻声/无调） */
export interface Syllable {
  /** 对应汉字 */
  text: string
  /** 规范化无声调拼音（ü→v；如 chong / nv / lve） */
  pinyin: string
  initial: Initial
  final: SyllableFinal
  tone?: Tone
}

/** 词库/课程数据中的音节与 Syllable 同构（数据文件不写 zeroInitial） */
export type WordSyllable = Syllable

/** 音节查询入参（无 text/tone；zeroInitial 可省略，initial === '' 即零声母） */
export interface SyllableSpec {
  initial: Initial
  final: SyllableFinal
  zeroInitial?: boolean
}

export type SplitResult = { initial: Initial; final: SyllableFinal; zeroInitial: boolean } | null

export type AtomType = 'initial' | 'final' | 'zero'
export type AtomId = `${AtomType}:${string}`

export interface AtomRef {
  atomId: AtomId
  type: AtomType
  /** 声母/韵母/零声母音节名 */
  key: string
}

// ── 方案（data/schemes/<id>/scheme.json + index.json） ────────

export type SchemeType = 'compositional' | 'syllable-code' | 'hybrid'

export interface SameKeyGroup {
  key: string
  finals: string[]
}

export interface SchemeSource {
  repo: string
  file: string
  note: string
}

/** 单套方案键位数据（data/schemes/<id>/scheme.json 的真实字段） */
export interface SchemeDef {
  id: string
  name: string
  type: SchemeType
  /** 普通声母 → 键位数组（数组 = 多键/飞键，任一命中即正确） */
  initials: Record<string, string[]>
  /** 33 韵母 → 键位数组 */
  finals: Record<string, string[]>
  /** 12 个零声母音节 → 完整键序列（首条为主键） */
  zeroInitial: Record<string, string[]>
  /** 音节的推荐/标答键序列（完整音节 key → 完整键序列） */
  recommended?: Record<string, string>
  /** 推荐码之外的额外接受序列（完整音节 key → 完整键序列数组） */
  compatCodes?: Record<string, string[]>
  umlautNote: string
  sameKeyGroups: SameKeyGroup[]
  source: SchemeSource
  notes: string[]
}

/** 与全拼习惯的差异（由 engine.diff() 推导） */
export interface SchemeDiff {
  freeInitials: string[]
  learnInitials: string[]
  freeFinals: string[]
  learnFinals: string[]
  learnZero: string[]
  freeZero: string[]
}

/** 与全拼拼写完全一致的键位集合 */
export interface FreeAtomSets {
  readonly initials: ReadonlySet<string>
  readonly finals: ReadonlySet<string>
  readonly zero: ReadonlySet<string>
}

/** 键位图上的一个键：该键在方案中的角色（声母/韵母知识点） */
export interface LetterKey {
  letter: string
  atomIds: AtomId[]
}

export interface SchemeEngine {
  readonly def: SchemeDef
  /** 该音节所有可接受的键序列（数组外层 = 多解；用于判题容错） */
  acceptedSequences(syl: SyllableSpec): string[][]
  /** 主键序列（用于键帽显示；j/q/x/y + ü 取 U 键） */
  primarySequence(syl: SyllableSpec): string[]
  /** 判题：输入键序列（小写字母/分号）是否命中任一可接受序列 */
  judge(input: string[] | string, syl: SyllableSpec): boolean
  /** 该知识点的主键（用于键帽/提示；zero 返回整段序列单元素） */
  keysForAtom(atomId: AtomId): string[]
  /** 与全拼习惯的差异 */
  diff(): SchemeDiff
  /** 与全拼一致的 free 集合（缓存；课程/训练场/键位图共用唯一口径） */
  freeSets(): FreeAtomSets
  /** 声母键 × 韵母键的笛卡尔积（零声母为 zeroInitial 序列）；不受 recommended/compat 影响 */
  compositionSequence(syl: SyllableSpec): string[][]
  /** 键盘布局（3 行 qwerty；方案用到的 ';' 也会出现） */
  keyMap(): LetterKey[][]
}

export interface SchemeCodeEntry {
  syllable: string
  initial: Initial
  final: SyllableFinal
  zeroInitial: boolean
  /** 该音节命中的知识点（零声母 1 个，普通音节声母 + 韵母 2 个） */
  atoms: AtomId[]
  /** 主键组合：首个声母键 + 首个韵母键；零声母为该音节的整段序列 */
  composition: string
  /** 推荐码；仅当 scheme.recommended 存在时非 null（可能等于 composition） */
  recommended: string | null
  /** recommended 是否覆盖了组合（即推荐码 != 组合） */
  recommendedOverride: boolean
  /** 额外接受的兼容码（排除组合与推荐码、去重保序） */
  compat: string[]
  /** 标答（primarySequence join） */
  primary: string
  /** 全部可接受序列（acceptedSequences join） */
  accepted: string[]
}

export interface SchemeCodeAnalysis {
  entries: SchemeCodeEntry[]
  /** 无法在方案数据中解析的音节（recommended / compatCodes 里出现） */
  unresolved: string[]
  stats: {
    /** recommended 覆盖组合的条目数 */
    recommendedOverrides: number
    /** 带额外兼容码的条目数 */
    compat: number
  }
}

// ── 方案索引（data/schemes/index.json 的真实结构） ────────────

/** 单套方案在索引中的摘要（与 data/schemes/index.json.schemes[i] 一致） */
export interface SchemeSummary {
  id: string
  name: string
}

/** data/schemes/index.json（public 副本由 data:sync 生成） */
export interface SchemeIndexFile {
  defaultScheme: string
  /** 按 UI 顺序排列的方案 */
  schemes: SchemeSummary[]
  /** 有定制课程文件的方案 id；其余方案在运行期按方案数据生成通用课程 */
  customCourses: string[]
}

// ── 词库 / Lexicon（data/lexicon/lexicon.json） ──────────────

export interface WordEntry {
  text: string
  length: number
  freq: number
  /** 全量词表中的全局词频排名（从 1 开始） */
  freqRank?: number
  syllables: WordSyllable[]
  chars: string[]
}

/** 单个音节的代表字示例（lexicon.syllableExamples 的值） */
export interface SyllableExample {
  char: string
  pinyin: string
  pinyinTone: string
  initial: Initial
  final: SyllableFinal
  tone?: Tone
}

/** 词库源数据中的词条：只存文本与词频，拼音由运行时解析 */
export interface LexiconEntry {
  text: string
  freq: number
}

/** data/lexicon/lexicon.json 契约（单份数据：词条 + 音节示例） */
export interface Lexicon {
  schemaVersion: number
  entries: LexiconEntry[]
  syllableExamples: Record<string, SyllableExample>
}

/** 运行时解析后的词表（课程 / 入门课 / 练习场消费） */
export interface ResolvedLexicon {
  words: WordEntry[]
  chars: WordEntry[]
  syllableExamples: Record<string, SyllableExample>
}



/** 单课派生词池：words/chars 来自统一 Lexicon，examples 按 lesson.focusAtoms 展开 */
export interface LessonPool {
  lessonId: string
  words: WordEntry[]
  chars: WordEntry[]
  examples: SyllableExample[]
}

// ── 课程（data/schemes/<id>/curriculum.json） ─────────────────

export type LessonKind = 'intro' | 'drill' | 'review' | 'exam'

export interface WordPlan {
  maxUnfamiliar: number
  lengthRange: [number, number]
}

export type PassMode = 'accuracy' | 'speed' | 'accuracy-speed'

export interface PassCriteria {
  accuracy: number
  /** accuracy：普通准确率课；speed：速度训练；accuracy-speed：准确率 + 速度考核 */
  mode: PassMode
  /** 通过所需的最低速度（正确字/分钟） */
  minCpm?: number
  /** 速度星级的三个门槛：1★通过、2★、3★ */
  starCpm?: [number, number, number]
}

/** 运行时派生的原子展示信息（键位 + 记忆锚点）；不写入课程数据文件 */
export interface AtomMemory {
  atomId: AtomId
  type: AtomType
  pinyin: string
  keys: string[]
  free: boolean
  /** 键位记忆锚点：与该知识点绑定的高频字，0–5 个 */
  anchors: string[]
  /** 一句话记忆法 */
  mnemonic?: string
}

export interface LessonDef {
  id: string
  chapterId: string
  kind: LessonKind
  title: string
  desc: string
  focusAtoms: AtomId[]
  /** 会阻塞选词的原子（只有 initial/final） */
  blockingAtoms: AtomId[]
  /** 不阻塞选词的 focus（zero） */
  nonBlockingAtoms: AtomId[]
  prerequisites: AtomId[]
  wordPlan: WordPlan
  /** 入门课无评分门槛（完成即通过） */
  passCriteria?: PassCriteria
  /** 人工维护的本课备注与技巧（推荐码 / 兼容码等由运行时派生，不写入数据） */
  tips?: string[]
}

export interface ChapterDef {
  id: string
  order: number
  title: string
  subtitle: string
}

export interface Curriculum {
  schemeId: string
  chapters: ChapterDef[]
  lessons: LessonDef[]
}

// ── 练习展示模型 ───────────────────────────────────────────────

export interface PracticeCap {
  key: string
  role: 'initial' | 'final'
  atomId: AtomId
}

export interface PracticeSyllable {
  text: string
  /** 无调规范拼音（ü→v） */
  pinyin: string
  /** 带声调显示的拼音（ü 正常显示） */
  pinyinTone: string
  initial: Initial
  final: SyllableFinal
  zeroInitial: boolean
  /** 主键序列上的键帽 */
  caps: PracticeCap[]
  /** 所有可接受键序列（join 后，用于判题） */
  accepted: string[]
}

export interface PracticeWord {
  text: string
  chars: string[]
  syllables: PracticeSyllable[]
  caps: PracticeCap[]
}

// ── 选词 ──────────────────────────────────────────────────────

export interface SelectWordsInput {
  words: readonly WordEntry[]
  engine: SchemeEngine
  lesson: LessonDef
  /** 已学原子（不含 free；free 由 engine.freeSets() 自动视为已学） */
  learnedAtoms: readonly AtomId[]
  count: number
  seed?: number
  /** 允许出现的非 focus 未知阻塞原子数（默认取 lesson.wordPlan.maxUnfamiliar） */
  maxUnfamiliar?: number
  /** 词长过滤（默认取 lesson.wordPlan.lengthRange） */
  lengthRange?: [number, number]
  /** 词池没有足够合法词时加入的单字候选；绕过词长过滤 */
  extraWords?: readonly WordEntry[]
}

// ── 练习会话 ──────────────────────────────────────────────────

export type SessionPhase = 'playing' | 'finished'

export type FeedbackKind =
  | 'idle'
  | 'typing'
  | 'wrong'
  | 'char-complete'
  | 'word-complete'
  | 'session-complete'

/** 错误键位的一条：实际按下的键 / 应该按的键 / 次数（由 SessionState.keyErrors 解析） */
export interface KeyErrorEntry {
  typed: string
  expected: string
  count: number
}

/** 错误键位的详细上下文：除键位对外，记录该键位对应的知识点，便于展示音（声母/韵母/零声母）。 */
export interface KeyErrorDetail {
  typed: string
  expected: string
  atomId?: AtomId
  count: number
}

export interface SessionFeedback {
  kind: FeedbackKind
  message?: string
  /** 错误时展示的正确键位 */
  expected?: string[]
  /** 错误时用户已输入的键位 */
  input?: string[]
  wordText?: string
}

export interface SessionWordState {
  word: PracticeWord
  charIndex: number
  /** 当前字已输入的键 */
  input: string[]
  /** 已完成字的实际输入（保留别名，不强行改写成主键） */
  charInputs: string[][]
}

export interface SessionStats {
  totalChars: number
  correctChars: number
  errors: number
  keystrokes: number
  wordsCompleted: number
  startedAt: number
  finishedAt?: number
  totalMs: number
}

export interface SessionState {
  words: SessionWordState[]
  index: number
  phase: SessionPhase
  lastFeedback: SessionFeedback
  stats: SessionStats
  /** 已触发过「第 3 次错误揭示答案」的字（cell key = `${wordIndex}:${charIndex}`） */
  revealed: ReadonlySet<string>
  /** 当前字最近一次错误输入（提交整字时记录；退格/清空解除） */
  wrongInputs: ReadonlyMap<string, string[]>
  /** 每个字累计错误次数（第 3 次错误触发 revealed） */
  cellErrors: ReadonlyMap<string, number>
  /** 错误键位统计：key 为「实际按下的键|应该按的键」，value 为次数 */
  keyErrors: ReadonlyMap<string, number>
  /** 错误键位详细统计：key 为「实际按键|应按键|知识点」，value 含次数与知识点上下文 */
  keyErrorDetails: ReadonlyMap<string, KeyErrorDetail>
}

export interface SessionOptions {
  words: PracticeWord[]
  now?: number
}

/** 延伸批次选项：批次末词完成后调用，返回空数组表示结束延伸（会话结束） */
export interface ExtendWordsOptions {
  extendWords?: () => PracticeWord[]
}

export interface KeyResult {
  state: SessionState
  feedback: SessionFeedback
}

export interface SessionMetrics {
  accuracy: number
  cpm: number
  completedChars: number
  completedWords: number
  totalChars: number
  finished: boolean
}

// ── 阶段 / 评分 / 组卷 ────────────────────────────────────────

export type PracticeStage = 'single' | 'word' | 'exam'

export interface LessonMetrics {
  accuracy: number
  cpm: number
  /** 本阶段是否揭示过答案（第 3 次错误自动揭示） */
  revealed: boolean
}

/** 阶段门槛计算所需的进度指标 */
export interface StageGateMetrics {
  accuracy: number
  cpm: number
  completedWords: number
}

/** 阶段门槛：最低词数（+ 无提示考核阶段的考核标准）与未达标原因 */
export interface StageGate {
  stage: PracticeStage
  minWords: number
  strict: boolean
  completedWords: number
  met: boolean
  reasons: string[]
}

export interface LessonResult {
  passed: boolean
  stars: 0 | 1 | 2 | 3
  /** 未通过/星级说明（UI 用于提示） */
  reasons: string[]
}

export interface PassCriteriaLine {
  label: string
  text: string
}

/** 指标档位（展示用；数值已是百分数或 WPM，不参与核心判定） */
export interface MetricTier {
  /** 本档下界（含）；null 表示低于第一档。 */
  min: number | null
  /** 本档上界（不含）；null 表示高于最后一档。 */
  max: number | null
  /** 展示标签，例如 `<85%`、`85–90%`、`≥95%`。 */
  label: string
  /** 该档对应星级；null 表示该指标只作通过底线，不参与星级分档。 */
  stars: 0 | 1 | 2 | 3 | null
}

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

// ── 训练场装配 ────────────────────────────────────────────────

export interface TrainingScope {
  /** 选中的声母 */
  initials: readonly string[]
  finals: readonly string[]
  /** 选中的零声母音节（按韵母名，如 a/ai/an…）；空数组表示不练零声母 */
  zeroFinals?: readonly string[]
}

export interface ParsedArticle {
  chars: string[]
  /** 每行 1–5 个汉字（由标点/非汉字或满 5 触发换行） */
  lines: string[][]
}

/**
 * 与全拼拼写完全一致的键位集合（训练场「全拼沿用」胶囊的数组视图）。
 *
 * 引擎侧的规范形状是 `FreeAtomSets`（Set，字段名 `zero`）；本类型是训练场消费的
 * 数组 adapter（字段名 `zeroFinals`）。两者由 `freeTrainingAtoms()` / `freeAtomsOf()` 转换，
 * 不要在同一调用链里混用。
 */
export interface TrainingCommonAtoms {
  initials: string[]
  finals: string[]
  zeroFinals: string[]
}

export interface TrainingAtomOptions {
  initials: string[]
  finals: string[]
  /** 零声母音节（按方案 zeroInitial 的键） */
  zeroFinals: string[]
}

export interface ArticleCell {
  char: string
  /** 训练序列中的词下标；null = 读音无法解析、已跳过 */
  wordIndex: number | null
}

export interface ArticlePlan {
  cells: ArticleCell[][]
  chars: string[]
  skipped: number
}

// ── 课程进度 ──────────────────────────────────────────────────

export type LessonState = 'passed' | 'available' | 'locked'

export interface LessonProgress {
  passed: boolean
  stars: number
  bestAccuracy: number
  attempts: number
  updatedAt: number
  /** 已完成过目标的非考核阶段（single/word）；再次进入可直接继续 */
  clearedStages?: PracticeStage[]
}
