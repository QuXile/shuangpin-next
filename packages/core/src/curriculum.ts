/**
 * 课程生成与加载。
 *
 * - buildUniversalCurriculum(scheme)：按方案数据生成通用课程（纯函数，不读写文件）。
 * - hydrateCurriculum(schemeId, source, freeAtoms)：把定制课程源数据补齐为运行时 LessonDef
 *   （blockingAtoms / nonBlockingAtoms 由 focusAtoms 派生；prerequisites 由全拼沿用 +
 *   此前 focusAtoms 与课程顺序派生）。
 *
 * 课程源数据只保存章节、课程结构与人工文案；键位、锚点、示例与编码 tips 在运行期派生。
 */
import { FINALS, INITIALS, ZERO_INITIALS, atomId, parseAtomId } from './pinyin.ts'
import { createSchemeEngine } from './scheme.ts'
import type {
  AtomId,
  AtomType,
  ChapterDef,
  Curriculum,
  LessonDef,
  PassCriteria,
  SchemeDef,
  SchemeEngine,
} from './types.ts'

/** 定制课程源数据：不含运行期派生字段。 */
export type StoredLessonDef = Omit<
  LessonDef,
  'blockingAtoms' | 'nonBlockingAtoms' | 'prerequisites' | 'wordPlan'
>
export interface StoredCurriculum {
  chapters: ChapterDef[]
  lessons: StoredLessonDef[]
}

type FreeSets = ReturnType<SchemeEngine['freeSets']>

// ── 阶段 / 评分 / 词量模板 ────────────────────────────────────

const PASS_ACCURACY: PassCriteria = { accuracy: 0.85, mode: 'accuracy' }
const PASS_REVIEW: PassCriteria = { accuracy: 0.85, mode: 'accuracy', minCpm: 45 }
const PASS_SPEED: PassCriteria = {
  accuracy: 0.85,
  mode: 'speed',
  minCpm: 45,
  starCpm: [45, 60, 75],
}
const PASS_EXAM: PassCriteria = {
  accuracy: 0.85,
  mode: 'accuracy-speed',
  minCpm: 45,
  starCpm: [45, 60, 75],
}

const WORD_PLAN_DEFAULT: LessonDef['wordPlan'] = { maxUnfamiliar: 0, lengthRange: [2, 5] }
const WORD_PLAN_INTRO: LessonDef['wordPlan'] = { maxUnfamiliar: 0, lengthRange: [2, 3] }

/** 内容章顺序：每项只列规范原子，实际生成由方案 learn 原子决定。 */
const MODULES: ReadonlyArray<{ key: string; type: AtomType; title: string; atoms: readonly string[] }> = Object.freeze([
  { key: 'single-final', type: 'final', title: '单韵母', atoms: ['i', 'u', 'e', 'a', 'o', 'v'] },
  {
    key: 'single-initial',
    type: 'initial',
    title: '单声母',
    atoms: INITIALS.filter((name) => name !== 'zh' && name !== 'ch' && name !== 'sh'),
  },
  { key: 'compound-initial', type: 'initial', title: '复合声母', atoms: ['sh', 'zh', 'ch'] },
  { key: 'front-diphthong', type: 'final', title: '前响复韵母', atoms: ['ao', 'ou', 'ai', 'ei'] },
  { key: 'mid-diphthong', type: 'final', title: '中响复韵母', atoms: ['iao', 'ui', 'iu', 'uai'] },
  { key: 'back-diphthong', type: 'final', title: '后响复韵母', atoms: ['uo', 'ie', 'ia', 'ue', 'ua', 've'] },
  { key: 'back-nasal', type: 'final', title: '基本后鼻韵母', atoms: ['ing', 'ong', 'ang', 'eng'] },
  { key: 'front-nasal', type: 'final', title: '基本前鼻韵母', atoms: ['an', 'en', 'in', 'un'] },
  { key: 'medial-front-nasal', type: 'final', title: '带介前鼻韵母', atoms: ['ian', 'uan'] },
  { key: 'medial-back-nasal', type: 'final', title: '带介后鼻韵母', atoms: ['iang', 'iong', 'uang'] },
  { key: 'zero-initial', type: 'zero', title: '零声母', atoms: [...ZERO_INITIALS] },
])

// ── 原子工具 ─────────────────────────────────────────────────

function tableOf(scheme: SchemeDef, type: AtomType): Record<string, string[]> | undefined {
  if (type === 'initial') return scheme.initials
  if (type === 'final') return scheme.finals
  if (type === 'zero') return scheme.zeroInitial
  return undefined
}

function atomExistsInScheme(scheme: SchemeDef, atom: AtomId): boolean {
  const ref = parseAtomId(atom)
  if (!ref) return false
  const table = tableOf(scheme, ref.type)
  return Boolean(table && Object.prototype.hasOwnProperty.call(table, ref.key))
}

