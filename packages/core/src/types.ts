/**
 * @shuangpin/core 公共类型契约（唯一权威）。
 *
 * 设计说明见 docs/ARCHITECTURE.md。
 * Web 端只依赖这里的类型与 index.ts 暴露的函数，不在 UI 层改判题/统计/评分规则。
 */

// ── 拼音基础 ──────────────────────────────────────────────────

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

export interface Syllable {
  /** 对应汉字 */
  text: string
  /** 规范化无声调拼音（ü→v；如 chong / nv / lve） */
  pinyin: string
  initial: Initial
  final: SyllableFinal
  tone?: Tone
  /** 无（零）声母音节 */
  zeroInitial: boolean
}

/** 音节查询入参（与 Syllable 解耦，避免 text/tone 干扰） */
export interface SyllableSpec {
  initial: Initial
  final: SyllableFinal
  zeroInitial?: boolean
}

export type SplitResult = { initial: Initial; final: SyllableFinal; zeroInitial: boolean } | null

// ── 知识点 ────────────────────────────────────────────────────

export type AtomType = 'initial' | 'final' | 'zero'
export type AtomId = `${AtomType}:${string}`

export interface AtomRef {
  atomId: AtomId
  type: AtomType
  /** 声母/韵母/零声母音节名，或规则名 */
  key: string
}

// ── 方案 ──────────────────────────────────────────────────────

export type SchemeType = 'compositional' | 'syllable-code' | 'hybrid'

export interface SameKeyGroup {
  key: string
  finals: string[]
}

export interface SchemeDef {
  id: string
  name: string
  type: SchemeType
  /** 普通声母 → 键位数组（数组 = 多键/飞键） */
  initials: Record<string, string[]>
  /** 33 韵母 → 键位数组 */
  finals: Record<string, string[]>
  /** 12 个零声母音节 → 完整键序列 */
  zeroInitial: Record<string, string[]>
  /** 整音节覆盖（键道等特殊拼写、C 双拼整音节码） */
  overrides?: Record<string, string[]>
  umlautNote?: string
  sameKeyGroups?: SameKeyGroup[]
  source?: { repo?: string; file?: string; note?: string }
  notes?: string[]
}

/** 与全拼习惯的差异（由方案数据推导，见 engine.diff()） */
export interface SchemeDiff {
  freeInitials: string[]
  learnInitials: string[]
  freeFinals: string[]
  learnFinals: string[]
  learnZero: string[]
  freeZero: string[]
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
  /** 键盘布局（3 行 qwerty；方案用到的 ';' 也会出现） */
  keyMap(): LetterKey[][]
}

// ── 词库 ──────────────────────────────────────────────────────

export interface WordSyllable {
  text: string
  pinyin: string
  initial: Initial
  final: SyllableFinal
  tone?: Tone
}

export interface WordEntry {
  text: string
  length: number
  freq: number
  /** 全量词表中的全局词频排名（从 1 开始） */
  freqRank?: number
  syllables: WordSyllable[]
  chars: string[]
  minCharRank?: number
  polyphone?: boolean
}

// ── 课程 ──────────────────────────────────────────────────────

export type LessonKind = 'intro' | 'drill' | 'review' | 'exam'

export interface WordPlan {
  maxUnfamiliar: number
  lengthRange: [number, number]
}

export type PassMode = 'accuracy' | 'speed' | 'accuracy-speed'

export interface PassCriteria {
  accuracy: number
  /** accuracy：普通准确率课；speed：速度训练；accuracy-speed：准确率+速度考核 */
  mode?: PassMode
  /** 通过所需的最低速度（正确字/分钟） */
  minCpm?: number
  /** 速度星级的三个门槛：1★通过、2★、3★ */
  starCpm?: [number, number, number]
}

export interface AtomMeta {
  atomId: AtomId
  type: AtomType
  pinyin: string
  keys: string[]
  free: boolean
  /** 键位记忆锚点：与该知识点绑定的高频字（零声母/韵母）或词（声母），1–5 个 */
  anchors?: string[]
  /** 一句话记忆法（如「D + AI = DAI：带 呆 待 代 戴」），由按键与音组合生成 */
  mnemonic?: string
}

