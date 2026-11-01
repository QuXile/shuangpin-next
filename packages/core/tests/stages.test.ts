/**
 * 阶段计划与内容装配测试：lessonStages / 阶段门槛 / 单字 / 词语 / 教学示例。
 */
import { describe, expect, it } from 'vitest'
import { ZERO_INITIALS } from '../src/pinyin.ts'
import {
  KIND_STAGE_MIN_WORDS,
  buildSingleCharWords,
  buildTutorialWords,
  buildWordStageWords,
  hintTierFor,
  lessonStageMinWords,
  lessonStages,
  stageGate,
} from '../src/stages.ts'
import { findLesson, loadCurriculum, loadEngine, loadPool } from './helpers.ts'

const curriculum = loadCurriculum('xiaohe')
const engine = loadEngine('xiaohe')

describe('lessonStages / lessonStageMinWords（三阶段词口径）', () => {
  it('按课程类型给出阶段：每课最后一场都是无提示考核', () => {
    expect(lessonStages(findLesson(curriculum, 'L1.1'))).toEqual([])
    expect(lessonStages(findLesson(curriculum, 'L2.1'))).toEqual(['single', 'word', 'exam'])
    expect(lessonStages(findLesson(curriculum, 'L2.4'))).toEqual(['single', 'word', 'exam'])
    expect(lessonStages(findLesson(curriculum, 'L2.5'))).toEqual(['exam'])
    expect(lessonStages(findLesson(curriculum, 'L5.1'))).toEqual(['exam'])
    expect(lessonStages(findLesson(curriculum, 'L9.2'))).toEqual(['exam'])
    expect(lessonStages(findLesson(curriculum, 'L10.1'))).toEqual(['exam'])
  })

  it('按课程类型给出阶段最低词数（15/15/25、50、100）', () => {
    expect(KIND_STAGE_MIN_WORDS.drill).toEqual({ single: 15, word: 15, exam: 25 })
    expect(KIND_STAGE_MIN_WORDS.review).toEqual({ exam: 50 })
    expect(KIND_STAGE_MIN_WORDS.exam).toEqual({ exam: 100 })
    expect(lessonStageMinWords(findLesson(curriculum, 'L2.1'))).toEqual({
      single: 15,
      word: 15,
      exam: 25,
    })
    expect(lessonStageMinWords(findLesson(curriculum, 'L2.4'))).toEqual({
      single: 15,
      word: 15,
      exam: 25,
    })
    expect(lessonStageMinWords(findLesson(curriculum, 'L2.5'))).toEqual({ exam: 50 })
    expect(lessonStageMinWords(findLesson(curriculum, 'L5.2'))).toEqual({ exam: 50 })
    expect(lessonStageMinWords(findLesson(curriculum, 'L9.1'))).toEqual({ exam: 50 })
    expect(lessonStageMinWords(findLesson(curriculum, 'L10.1'))).toEqual({ exam: 100 })
  })

  it('阶段门槛：字 / 词语部分提示只看词数，无提示考核还要达到考核标准', () => {
    const drill = findLesson(curriculum, 'L2.1')
    expect(
      stageGate(drill, 'single', { accuracy: 1, cpm: 0, completedWords: 14 }),
    ).toMatchObject({ strict: false, met: false })
    expect(
      stageGate(drill, 'single', { accuracy: 0.5, cpm: 0, completedWords: 15 }),
    ).toMatchObject({ strict: false, met: true })
    expect(
      stageGate(drill, 'word', { accuracy: 0.5, cpm: 0, completedWords: 15 }).met,
    ).toBe(true)
    expect(
      stageGate(drill, 'exam', { accuracy: 0.85, cpm: 0, completedWords: 25 }).met,
    ).toBe(true)
    expect(
      stageGate(drill, 'exam', { accuracy: 0.84, cpm: 0, completedWords: 25 }).met,
    ).toBe(false)

    const review = findLesson(curriculum, 'L2.5')
    expect(
      stageGate(review, 'exam', { accuracy: 0.85, cpm: 45, completedWords: 50 }).met,
    ).toBe(true)
    expect(
      stageGate(review, 'exam', { accuracy: 0.85, cpm: 44, completedWords: 50 }).met,
    ).toBe(false)
    expect(
      stageGate(review, 'exam', { accuracy: 0.85, cpm: 45, completedWords: 49 }).met,
    ).toBe(false)

    const midSpeed = findLesson(curriculum, 'L5.2')
    expect(
      stageGate(midSpeed, 'exam', { accuracy: 0.85, cpm: 45, completedWords: 50 }).met,
    ).toBe(true)
    expect(
      stageGate(midSpeed, 'exam', { accuracy: 0.85, cpm: 44, completedWords: 50 }),
    ).toMatchObject({ strict: true, met: false })

    const exam = findLesson(curriculum, 'L10.1')
    expect(
      stageGate(exam, 'exam', { accuracy: 0.9, cpm: 45, completedWords: 100 }).met,
    ).toBe(true)
    const failed = stageGate(exam, 'exam', { accuracy: 0.9, cpm: 44, completedWords: 100 })
    expect(failed.met).toBe(false)
    expect(failed.reasons.join()).toMatch(/速度/)
  })
})

