/**
 * 课程展示视图模型：FocusAtomView、课程备注、记忆锚点、章节/课程视图。
 * 只做展示映射；课程范围只有 initial / final / zero 三类具体键位映射。
 * 学习进度 / 解锁规则在 core progress.ts，本文件不再实现。
 */
import type {
  AtomId,
  AtomType,
  ChapterDef,
  Curriculum,
  LessonDef,
  LessonKind,
  LessonProgress,
  LessonState,
  PracticeStage,
  ResolvedLexicon,
  SchemeEngine,
} from '@shuangpin/core'
import { atomDisplayLabel, buildAtomMemory, isFreeAtom, lessonState, parseAtomId } from '@shuangpin/core'

type FocusBadge = '新' | '含' | '沿'

export interface FocusAtomView {
  atomId: AtomId
  label: string
  keys: string[]
  badge: FocusBadge
  type: AtomType
  /** 高频字记忆锚点（运行时由方案键位 + 当前词表派生） */
  anchors: string[]
  /** 一句话记忆法（运行时派生） */
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

/** 已学完的章节 id：章内有课程，且该章所有课程都已通过。 */
export function completedChapterIds(chapters: readonly ChapterView[]): string[] {
  return chapters
    .filter(
      (chapter) =>
        chapter.lessons.length > 0 && chapter.lessons.every((lesson) => lesson.state === 'passed'),
    )
    .map((chapter) => chapter.id)
}

// ── focus 范围 ────────────────────────────────────────────────

function atomKey(atomId: AtomId): string {
  return parseAtomId(atomId)?.key ?? atomId
}

function atomType(atomId: AtomId): AtomType {
  return parseAtomId(atomId)?.type ?? 'initial'
}

function buildFocusItem(
  atomId: AtomId,
  lesson: LessonDef,
  engine: SchemeEngine,
  badge: FocusBadge,
  lexicon?: ResolvedLexicon,
): FocusAtomView {
  const type = atomType(atomId)
  const memory = buildAtomMemory(engine, atomId, lexicon?.chars ?? [])
  return {
    atomId,
    label: atomDisplayLabel(atomId, memory?.pinyin ?? atomKey(atomId)),
    keys: memory?.keys.length ? [...memory.keys] : engine.keysForAtom(atomId),
    badge,
    type,
    anchors: memory?.anchors ? [...memory.anchors] : [],
    mnemonic: memory?.mnemonic,
  }
}

/**
 * 本课 focus 范围：直接来自 lesson.focusAtoms，保持数据的学习顺序（只去重）。
 * 传入 lexicon 时同时派生记忆锚点与 mnemonic（tutorial 使用）；课程地图只要键位。
 */
export function lessonFocusItems(
  lesson: LessonDef,
  engine: SchemeEngine,
  lexicon?: ResolvedLexicon,
): FocusAtomView[] {
  const badge: FocusBadge = lesson.kind === 'review' || lesson.kind === 'exam' ? '含' : '新'
  const seen = new Set<AtomId>()
  const items: FocusAtomView[] = []
  for (const atomId of lesson.focusAtoms) {
    if (seen.has(atomId)) continue
    if (!parseAtomId(atomId) || isFreeAtom(engine, atomId)) continue
    seen.add(atomId)
    items.push(buildFocusItem(atomId, lesson, engine, badge, lexicon))
  }
  return items
}

/** 教学页备注：人工技巧 + 运行时派生的推荐码 / 兼容码 tips；无内容返回空数组。 */
export function buildLessonNotes(lesson: LessonDef, generatedTips: readonly string[] = []): LessonNote[] {
  const tips = [...(lesson.tips ?? []), ...generatedTips]
  if (tips.length === 0) return []
  return [{ title: '本课技巧', bullets: tips }]
}

/**
 * 记忆锚点（键位技巧）的唯一展示规则：
 * - 只在新课（drill）出现；复习/考核课一律不显示；
 * - 有改造键位（initial/final）时，逐键展示其 mnemonic + 高频字；
 * - 零声母全表课没有改造键位，则用一条程序生成的「零声母」汇总行展示本次课程涉及的零声母映射；
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
      mnemonic: `${zeros.length} 音映射：${zeros
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
  if (lesson.kind === 'review') return '无提示练习'
  return '无提示考核'
}

export function lessonKindLabel(kind: LessonKind): string {
  return { intro: '入门', drill: '新课', review: '复习', exam: '考核' }[kind]
}

// ── 章节视图 ─────────────────────────────────────────────────

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
