/**
 * 课程进度 / 解锁规则测试（core progress.ts；原 web lessonView 规则）。
 */
import { describe, expect, it } from 'vitest'
import type { LessonProgress } from '../src/types.ts'
import {
  canStartLesson,
  currentLessonId,
  lessonState,
  nextLessonId,
  passedLessonCount,
} from '../src/progress.ts'
import { loadCurriculum } from './helpers.ts'

const lessons = loadCurriculum('xiaohe').lessons.slice(0, 4)
const [first, second, third] = lessons

function passed(overrides: Partial<LessonProgress> = {}): LessonProgress {
  return { passed: true, stars: 3, bestAccuracy: 1, attempts: 1, updatedAt: 1, ...overrides }
}

describe('lessonState / canStartLesson', () => {
  it('第一课默认 available，后续未通关前置时 locked', () => {
    expect(lessonState(lessons, {}, first!.id)).toBe('available')
    expect(lessonState(lessons, {}, second!.id)).toBe('locked')
    expect(canStartLesson(lessons, {}, first!.id)).toBe(true)
    expect(canStartLesson(lessons, {}, second!.id)).toBe(false)
  })

  it('已通过显示 passed；前一课通过后下一课 available', () => {
    const progress = { [first!.id]: passed() }
    expect(lessonState(lessons, progress, first!.id)).toBe('passed')
    expect(lessonState(lessons, progress, second!.id)).toBe('available')
  })

  it('unlockedAll 解除锁课', () => {
    expect(lessonState(lessons, {}, third!.id, true)).toBe('available')
    expect(canStartLesson(lessons, {}, third!.id, true)).toBe(true)
  })

  it('已通过优先于 locked 判断', () => {
    const progress = { [third!.id]: passed() }
    expect(lessonState(lessons, progress, third!.id)).toBe('passed')
  })
})

describe('nextLessonId / currentLessonId / passedLessonCount', () => {
  it('nextLessonId 返回下一课，最后一课 undefined', () => {
    expect(nextLessonId(lessons, first!.id)).toBe(second!.id)
    expect(nextLessonId(lessons, lessons[lessons.length - 1]!.id)).toBeUndefined()
    expect(nextLessonId(lessons, 'missing')).toBeUndefined()
  })

  it('currentLessonId = 第一门未通过且未锁的课；全部通过回退第一课', () => {
    expect(currentLessonId(lessons, {})).toBe(first!.id)
    expect(currentLessonId(lessons, { [first!.id]: passed() })).toBe(second!.id)
    const allPassed = Object.fromEntries(lessons.map((lesson) => [lesson.id, passed()]))
    expect(currentLessonId(lessons, allPassed)).toBe(first!.id)
  })

  it('passedLessonCount 只统计通过课程', () => {
    expect(passedLessonCount(lessons, {})).toBe(0)
    expect(passedLessonCount(lessons, { [first!.id]: passed(), [third!.id]: passed() })).toBe(2)
  })
})
