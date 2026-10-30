/**
 * 通过标准与星级判定测试（唯一权威：evaluateLesson / describePassCriteria）。
 */
import { describe, expect, it } from 'vitest'
import type { LessonDef, PassCriteria } from '../src/types.ts'
import { describePassCriteria, evaluateLesson } from '../src/scoring.ts'

function lessonWith(passCriteria: PassCriteria, kind: LessonDef['kind'] = 'drill'): LessonDef {
  return {
    id: 'TEST',
    chapterId: 'ch-test',
    kind,
    title: '测试课',
    desc: '',
    focusAtoms: [],
    blockingAtoms: [],
    nonBlockingAtoms: [],
    prerequisites: [],
    wordPlan: { maxUnfamiliar: 0, lengthRange: [2, 3] },
    passCriteria,
    estimatedMinutes: 6,
    tips: [],
    atomMeta: {},
  }
}

describe('evaluateLesson · 普通准确率课（完成即通过）', () => {
  const lesson = lessonWith({ accuracy: 0.9, mode: 'accuracy' })

  it('完成即通过：低正确率也通过，仅影响星级', () => {
    expect(evaluateLesson(lesson, { accuracy: 0.5, cpm: 0, revealed: false })).toEqual({
      passed: true,
      stars: 1,
      reasons: [],
    })
  })

  it('星级：85% → 1 星；90% → 2 星；95% 且未揭示 → 3 星；揭示过 → 最多 2 星', () => {
    expect(evaluateLesson(lesson, { accuracy: 0.85, cpm: 0, revealed: false }).stars).toBe(1)
    expect(evaluateLesson(lesson, { accuracy: 0.9, cpm: 0, revealed: false }).stars).toBe(2)
    expect(evaluateLesson(lesson, { accuracy: 0.95, cpm: 0, revealed: false }).stars).toBe(3)
    expect(evaluateLesson(lesson, { accuracy: 0.99, cpm: 0, revealed: true }).stars).toBe(2)
  })
})

describe('evaluateLesson · 速度训练', () => {
  const lesson = lessonWith({ accuracy: 0.85, mode: 'speed', minCpm: 30, starCpm: [30, 45, 60] })

  it('通过需正确率与速度双达标（最低正确率 85%）', () => {
    expect(evaluateLesson(lesson, { accuracy: 0.85, cpm: 30, revealed: false }).passed).toBe(true)
    expect(evaluateLesson(lesson, { accuracy: 0.85, cpm: 29, revealed: false }).passed).toBe(false)
    expect(evaluateLesson(lesson, { accuracy: 0.84, cpm: 60, revealed: false }).passed).toBe(false)
  })

  it('星级按 starCpm：30/45/60', () => {
    expect(evaluateLesson(lesson, { accuracy: 0.9, cpm: 30, revealed: false }).stars).toBe(1)
    expect(evaluateLesson(lesson, { accuracy: 0.9, cpm: 45, revealed: false }).stars).toBe(2)
    expect(evaluateLesson(lesson, { accuracy: 0.9, cpm: 60, revealed: false }).stars).toBe(3)
  })
})

describe('evaluateLesson · 通关考核（准确率+速度）', () => {
  const lesson = lessonWith(
    { accuracy: 0.85, mode: 'accuracy-speed', minCpm: 30, starCpm: [30, 40, 50] },
    'exam',
  )

  it('1/2/3 星规则（正确率底线 85 / 90 / 95）', () => {
    expect(evaluateLesson(lesson, { accuracy: 0.85, cpm: 30, revealed: false }).stars).toBe(1)
    expect(evaluateLesson(lesson, { accuracy: 0.9, cpm: 40, revealed: false }).stars).toBe(2)
    expect(evaluateLesson(lesson, { accuracy: 0.95, cpm: 50, revealed: false }).stars).toBe(3)
  })

  it('3 星要求未揭示答案', () => {
    expect(evaluateLesson(lesson, { accuracy: 0.99, cpm: 60, revealed: true }).stars).toBe(2)
  })

  it('速度不达标时不通过', () => {
    const result = evaluateLesson(lesson, { accuracy: 0.99, cpm: 20, revealed: false })
    expect(result.passed).toBe(false)
    expect(result.reasons.join()).toMatch(/速度/)
  })
})

describe('evaluateLesson · 入门课', () => {
  it('完成即通过并统一记三星，不需要 passCriteria', () => {
    const intro = lessonWith({ accuracy: 0 }, 'intro')
    expect(evaluateLesson(intro, { accuracy: 0, cpm: 0, revealed: false })).toEqual({
      passed: true,
      stars: 3,
      reasons: [],
    })
  })
})

describe('describePassCriteria', () => {
  it('accuracy 模式：只展示 1–3 星三档', () => {
    const lines = describePassCriteria({ accuracy: 0.85, mode: 'accuracy' })
    expect(lines.map((line) => line.label)).toEqual(['★', '★★', '★★★'])
    expect(lines[0]?.text).toContain('85%')
    expect(lines[1]?.text).toContain('90%')
    expect(lines[2]?.text).toContain('95%')
    expect(lines.some((line) => line.label === '通过')).toBe(false)
  })

  it('speed 模式：1–3 星三档', () => {
    const lines = describePassCriteria({
      accuracy: 0.9,
      mode: 'speed',
      minCpm: 30,
      starCpm: [30, 45, 60],
    })
    expect(lines.map((line) => line.label)).toEqual(['★', '★★', '★★★'])
    expect(lines[2]?.text).toContain('60')
  })

  it('accuracy-speed 模式：1–3 星三档', () => {
    const lines = describePassCriteria({
      accuracy: 0.9,
      mode: 'accuracy-speed',
      minCpm: 30,
      starCpm: [30, 40, 50],
    })
    expect(lines.map((line) => line.label)).toEqual(['★', '★★', '★★★'])
    expect(lines[2]?.text).toContain('50')
  })
})
