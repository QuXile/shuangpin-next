/**
 * 课程展示视图模型：FocusAtomView、课程备注、记忆锚点、章节/课程视图。
 * 只做展示映射；课程范围只有 initial / final / zero 三类具体键位映射。
 */
import type {
  AtomId,
  AtomMeta,
  AtomType,
  ChapterDef,
  Curriculum,
  LessonDef,
  LessonKind,
  LessonProgress,
  PracticeStage,
  SchemeEngine,
} from '@shuangpin/core'
import { atomDisplayLabel, parseAtomId } from '@shuangpin/core'

export type FocusBadge = '新' | '含'

export interface FocusAtomView {
  atomId: AtomId
  label: string
  keys: string[]
  badge: FocusBadge
  type: AtomType
  /** 高频字/词记忆锚点（来自 atomMeta.anchors） */
  anchors: string[]
  /** 一句话记忆法（来自 atomMeta.mnemonic） */
  mnemonic?: string
}

export interface LessonNote {
  title: string
  /** 多条要点（lesson.tips）；按列表渲染 */
  bullets: string[]
}

/** 教学页「记忆锚点」一行（只针对声母/韵母） */
export interface AnchorView {
  atomId: AtomId
  label: string
  type: AtomType
  keys: string[]
  mnemonic?: string
  anchors: string[]
}

export type LessonState = 'passed' | 'available' | 'locked'

export interface LessonView extends LessonDef {
  /** 该课在全部课程中的序号（从 0 开始） */
  order: number
  state: LessonState
  stars: number
  focusKeys: FocusAtomView[]
}

export interface ChapterView extends ChapterDef {
  lessons: LessonView[]
}

// ── focus 范围 ────────────────────────────────────────────────

function atomKey(atomId: AtomId): string {
  return parseAtomId(atomId)?.key ?? atomId
}

function atomType(atomId: AtomId): AtomType {
  return parseAtomId(atomId)?.type ?? 'initial'
}

function keyOfMeta(meta: AtomMeta | undefined): string[] {
  return meta?.keys ? [...meta.keys] : []
}

function buildFocusItem(
  atomId: AtomId,
  lesson: LessonDef,
  engine: SchemeEngine,
  badge: FocusBadge,
): FocusAtomView {
  const type = atomType(atomId)
  const meta = lesson.atomMeta[atomId]
  const keys = keyOfMeta(meta).length > 0 ? keyOfMeta(meta) : engine.keysForAtom(atomId)
  return {
    atomId,
    label: atomDisplayLabel(atomId, meta?.pinyin ?? atomKey(atomId)),
    keys,
    badge,
    type,
    anchors: meta?.anchors ? [...meta.anchors] : [],
    mnemonic: meta?.mnemonic,
  }
}

/** 本课 focus 范围：直接来自 lesson.focusAtoms，保持数据的学习顺序（只去重） */
export function lessonFocusItems(lesson: LessonDef, engine: SchemeEngine): FocusAtomView[] {
  const badge: FocusBadge = lesson.kind === 'review' || lesson.kind === 'exam' ? '含' : '新'
  const seen = new Set<AtomId>()
  const items: FocusAtomView[] = []
  for (const atomId of lesson.focusAtoms) {
    if (seen.has(atomId) || parseAtomId(atomId) === null) continue
    seen.add(atomId)
    items.push(buildFocusItem(atomId, lesson, engine, badge))
  }

  return items
}

/** 教学页备注：只展示 lesson.tips（一条「本课技巧」bullet 列表）；无 tips 返回空数组 */
export function buildLessonNotes(lesson: LessonDef): LessonNote[] {
  const tips = lesson.tips ?? []
  if (tips.length === 0) return []
  return [{ title: '本课技巧', bullets: [...tips] }]
}

/**
 * 记忆锚点（键位技巧）的唯一展示规则：
 * - 只在新课（drill）出现；复习/考核课一律不显示；
 * - 有改造键位（initial/final）时，逐键展示其 mnemonic + 高频字；
 * - 零声母全表课没有改造键位，则用一条程序生成的「零声母」汇总行展示 12 音映射；
 * - 不按 focus 数量等条件做启发式判断。
 */