/** 原子在方案数据里的全部键位（小写，保持数据顺序）。 */
function keysOfAtom(scheme: SchemeDef, atom: AtomId): string[] {
  const ref = parseAtomId(atom)
  const values = ref ? (tableOf(scheme, ref.type)?.[ref.key] ?? []) : []
  return values.map((value) => String(value).toLowerCase())
}

function isFreeAtomOf(free: FreeSets, atom: AtomId): boolean {
  const ref = parseAtomId(atom)
  if (!ref) return false
  if (ref.type === 'initial') return free.initials.has(ref.key)
  if (ref.type === 'final') return free.finals.has(ref.key)
  return free.zero.has(ref.key)
}

function freeAtomIdsOf(scheme: SchemeDef, free: FreeSets): AtomId[] {
  const collect = (type: AtomType, keys: readonly string[], set: Set<string>) =>
    keys
      .filter((key) => atomExistsInScheme(scheme, atomId(type, key)) && set.has(key))
      .map((key) => atomId(type, key))
  return [
    ...collect('initial', INITIALS, free.initials as Set<string>),
    ...collect('final', FINALS, free.finals as Set<string>),
    ...collect('zero', ZERO_INITIALS, free.zero as Set<string>),
  ]
}

function buildContentModules(scheme: SchemeDef, free: FreeSets) {
  const modules: Array<{ key: string; type: AtomType; title: string; atoms: string[] }> = []
  for (const module of MODULES) {
    const atoms = module.atoms.filter((key) => {
      const atom = atomId(module.type, key)
      return atomExistsInScheme(scheme, atom) && !isFreeAtomOf(free, atom)
    })
    if (atoms.length === 0) continue
    modules.push({ ...module, atoms })
  }
  return modules
}

/** 期中边界：左右新课数差最小 → 章数差最小 → 更早边界。 */
function chooseMidBoundary(modules: Array<{ atoms: string[] }>) {
  if (modules.length < 2) return null
  const counts = modules.map((module) => module.atoms.length)
  const total = counts.reduce((sum, value) => sum + value, 0)
  let leftCount = 0
  let best: { index: number; leftCount: number; rightCount: number; diff: number; chapterDiff: number } | null = null
  for (let index = 1; index < modules.length; index += 1) {
    leftCount += counts[index - 1]!
    const rightCount = total - leftCount
    const diff = Math.abs(leftCount - rightCount)
    const chapterDiff = Math.abs(index - (modules.length - index))
    const candidate = { index, leftCount, rightCount, diff, chapterDiff }
    if (!best || candidate.diff < best.diff || (candidate.diff === best.diff && candidate.chapterDiff < best.chapterDiff)) {
      best = candidate
    }
  }
  return best
}

// ── 定制课程加载 ──────────────────────────────────────────────

/**
 * 把定制课程源数据补齐为运行时 LessonDef：
 * blockingAtoms / nonBlockingAtoms 由 focusAtoms 派生；
 * prerequisites = 入门课后加入的全部全拼沿用原子 + 此前所有 focusAtoms 的累计集合。
 */
export function hydrateCurriculum(
  schemeId: string,
  source: StoredCurriculum,
  freeAtoms: readonly AtomId[] = [],
): Curriculum {
  const learned = new Set<AtomId>()
  const lessons = source.lessons.map((lesson): LessonDef => {
    const focus = [...lesson.focusAtoms]
    const hydrated: LessonDef = {
      ...lesson,
      focusAtoms: focus,
      wordPlan: lesson.kind === 'intro' ? { ...WORD_PLAN_INTRO } : { ...WORD_PLAN_DEFAULT },
      blockingAtoms: focus.filter((atom) => atom.startsWith('initial:') || atom.startsWith('final:')),
      nonBlockingAtoms: focus.filter((atom) => atom.startsWith('zero:')),
      prerequisites: [...learned],
    }
    for (const atom of focus) learned.add(atom)
    // 入门课之后，全拼沿用就是已会内容；入门课自身不展示前置。
    if (lesson.kind === 'intro') {
      for (const atom of freeAtoms) learned.add(atom)
    }
    return hydrated
  })
  return { schemeId, chapters: source.chapters.map((chapter) => ({ ...chapter })), lessons }
}

// ── 通用课程生成 ──────────────────────────────────────────────

function upperKeys(keys: readonly string[]): string {
  return keys.map((key) => key.toUpperCase()).join(' / ')
}

function moduleSubtitle(module: { atoms: readonly string[]; type: AtomType }): string {
  if (module.atoms.length > 6) {
    return `${module.atoms.length} 个${module.type === 'zero' ? '音节' : '键位'} · 逐个教学`
  }
  return module.atoms.join(' · ')
}

