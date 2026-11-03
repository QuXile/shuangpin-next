/**
 * 测试辅助：读取仓库根 data/ 的真实数据、构造方案引擎与 WordEntry/PracticeWord fixture。
 * 测试环境可用 node:fs（src 中不允许 Node API）。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { pinyin } from 'pinyin-pro'
import type {
  AtomId,
  Curriculum,
  LessonDef,
  LessonPool,
  Lexicon,
  ResolvedLexicon,
  SchemeDef,
  SchemeEngine,
  SchemeIndexFile,
  Tone,
  WordEntry,
  WordSyllable,
} from '../src/types.ts'
import { createSchemeEngine } from '../src/scheme.ts'
import { entryFromPinyin, splitPinyin } from '../src/pinyin.ts'
import { buildPracticeWord } from '../src/session.ts'
import { buildLessonPool } from '../src/lesson.ts'
import { buildUniversalCurriculum, hydrateCurriculum } from '../src/curriculum.ts'
import { freeAtomIdsOf } from '../src/scheme.ts'

// ── 数据读取 ──────────────────────────────────────────────────

export function dataPath(...segments: string[]): string {
  return fileURLToPath(new URL(`../../../data/${segments.join('/')}`, import.meta.url))
}

export function readDataJSON<T>(...segments: string[]): T {
  return JSON.parse(readFileSync(dataPath(...segments), 'utf8')) as T
}

const schemeCache = new Map<string, SchemeDef>()
const engineCache = new Map<string, SchemeEngine>()

export function loadSchemeDef(id: string): SchemeDef {
  const cached = schemeCache.get(id)
  if (cached) return cached
  const def = readDataJSON<SchemeDef>('schemes', id, 'scheme.json')
  schemeCache.set(id, def)
  return def
}

export function loadEngine(id: string): SchemeEngine {
  const cached = engineCache.get(id)
  if (cached) return cached
  const engine = createSchemeEngine(loadSchemeDef(id))
  engineCache.set(id, engine)
  return engine
}

export function loadSchemeIndex(): SchemeIndexFile {
  return readDataJSON<SchemeIndexFile>('schemes', 'index.json')
}

const curriculumCache = new Map<string, Curriculum>()

/** 定制方案读取并补齐课程源数据；其余方案按方案数据生成通用课程。 */
export function loadCurriculum(schemeId: string): Curriculum {
  const cached = curriculumCache.get(schemeId)
  if (cached) return cached
  const index = loadSchemeIndex()
  const curriculum = index.customCourses.includes(schemeId)
    ? hydrateCurriculum(
        schemeId,
        readDataJSON('schemes', schemeId, 'curriculum.json'),
        freeAtomIdsOf(createSchemeEngine(loadSchemeDef(schemeId))),
      )
    : buildUniversalCurriculum(loadSchemeDef(schemeId))
  curriculumCache.set(schemeId, curriculum)
  return curriculum
}

export type LexiconFile = ResolvedLexicon

let lexiconCache: LexiconFile | null = null

/** 真实词库：磁盘只存 text+freq，测试里用 pinyin-pro 解析（与 web 运行时同一口径）。 */
export function loadLexicon(): LexiconFile {
  if (lexiconCache) return lexiconCache
  const source = readDataJSON<Lexicon>('lexicon', 'lexicon.json')
  const words: WordEntry[] = []
  const chars: WordEntry[] = []
  let wordRank = 0
  let charRank = 0
  for (const entry of source.entries) {
    const tokens = pinyin(entry.text, { type: 'array', toneType: 'num', toneSandhi: false })
    const resolved = entryFromPinyin(entry.text, entry.freq, tokens)
    if (!resolved) throw new Error(`词库词条无法解析：${entry.text}`)
    if (resolved.length === 1) {
      resolved.freqRank = ++charRank
      chars.push(resolved)
    } else {
      resolved.freqRank = ++wordRank
      words.push(resolved)
    }
  }
  lexiconCache = { words, chars, syllableExamples: source.syllableExamples }
  return lexiconCache
}

/** 课池派生统一走 core `buildLessonPool`（与 web 同一实现）。 */
export function loadPool(lessonId: string): LessonPool {
  const lesson = findLesson(loadCurriculum('xiaohe'), lessonId)
  return buildLessonPool(lesson, loadLexicon())
}