describe('hintTierFor', () => {
  it('提示档位由阶段唯一决定：单字 1、词语部分提示 2、无提示 3', () => {
    expect(hintTierFor('single')).toBe(1)
    expect(hintTierFor('word')).toBe(2)
    expect(hintTierFor('exam')).toBe(3)
  })
})

describe('buildSingleCharWords', () => {
  it('L2.1：10 张单字卡，全部命中声母 zh 且原子已知', () => {
    const lesson = findLesson(curriculum, 'L2.1')
    const pool = loadPool('L2.1')
    const words = buildSingleCharWords({
      engine,
      lesson,
      pool,
      learnedAtoms: lesson.prerequisites,
      count: 10,
      seed: 42,
    })
    expect(words).toHaveLength(10)
    const focus = new Set(lesson.focusAtoms)
    for (const word of words) {
      expect(word.syllables).toHaveLength(1)
      const atoms = word.caps.map((cap) => cap.atomId)
      expect(atoms.some((atom) => focus.has(atom)), word.text).toBe(true)
    }
    expect(new Set(words.map((word) => word.text)).size).toBeGreaterThanOrEqual(9)
  })

  it('L2.4 零声母课：10 张单字卡，全部是零声母音节', () => {
    const lesson = findLesson(curriculum, 'L2.4')
    const pool = loadPool('L2.4')
    const words = buildSingleCharWords({
      engine,
      lesson,
      pool,
      learnedAtoms: lesson.prerequisites,
      count: 10,
      seed: 1,
    })
    expect(words).toHaveLength(10)
    for (const word of words) expect(word.syllables[0]?.zeroInitial).toBe(true)
  })

  it('稀有韵母课（L8.3 ü 组）用同键位字补齐到 10 张', () => {
    const lesson = findLesson(curriculum, 'L8.3')
    const pool = loadPool('L8.3')
    const words = buildSingleCharWords({
      engine,
      lesson,
      pool,
      learnedAtoms: lesson.prerequisites,
      count: 10,
      seed: 3,
    })
    expect(words).toHaveLength(10)
  })
})

describe('buildWordStageWords（按词数）', () => {
  it('L2.1 词语部分提示：≥10 词且每词命中 zh', () => {
    const lesson = findLesson(curriculum, 'L2.1')
    const words = buildWordStageWords({
      engine,
      lesson,
      pool: loadPool('L2.1'),
      learnedAtoms: lesson.prerequisites,
      targetWords: 10,
      seed: 7,
    })
    expect(words.length).toBeGreaterThanOrEqual(10)
    for (const word of words) {
      expect(word.caps.some((cap) => cap.atomId === 'initial:zh')).toBe(true)
    }
  })

  it('L10.1 通关考核：≥80 词，全部可判题', () => {
    const lesson = findLesson(curriculum, 'L10.1')
    const words = buildWordStageWords({
      engine,
      lesson,
      pool: loadPool('L10.1'),
      learnedAtoms: lesson.prerequisites,
      targetWords: 80,
      seed: 11,
    })
    expect(words.length).toBeGreaterThanOrEqual(80)
    for (const word of words) expect(word.caps.length).toBeGreaterThan(0)
  })
})

