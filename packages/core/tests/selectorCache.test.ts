/**
 * 选词缓存一致性测试：候选表 / 稀疏 focus 兜底缓存在热路径与冷构建之间必须逐词等价。
 * 这些测试锁定「缓存只省重复构建，不改变任何选词结果」这一契约。
 */
import { describe, expect, it } from 'vitest'
import type { WordEntry } from '../src/types.ts'
import { selectWords } from '../src/selector.ts'
import { buildWordStageWords } from '../src/lesson.ts'
import { findLesson, loadCurriculum, loadEngine, loadPool } from './helpers.ts'

const curriculum = loadCurriculum('xiaohe')
const engine = loadEngine('xiaohe')

describe('selectWords · 候选缓存一致性', () => {
  const cases: Array<{ lessonId: string; count: number; seed: number }> = [
    { lessonId: 'L2.1', count: 20, seed: 11 },
    { lessonId: 'L9.1', count: 50, seed: 7 },
    { lessonId: 'L10.1', count: 100, seed: 3 },
  ]

  for (const { lessonId, count, seed } of cases) {
    it(`${lessonId}：缓存复用 / 冷构建 / 换 seed 结果与旧口径一致`, () => {
      const lesson = findLesson(curriculum, lessonId)
      const pool = loadPool(lessonId)
      const input = {
        words: pool.words,
        engine,
        lesson,
        learnedAtoms: lesson.prerequisites,
        count,
        seed,
      }
      const cold = selectWords(input).map((word) => word.text)
      const reused = selectWords(input).map((word) => word.text)
      expect(reused).toEqual(cold)
      // 复制 lesson 对象让候选表缓存失效，模拟首次组卷的完整过滤路径。
      const coldAgain = selectWords({ ...input, lesson: { ...lesson } }).map((word) => word.text)
      expect(coldAgain).toEqual(cold)
      // 换 seed 时仍必须在同一候选表上重新加权随机。
      const otherSeed = selectWords({ ...input, seed: seed + 1 }).map((word) => word.text)
      expect(otherSeed.length, lessonId).toBe(cold.length)
    })
  }

  it('已学原子变化时缓存失效并重新过滤（不会复用旧候选表）', () => {
    const lesson = findLesson(curriculum, 'L2.1')
    const pool = loadPool('L2.1')
    const input = {
      words: pool.words,
      engine,
      lesson,
      count: 20,
      seed: 9,
    }
    // 先以完整 prerequisites 建立缓存
    const learned = selectWords({ ...input, learnedAtoms: lesson.prerequisites }).map(
      (word) => word.text,
    )
    expect(learned.length).toBe(20)
    // 再以空已学列表组卷：必须重新过滤（多数预习原子被排除），不得复用上一份候选
    const rebuilt = selectWords({ ...input, learnedAtoms: [] }).map((word) => word.text)
    const coldRebuilt = selectWords({
      ...input,
      lesson: { ...lesson },
      learnedAtoms: [],
    }).map((word) => word.text)
    expect(rebuilt).toEqual(coldRebuilt)
  })

  it('extraWords 追加候选：重复调用与冷构建结果一致（含覆盖 focus 的单字兜底）', () => {
    const lesson = findLesson(curriculum, 'L2.1')
    const pool = loadPool('L2.1')
    const extraWords = pool.chars.slice(0, 40)
    const input = {
      words: pool.words,
      engine,
      lesson,
      learnedAtoms: lesson.prerequisites,
      count: 20,
      seed: 6,
      extraWords,
    }
    const first = selectWords(input).map((word) => word.text)
    const second = selectWords(input).map((word) => word.text)
    const cold = selectWords({ ...input, lesson: { ...lesson } }).map((word) => word.text)
    expect(second).toEqual(first)
    expect(cold).toEqual(first)
  })

  it('重复 focus 原子（异常数据）下缓存复用与冷构建结果一致', () => {
    const base = findLesson(curriculum, 'L10.1')
    const pool = loadPool('L10.1')
    const lesson = { ...base, focusAtoms: ['initial:zh' as const, 'initial:zh' as const] }
    const input = {
      words: pool.words,
      engine,
      lesson,
      learnedAtoms: base.prerequisites,
      count: 40,
      seed: 3,
    }
    const warm = selectWords(input).map((word) => word.text)
    const reused = selectWords(input).map((word) => word.text)
    const cold = selectWords({ ...input, lesson: { ...lesson } }).map((word) => word.text)
    expect(reused).toEqual(warm)
    expect(cold).toEqual(warm)
  })

  it('空词表 / 无候选返回空数组', () => {
    const lesson = findLesson(curriculum, 'L10.1')
    expect(
      selectWords({ words: [], engine, lesson, learnedAtoms: lesson.prerequisites, count: 5, seed: 1 }),
    ).toEqual([])
    // 词表里只有零声母词，却要求 initial:zh 的 focus：没有任何候选，返回空数组。
    const impossible = {
      ...lesson,
      focusAtoms: ['initial:zh' as const],
      blockingAtoms: [],
      nonBlockingAtoms: [],
    }
    expect(
      selectWords({
        words: [zeroInitialWord()],
        engine,
        lesson: impossible,
        learnedAtoms: lesson.prerequisites,
        count: 3,
        seed: 1,
      }),
    ).toEqual([])
  })
})

/** 空候选场景用的词：只有零声母音节，不含 initial:zh。 */
function zeroInitialWord(): WordEntry {
  return {
    text: '爱',
    length: 1,
    freq: 1,
    syllables: [{ text: '爱', pinyin: 'ai', initial: '', final: 'ai' }],
    chars: ['爱'],
  }
}

describe('buildWordStageWords · 稀疏 focus 兜底缓存', () => {
  it('L10.1 通关考核：缓存复用 / 冷构建逐词一致，且稀疏 zero 音按旧口径补入单字', () => {
    const lesson = findLesson(curriculum, 'L10.1')
    const pool = loadPool('L10.1')
    const input = {
      engine,
      lesson,
      pool,
      learnedAtoms: lesson.prerequisites,
      targetWords: 100,
      seed: 3,
    }
    const first = buildWordStageWords(input)
    const reused = buildWordStageWords(input)
    const cold = buildWordStageWords({ ...input, lesson: { ...lesson } })
    expect(reused).toEqual(first)
    expect(cold).toEqual(first)
    expect(first.length).toBe(100)
    // zero:eng / zero:o 在词池里没有支撑词，兜底字表补齐后结果中应出现单字词。
    expect(first.some((word) => word.text.length === 1)).toBe(true)
  })
})