export function buildAnchorViews(
  lesson: LessonDef,
  focusItems: readonly FocusAtomView[],
): AnchorView[] {
  if (lesson.kind !== 'drill') return []
  const keyRows = focusItems
    .filter((item) => item.type === 'initial' || item.type === 'final')
    .filter((item) => Boolean(item.mnemonic) || item.anchors.length > 0)
    .filter((item) => item.keys.length > 0)
    .map((item) => ({
      atomId: item.atomId,
      label: item.label,
      type: item.type,
      keys: [...item.keys],
      mnemonic: item.mnemonic,
      anchors: [...item.anchors],
    }))
  if (keyRows.length > 0) return keyRows

  const zeros = focusItems.filter((item) => item.type === 'zero' && item.keys.length > 0)
  if (zeros.length === 0) return []
  return [
    {
      atomId: zeros[0]!.atomId,
      label: '零声母',
      type: 'zero',
      keys: [],
      mnemonic: `12 音映射：${zeros
        .map((item) => `${item.label.replace(/^零 /, '')} = ${item.keys.map((key) => key.toUpperCase()).join('')}`)
        .join('、')}`,
      anchors: [],
    },
  ]
}

// ── 阶段标题 / 按钮文案 ──────────────────────────────────────

export function stageTitle(lesson: LessonDef, stage: PracticeStage): string {
  if (stage === 'single') return '单字练习'
  if (stage === 'word') return '词语练习'
  if (lesson.kind === 'exam') return '通关考核'
  if (lesson.kind === 'review') return '全遮挡练习'
  return '全遮挡考核'
}

export function lessonKindLabel(kind: LessonKind): string {
  return { intro: '入门', drill: '新课', review: '复习', exam: '考核' }[kind]
}

// ── 章节 / 进度视图 ──────────────────────────────────────────

export function lessonState(
  lessons: readonly LessonDef[],
  progress: Readonly<Record<string, LessonProgress>>,
  lessonId: string,
  unlockedAll = false,
): LessonState {
  if (progress[lessonId]?.passed) return 'passed'
  const index = lessons.findIndex((lesson) => lesson.id === lessonId)
  if (index <= 0 || unlockedAll) return 'available'
  const previous = lessons[index - 1]
  if (!previous) return 'locked'
  return progress[previous.id]?.passed ? 'available' : 'locked'
}

export function canStartLesson(
  lessons: readonly LessonDef[],
  progress: Readonly<Record<string, LessonProgress>>,
  lessonId: string,
  unlockedAll = false,
): boolean {
  return lessonState(lessons, progress, lessonId, unlockedAll) !== 'locked'
}

export function nextLessonId(lessons: readonly LessonDef[], lessonId: string): string | undefined {
  const index = lessons.findIndex((lesson) => lesson.id === lessonId)
  return index >= 0 ? lessons[index + 1]?.id : undefined
}

export function currentLessonId(
  lessons: readonly LessonDef[],
  progress: Readonly<Record<string, LessonProgress>>,
  unlockedAll = false,
): string | undefined {
  for (const lesson of lessons) {
    if (
      !progress[lesson.id]?.passed &&
      lessonState(lessons, progress, lesson.id, unlockedAll) !== 'locked'
    ) {
      return lesson.id
    }
  }
  return lessons[0]?.id
}

export function passedLessonCount(
  lessons: readonly LessonDef[],
  progress: Readonly<Record<string, LessonProgress>>,
): number {
  return lessons.filter((lesson) => progress[lesson.id]?.passed).length
}

export function buildChapterViews(
  curriculum: Curriculum,
  engine: SchemeEngine,
  progress: Readonly<Record<string, LessonProgress>>,
  unlockedAll = false,
): ChapterView[] {
  const lessons = curriculum.lessons
  return curriculum.chapters.map((chapter) => ({
    ...chapter,
    lessons: lessons
      .map((lesson, index): LessonView => {
        const entry = progress[lesson.id]
        return {
          ...lesson,
          order: index,
          state: lessonState(lessons, progress, lesson.id, unlockedAll),
          stars: entry?.stars ?? 0,
          focusKeys: lessonFocusItems(lesson, engine),
        }
      })
      .filter((lesson) => lesson.chapterId === chapter.id),
  }))
}