describe('同键双韵课（L3.6 ia/ua）', () => {
  it('单字与词语阶段都只练 ia/ua 两个韵母，且至少命中其一', () => {
    const lesson = findLesson(curriculum, 'L3.6')
    expect(lesson.focusAtoms.filter((atom) => atom.startsWith('final:'))).toEqual([
      'final:ia',
      'final:ua',
    ])
    const single = buildSingleCharWords({
      engine,
      lesson,
      pool: loadPool('L3.6'),
      learnedAtoms: lesson.prerequisites,
      count: 10,
      seed: 5,
    })
    expect(single.length).toBe(10)
    for (const word of single) {
      const finals = word.caps.map((cap) => cap.atomId)
      expect(finals.some((atom) => atom === 'final:ia' || atom === 'final:ua'), word.text).toBe(true)
    }
    const words = buildWordStageWords({
      engine,
      lesson,
      pool: loadPool('L3.6'),
      learnedAtoms: lesson.prerequisites,
      targetWords: 10,
      seed: 5,
    })
    expect(words.length).toBeGreaterThanOrEqual(10)
  })
})

describe('buildTutorialWords', () => {
  it('L2.1：展示该课所有含 zh 的音节（每音一张）', () => {
    const lesson = findLesson(curriculum, 'L2.1')
    const pool = loadPool('L2.1')
    const words = buildTutorialWords({ engine, lesson, pool })
    expect(words.length).toBe(pool.examples.length)
    expect(words.length).toBeGreaterThan(0)
    expect(new Set(words.map((word) => word.syllables[0]?.pinyin)).size).toBe(words.length)
    for (const word of words) expect(word.caps.length).toBeGreaterThan(0)
  })

  it('L2.4：12 个零声母示例，顺序 = 课程 focus 顺序', () => {
    const lesson = findLesson(curriculum, 'L2.4')
    const words = buildTutorialWords({ engine, lesson, pool: loadPool('L2.4') })
    expect(words).toHaveLength(12)
    expect(words.map((word) => word.syllables[0]?.final)).toEqual([...ZERO_INITIALS])
  })

  it('L9.1：综合课示例覆盖全部音节', () => {
    const lesson = findLesson(curriculum, 'L9.1')
    const pool = loadPool('L9.1')
    const words = buildTutorialWords({ engine, lesson, pool })
    expect(words.length).toBe(pool.examples.length)
    expect(words.length).toBeGreaterThan(300)
  })
})

describe('确定性选题：零声母 / 复习 / 同键覆盖', () => {
  function totals(lessonId: string, count: number) {
    const lesson = findLesson(curriculum, lessonId)
    const pool = loadPool(lessonId)
    const total = Object.fromEntries(lesson.focusAtoms.map((atom) => [atom, 0]))
    for (let seed = 1; seed <= 5; seed += 1) {
      const words = buildWordStageWords({
        engine,
        lesson,
        pool,
        learnedAtoms: lesson.prerequisites,
        targetWords: count,
        seed,
      })
      for (const word of words) {
        for (const syllable of word.syllables) {
          if (syllable.initial === '') {
            const atom = `zero:${syllable.final}`
            if (atom in total) total[atom] += 1
          } else {
            const initial = `initial:${syllable.initial}`
            const final = `final:${syllable.final}`
            if (initial in total) total[initial] += 1
            if (final in total) total[final] += 1
          }
        }
      }
    }
    return total
  }

  it('L2.4 零声母 12 个音节都至少出现一次', () => {
    const total = totals('L2.4', 25)
    for (const atom of Object.keys(total)) expect(total[atom], atom).toBeGreaterThan(0)
  })

  it('L9.1 复习的每个 focus 都至少出现一次', () => {
    const total = totals('L9.1', 50)
    for (const atom of Object.keys(total)) expect(total[atom], atom).toBeGreaterThan(0)
  })

  it('同键课两个 focus 都出现，且都达到目标词量', () => {
    for (const id of ['L3.6', 'L3.9', 'L4.3']) {
      const total = totals(id, 25)
      for (const atom of Object.keys(total)) expect(total[atom], `${id} ${atom}`).toBeGreaterThan(0)
    }
  })
})