export function loadWordBank(): WordEntry[] {
  return loadLexicon().words
}

export function findLesson(curriculum: Curriculum, lessonId: string): LessonDef {
  const lesson = curriculum.lessons.find((item) => item.id === lessonId)
  if (!lesson) throw new Error(`lesson ${lessonId} 不存在于课程 ${curriculum.schemeId}`)
  return lesson
}

export function findWord(words: readonly WordEntry[], text: string): WordEntry {
  const word = words.find((item) => item.text === text)
  if (!word) throw new Error(`词 ${text} 不在词库中`)
  return word
}

// ── engine-cases 数据类型 ─────────────────────────────────────

export interface EngineCasePositive {
  pinyin: string
  kind: string
  initial: string
  final: string
  zeroInitial?: boolean
  accepted: string[]
  note?: string
}

export interface EngineCaseNegative {
  pinyin: string
  kind: string
  rejected: string[]
  reason?: string
}

export interface SchemeCases {
  id: string
  name: string
  type: string
  positive: EngineCasePositive[]
  negative: EngineCaseNegative[]
}

export interface EngineCasesFile {
  version: number
  semantics: Record<string, string>
  schemes: Record<string, SchemeCases>
}

export function loadEngineCases(): EngineCasesFile {
  return readDataJSON<EngineCasesFile>('schemes', 'engine-cases.json')
}

// ── WordEntry / PracticeWord fixture ──────────────────────────

/** 构造测试用 WordEntry：逐字拼音走真实 splitPinyin（保证规范拆分口径一致） */
export function makeWordEntry(
  text: string,
  pinyins: readonly string[],
  tones?: readonly (Tone | undefined)[],
): WordEntry {
  const chars = Array.from(text)
  if (chars.length !== pinyins.length) {
    throw new Error(`词 ${text} 字数与拼音数不一致`)
  }
  const syllables: WordSyllable[] = pinyins.map((pinyin, index) => {
    const split = splitPinyin(pinyin)
    if (!split) throw new Error(`非法拼音 ${pinyin}（词 ${text}）`)
    const syllable: WordSyllable = {
      text: chars[index] as string,
      pinyin: `${split.initial}${split.final}`,
      initial: split.initial,
      final: split.final,
    }
    const tone = tones?.[index]
    if (tone !== undefined) syllable.tone = tone
    return syllable
  })
  return {
    text,
    length: chars.length,
    freq: 1000,
    freqRank: 1000,
    syllables,
    chars,
  }
}

/** 单字 WordEntry（用于女/爱等单字练习卡测试） */
export function makeSingleCharEntry(text: string, pinyin: string, tone?: Tone): WordEntry {
  return makeWordEntry(text, [pinyin], [tone])
}

/** 构造 PracticeWord（默认小鹤方案） */
export function makePracticeWord(
  text: string,
  pinyins: readonly string[],
  schemeId = 'xiaohe',
): ReturnType<typeof buildPracticeWord> {
  return buildPracticeWord(loadEngine(schemeId), makeWordEntry(text, pinyins))
}

// ── 选词断言辅助：独立于 selector 实现的「未知阻塞原子」计算 ──

export function unknownBlockingAtoms(
  word: WordEntry,
  engine: SchemeEngine,
  learnedAtoms: readonly AtomId[],
): AtomId[] {
  const diff = engine.diff()
  const freeInitials = new Set<string>(diff.freeInitials)
  const freeFinals = new Set<string>(diff.freeFinals)
  const learned = new Set<AtomId>(learnedAtoms)
  const unknown = new Set<AtomId>()
  for (const syllable of word.syllables) {
    if (syllable.initial === '') continue
    if (!freeInitials.has(syllable.initial)) {
      const atom = `initial:${syllable.initial}` as AtomId
      if (!learned.has(atom)) unknown.add(atom)
    }
    if (!freeFinals.has(syllable.final)) {
      const atom = `final:${syllable.final}` as AtomId
      if (!learned.has(atom)) unknown.add(atom)
    }
  }
  return [...unknown]
}

/** 词中是否含零声母音节 */
export function hasZeroSyllable(word: WordEntry): boolean {
  return word.syllables.some((syllable) => syllable.initial === '')
}