export interface ZeroExample {
  syllable: string
  char: string
  tone?: number
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
  /** 不阻塞选词的 focus（zero/rule） */
  nonBlockingAtoms: AtomId[]
  prerequisites: AtomId[]
  wordPlan: WordPlan
  /** 入门课无评分门槛（完成即通过） */
  passCriteria?: PassCriteria
  estimatedMinutes: number
  atomMeta: Record<string, AtomMeta>
  zeroExamples?: ZeroExample[]
  /** 本课备注与技巧（教学中展示；1 条以上，由内容库 + 方案键位生成） */
  tips: string[]
  /** 各阶段最低完成词数（达到后主按钮可点）；缺省按课程类型使用 core 默认值 */
  stageMinWords?: Partial<Record<PracticeStage, number>>
  /** 复习课的家族标记（数据生成期使用，运行时仅作信息） */
  reviewFamily?: string
}

export interface ChapterDef {
  id: string
  order: number
  title: string
  subtitle?: string
}

export interface Curriculum {
  schemeId: string
  schemeName: string
  schemeType: string
  version: string
  templateVersion: string
  generatedAt: string
  supportLevel: 'full' | 'simplified' | 'free-only'
  /** 课程内容 hash：curriculum-<12hex> */
  dataVersion: string
  chapters: ChapterDef[]
  lessons: LessonDef[]
}

// ── 展示 / 练习模型 ───────────────────────────────────────────

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
  freq?: number
  polyphone?: boolean
}

// ── 选词 ──────────────────────────────────────────────────────

export interface SelectWordsInput {
  words: readonly WordEntry[]
  engine: SchemeEngine
  lesson: LessonDef
  /** 已学原子（不含 free；free 由 engine.diff() 自动视为已学） */
  learnedAtoms: readonly AtomId[]
  count: number
  seed?: number
  /** 允许出现的非 focus 未知阻塞原子数（默认取 lesson.wordPlan.maxUnfamiliar） */
  maxUnfamiliar?: number
  /** 词长过滤（默认取 lesson.wordPlan.lengthRange） */
  lengthRange?: [number, number]
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
  accuracy: number
}

export interface SessionState {
  words: SessionWordState[]
  index: number
  phase: SessionPhase
  startedAt: number
  lastFeedback: SessionFeedback
  stats: SessionStats
}

export interface SessionOptions {
  words: PracticeWord[]
  now?: number
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

// ── 阶段 / 评分 ───────────────────────────────────────────────

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

/** 阶段门槛：最低词数（+ 全遮挡考核阶段的考核标准）与未达标原因 */
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

// ── 数据文件契约（apps/web 与数据管线共用） ───────────────────

export interface SchemeSummary {
  id: string
  name: string
  type: SchemeType
  file: string
  atoms?: {
    initials?: { total?: number; free?: number; learn?: number }
    finals?: { total?: number; free?: number; learn?: number }
    zeroInitial?: { total?: number; free?: number; learn?: number }
    overrides?: { total?: number; free?: number; learn?: number }
    total?: { total?: number; free?: number; learn?: number }
  }
  course?: { supportsGuidedCourse?: boolean; courseTier?: string; reason?: string }
  recommendation?: { rank?: number; reason?: string }
}

export interface SchemeIndexFile {
  version: string
  generatedBy?: string
  reference?: { repo?: string; license?: string }
  semantics?: Record<string, string>
  defaultScheme: string
  recommendedOrder: string[]
  courseSupported: string[]
  schemes: SchemeSummary[]
}

export interface CurriculumSummary {
  schemeId: string
  schemeName: string
  supportLevel: string
  lessonCount: number
  totalMinutes: number
  file: string
}

export interface CurriculumIndexFile {
  generatedAt: string
  templateVersion: string
  schemes: CurriculumSummary[]
}

export interface PoolLessonMeta {
  id: string
  title: string
  kind: LessonKind
  words: number
  chars: number
  file: string
}

export interface PoolIndexFile {
  dataVersion: string
  generatedAt: string
  sources: { curriculum: string; dict: string }
  targetWordsPerLesson: number
  minWordsPerLesson: number
  totalEntries: number
  uniqueWords: number
  lessons: PoolLessonMeta[]
}

export interface PoolExample {
  char: string
  pinyin: string
  pinyinTone: string
  initial: Initial
  final: SyllableFinal
  tone?: Tone
}

export interface LessonPool {
  lessonId: string
  words: WordEntry[]
  chars: WordEntry[]
  examples: PoolExample[]
}

export interface DataManifest {
  generatedAt: string
  versions: { curriculum: string; pools: string; words: string }
  defaultScheme: string
  courses: string[]
  files: { file: string; bytes: number }[]
}

export interface LessonProgress {
  passed: boolean
  stars: number
  bestAccuracy: number
  attempts: number
  updatedAt: number
  /** 已完成过目标的非考核阶段（single/word）；再次进入可直接继续 */
  clearedStages?: PracticeStage[]
}
