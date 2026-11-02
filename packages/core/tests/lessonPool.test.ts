/**
 * 课池派生测试（core buildLessonPool）：统一 Lexicon → 单课 words/chars/examples。
 */
import { describe, expect, it } from 'vitest'
import { buildLessonPool } from '../src/lesson.ts'
import { findLesson, loadCurriculum, loadLexicon } from './helpers.ts'

const curriculum = loadCurriculum('xiaohe')
const lexicon = loadLexicon()

describe('buildLessonPool', () => {
  it('词/字直接复用 Lexicon，examples 按 focus 声母展开全部韵母', () => {
    const lesson = findLesson(curriculum, 'L2.1') // 声母 zh
    const pool = buildLessonPool(lesson, lexicon)
    expect(pool.lessonId).toBe('L2.1')
    expect(pool.words).toBe(lexicon.words)
    expect(pool.chars).toBe(lexicon.chars)
    expect(pool.examples.length).toBeGreaterThan(15)
    const syllables = pool.examples.map((example) => `${example.initial}${example.final}`)
    expect(new Set(syllables).size).toBe(syllables.length) // 每音一张卡
    for (const example of pool.examples) {
      expect(example.initial).toBe('zh')
      expect(example.char.length).toBeGreaterThan(0)
    }
  })

  it('韵母课：examples 只展开真实声母，不混入同名零声母音节', () => {
    const lesson = findLesson(curriculum, 'L3.1') // 韵母 ai
    const pool = buildLessonPool(lesson, lexicon)
    expect(pool.examples.length).toBeGreaterThan(0)
    for (const example of pool.examples) {
      expect(example.initial).not.toBe('')
    }
    expect(pool.examples.map((example) => `${example.initial}${example.final}`)).not.toContain('ai')
  })

  it('零声母课：examples 顺序 = 课程 focus 顺序（仅需记忆的零声母）', () => {
    const lesson = findLesson(curriculum, 'L2.4') // 零声母全表
    const expected = lesson.focusAtoms.map((atom) => atom.slice('zero:'.length))
    const pool = buildLessonPool(lesson, lexicon)
    expect(pool.examples).toHaveLength(expected.length)
    expect(pool.examples.map((example) => example.final)).toEqual(expected)
    for (const example of pool.examples) {
      expect(example.initial).toBe('')
      expect(example.pinyin).toBe(example.final)
      expect(example.pinyinTone.length).toBeGreaterThan(0)
    }
  })

  it('Lexicon 缺音节示例时零声母回退到课程 zeroExamples（含声调显示）', () => {
    const lesson = findLesson(curriculum, 'L2.4')
    const emptyLexicon = { words: [], chars: [], syllableExamples: {} }
    const pool = buildLessonPool(lesson, emptyLexicon)
    expect(pool.examples).toHaveLength((lesson.zeroExamples ?? []).length)
    expect(pool.examples.map((example) => example.final)).toEqual(
      (lesson.zeroExamples ?? []).map((example) => example.syllable),
    )
    for (const example of pool.examples) {
      expect(example.pinyinTone.length).toBeGreaterThanOrEqual(example.pinyin.length)
    }
  })
})
