/**
 * 测试辅助：读取仓库根 data/ 的真实数据、构造方案引擎与 WordEntry/PracticeWord fixture。
 * 测试环境可用 node:fs（src 中不允许 Node API）。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type {
  AtomId,
  Curriculum,
  CurriculumIndexFile,
  LessonDef,
  LessonPool,
  SchemeDef,
  SchemeEngine,
  SchemeIndexFile,
  Syllable,
  SyllableFinal,
  Tone,
  WordEntry,
} from '../src/types.ts'
import { createSchemeEngine } from '../src/scheme.ts'
import { FINALS, INITIALS, splitPinyin, toToneMarks } from '../src/pinyin.ts'
import { buildPracticeWord } from '../src/practice.ts'

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

export function loadCurriculum(schemeId: string): Curriculum {
  return readDataJSON<Curriculum>('schemes', schemeId, 'curriculum.json')
}

export function loadCurriculumIndex(): CurriculumIndexFile {
  return readDataJSON<CurriculumIndexFile>('schemes', 'curriculum-index.json')
}

export interface LexiconFile {
  dataVersion: string
  words: WordEntry[]
  chars: WordEntry[]
  syllableExamples: Record<string, { char: string; pinyin: string; pinyinTone: string; initial: string; final: string; tone?: number }>
}

export function loadLexicon(): LexiconFile {
  return readDataJSON<LexiconFile>('lexicon', 'lexicon.json')
}

/** 与 Web 层一致的“从 Lexicon 派生当前课视图”，测试不再依赖每课词池文件。 */
export function loadPool(lessonId: string): LessonPool {
  const lesson = findLesson(loadCurriculum('xiaohe'), lessonId)
  const lexicon = loadLexicon()
  const examples: LessonPool['examples'] = []
  const seen = new Set<string>()
  const zeroBySyllable = new Map((lesson.zeroExamples ?? []).map((item) => [item.syllable, item]))
  const add = (syllable: string, isZero: boolean) => {
    if (seen.has(syllable)) return
    const example = lexicon.syllableExamples[syllable]
    if (example) {
      examples.push(example as LessonPool['examples'][number])
      seen.add(syllable)
      return
    }
    if (!isZero) return
    const zero = zeroBySyllable.get(syllable)
    if (!zero) return
    examples.push({
      char: zero.char,
      pinyin: syllable,
      pinyinTone: zero.tone === undefined ? syllable : toToneMarks(syllable, zero.tone as 1 | 2 | 3 | 4 | 5),
      initial: '' as LessonPool['examples'][number]['initial'],
      final: syllable as LessonPool['examples'][number]['final'],
      ...(zero.tone !== undefined ? { tone: zero.tone as 1 | 2 | 3 | 4 | 5 } : {}),
    })
    seen.add(syllable)
  }
  for (const atom of lesson.focusAtoms) {
    if (atom.startsWith('initial:')) {
      const initial = atom.slice('initial:'.length)
      for (const final of [...FINALS, 'er']) add(`${initial}${final}`, false)
    } else if (atom.startsWith('final:')) {
      const final = atom.slice('final:'.length)
      for (const initial of ['', ...INITIALS]) add(`${initial}${final}`, initial === '')
    } else if (atom.startsWith('zero:')) add(atom.slice('zero:'.length), true)
  }
  return { lessonId, words: lexicon.words, chars: lexicon.chars, examples }
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
  const syllables: Syllable[] = pinyins.map((pinyin, index) => {
    const split = splitPinyin(pinyin)
    if (!split) throw new Error(`非法拼音 ${pinyin}（词 ${text}）`)
    const syllable: Syllable = {
      text: chars[index] as string,
      pinyin: `${split.initial}${split.final}`,
      initial: split.initial,
      final: split.final as SyllableFinal,
      zeroInitial: split.zeroInitial,
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
    minCharRank: 500,
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