/** 按方案数据生成通用课程：入门 → learn 原子逐课 → 章末复习 → 期中 → 综合 / 速度 / 最终考核。 */
export function buildUniversalCurriculum(scheme: SchemeDef): Curriculum {
  const free = createSchemeEngine(scheme).freeSets()
  const freeAtoms = freeAtomIdsOf(scheme, free)
  const modules = buildContentModules(scheme, free)
  const boundary = chooseMidBoundary(modules)
  const learned: AtomId[] = []
  const chapterEntries: Array<{ id: string; title: string; subtitle: string; lessons: StoredLessonDef[] }> = []

  const addChapter = (id: string, title: string, subtitle: string) => {
    const chapter = { id, title, subtitle, lessons: [] as StoredLessonDef[] }
    chapterEntries.push(chapter)
    return chapter
  }

  const makeLesson = (
    kind: LessonDef['kind'],
    title: string,
    desc: string,
    focusAtoms: AtomId[],
    passCriteria?: PassCriteria,
  ): StoredLessonDef => {
    const lesson: StoredLessonDef = {
      id: '',
      chapterId: '',
      kind,
      title,
      desc,
      focusAtoms: [...focusAtoms],
    }
    if (kind !== 'intro') lesson.passCriteria = { ...(passCriteria ?? PASS_REVIEW) }
    return lesson
  }

  const addLesson = (
    chapter: { id: string; title: string; subtitle: string; lessons: StoredLessonDef[] },
    lesson: StoredLessonDef,
  ) => {
    chapter.lessons.push(lesson)
    return lesson
  }

  const introChapter = addChapter('ch-intro', '入门', '认识双拼')
  addLesson(introChapter, makeLesson('intro', '入门 · 认识双拼', '一声母一韵母两键；先看提示打对，再逐步撤掉提示。', []))
  learned.push(...freeAtoms)

  const addMidChapter = () => {
    if (!boundary) return
    const chapter = addChapter('ch-mid', '期中', `前 ${boundary.index} 个内容章混合检验 · 先准确后速度`)
    addLesson(
      chapter,
      makeLesson('review', '期中 · 混合练习', '期中：前半程内容混合检验，先准确后速度。', [...learned], PASS_REVIEW),
    )
    addLesson(
      chapter,
      makeLesson('review', '期中 · 速度练习', '期中速度练习：目标 45 WPM 起。', [...learned], PASS_SPEED),
    )
  }

  modules.forEach((module, moduleIndex) => {
    if (boundary && boundary.index === moduleIndex) addMidChapter()
    const chapter = addChapter(`ch-${module.key}`, module.title, moduleSubtitle(module))
    for (const key of module.atoms) {
      const atom = atomId(module.type, key)
      const keyText = upperKeys(keysOfAtom(scheme, atom))
      const title =
        module.type === 'initial' ? `声母 · ${key}` : module.type === 'final' ? `韵母 · ${key}` : `零声母 · ${key}`
      const desc =
        module.type === 'zero'
          ? `零声母 ${key}：整段输入 ${keyText}。先练单字，再练词语。`
          : `新键：${key}。先练单字，再练词语。`
      addLesson(chapter, makeLesson('drill', title, desc, [atom], PASS_ACCURACY))
      learned.push(atom)
    }
    const chapterAtoms = module.atoms.map((key) => atomId(module.type, key))
    addLesson(
      chapter,
      makeLesson('review', `复习 · ${module.title}`, `复习：${module.title}刚学的键位；先准确后速度。`, chapterAtoms, PASS_REVIEW),
    )
  })

  const finalChapter = addChapter('ch-final', '最终章', '综合 · 速度 · 最终考核')
  addLesson(finalChapter, makeLesson('review', '综合 · 混合练习', '综合：全部内容混合练习。', [...learned], PASS_REVIEW))
  addLesson(finalChapter, makeLesson('review', '综合 · 速度练习', '速度：全部内容速度冲刺，目标 45 WPM 起。', [...learned], PASS_SPEED))
  addLesson(
    finalChapter,
    makeLesson('exam', '通关 · 最终考核', '无提示 + 限时：正确率与速度同时达标才能通关。', [...learned], PASS_EXAM),
  )

  const chapters: ChapterDef[] = chapterEntries.map((chapter, index) => ({
    id: chapter.id,
    order: index + 1,
    title: chapter.title,
    subtitle: chapter.subtitle,
  }))
  const lessons: StoredLessonDef[] = []
  chapterEntries.forEach((chapter, chapterIndex) => {
    chapter.lessons.forEach((lesson, lessonIndex) => {
      lessons.push({ ...lesson, id: `L${chapterIndex + 1}.${lessonIndex + 1}`, chapterId: chapter.id })
    })
  })
  return hydrateCurriculum(scheme.id, { chapters, lessons }, freeAtoms)
}
