/**
 * 课池派生测试（core buildLessonPool）：统一 Lexicon → 单课 words/chars/examples。
 */
import { describe, expect, it } from 'vitest'
import { buildLessonPool } from '../src/lesson.ts'
import { ZERO_INITIALS } from '../src/pinyin.ts'
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

  it('Lexicon 覆盖全部 12 个零声母音节的示例', () => {
    for (const syllable of ZERO_INITIALS) expect(lexicon.syllableExamples[syllable]).toBeTruthy()
  })
})
