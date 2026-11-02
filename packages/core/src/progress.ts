/**
 * 课程进度 / 解锁规则（原 apps/web/src/lib/lessonView.ts 的规则下沉，纯函数）。
 *
 * 口径：按顺序解锁——已通过显示 passed；第一课或 unlockedAll 时 available；
 * 否则前一课通过才 available，不然 locked。课程列表顺序 = curriculum.lessons 顺序。
 */
import type { LessonDef, LessonProgress, LessonState } from './types.ts'

/** 课程状态：已通过 / 可进入 / 未解锁 */
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

/** 是否可开始该课（未锁课） */
export function canStartLesson(
  lessons: readonly LessonDef[],
  progress: Readonly<Record<string, LessonProgress>>,
  lessonId: string,
  unlockedAll = false,
): boolean {
  return lessonState(lessons, progress, lessonId, unlockedAll) !== 'locked'
}

/** 下一课 id（最后一课返回 undefined） */
export function nextLessonId(lessons: readonly LessonDef[], lessonId: string): string | undefined {
  const index = lessons.findIndex((lesson) => lesson.id === lessonId)
  return index >= 0 ? lessons[index + 1]?.id : undefined
}

/** 当前应学习的课：第一门未通过且未锁的课；全部通过时回退到第一课 */
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

/** 已通过课程数 */
export function passedLessonCount(
  lessons: readonly LessonDef[],
  progress: Readonly<Record<string, LessonProgress>>,
): number {
  return lessons.filter((lesson) => progress[lesson.id]?.passed).length
}
