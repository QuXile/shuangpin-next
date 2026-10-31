/**
 * 选词器测试：drill / review / exam / 零声母课 / maxUnfamiliar / seed 可复现 / 多方案。
 */
import { describe, expect, it } from 'vitest'
import type { AtomId, LessonDef } from '../src/types.ts'
import { countFocusHits, selectWords } from '../src/selector.ts'
import { atomMatchesWord } from '../src/atoms.ts'
import {
  findLesson,
  hasZeroSyllable,
  loadCurriculum,
  loadEngine,
  loadPool,
  makeWordEntry,
  unknownBlockingAtoms,
} from './helpers.ts'

const curriculum = loadCurriculum('xiaohe')
const engine = loadEngine('xiaohe')

function select(lessonId: string, count: number, seed = 20261030, learnedExtra: AtomId[] = []) {
  const lesson = findLesson(curriculum, lessonId)
  const pool = loadPool(lessonId)
  return {
    lesson,
    pool,
    words: selectWords({
      words: pool.words,
      engine,
      lesson,
      learnedAtoms: [...(lesson.prerequisites ?? []), ...learnedExtra],
      count,
      seed,
    }),
  }
}

describe('selectWords · 新授课（drill）', () => {
  it('L2.1 声母 zh：8 个词、长度合规、未知原子 ⊆ focus、每词命中 zh', () => {
    const { words, lesson } = select('L2.1', 8)
    expect(words.length).toBe(8)
    const focus = new Set(lesson.blockingAtoms)
    for (const word of words) {
      expect(word.length).toBeGreaterThanOrEqual(2)
      expect(word.length).toBeLessThanOrEqual(4)
      const unknown = unknownBlockingAtoms(word, engine, lesson.prerequisites)
      for (const atom of unknown) expect(focus.has(atom), `${word.text} ${atom}`).toBe(true)
      expect(atomMatchesWord('initial:zh', word), word.text).toBe(true)
    }
    expect(new Set(words.map((word) => word.text)).size).toBe(words.length)
  })

  it('L2.1 focus 覆盖：zh 在同卷出现 ≥3 次', () => {
    const { words, lesson } = select('L2.1', 8)
    const hits = countFocusHits(words, lesson.focusAtoms)
    expect(hits['initial:zh'] ?? 0).toBeGreaterThanOrEqual(3)
  })

  it('L3.1 韵母 ai：未知原子 ⊆ {final:ai}', () => {
    const { words, lesson } = select('L3.1', 8)
    for (const word of words) {
      const unknown = unknownBlockingAtoms(word, engine, lesson.prerequisites)
      for (const atom of unknown) expect(atom).toBe('final:ai')
    }
  })

  it('maxUnfamiliar=2 时允许少量预习原子', () => {
    const { lesson } = select('L2.1', 8)
    const result = selectWords({
      words: loadPool('L2.1').words,
      engine,
      lesson,
      learnedAtoms: lesson.prerequisites,
      count: 8,
      seed: 7,
      maxUnfamiliar: 2,
    })
    expect(result.length).toBe(8)
    for (const word of result) {
      const unknown = unknownBlockingAtoms(word, engine, lesson.prerequisites)
      expect(unknown.length).toBeLessThanOrEqual(2)
    }
  })
})

describe('selectWords · 复习/考核课', () => {
  for (const lessonId of ['L9.1', 'L9.2', 'L10.1']) {
    it(`${lessonId}：全部为已学词（无未知阻塞原子），且命中 focus`, () => {
      const { words, lesson } = select(lessonId, 20)
      expect(words.length).toBe(20)
      for (const word of words) {
        expect(unknownBlockingAtoms(word, engine, lesson.prerequisites)).toEqual([])
        const hits = lesson.focusAtoms.filter((atom) => atomMatchesWord(atom, word))
        expect(hits.length, word.text).toBeGreaterThan(0)
      }
    })
  }

  it('L2.5 复习课不再因 B 层门控而落空', () => {
    const { words } = select('L2.5', 12)
    expect(words.length).toBe(12)
  })
})

describe('selectWords · 零声母与规则课', () => {
  it('L2.4 零声母课：所选词全部含零声母音节', () => {
    const { words } = select('L2.4', 8)
    expect(words.length).toBe(8)
    for (const word of words) expect(hasZeroSyllable(word), word.text).toBe(true)
  })

  it('L8.4 u 与 ü 家族复习课：全部词命中 focus', () => {
    const { words, lesson } = select('L8.4', 8)
    for (const word of words) {
      const hits = lesson.focusAtoms.filter((atom) => atomMatchesWord(atom, word))
      expect(hits.length, word.text).toBeGreaterThan(0)
    }
  })

  it('未学任何零声母时不选含零声母词', () => {
    const lesson = findLesson(curriculum, 'L2.1')
    const words = selectWords({
      words: loadPool('L2.1').words,
      engine,
      lesson,
      learnedAtoms: [],
      count: 20,
      seed: 5,
    })
    for (const word of words) expect(hasZeroSyllable(word), word.text).toBe(false)
  })
})

describe('selectWords · 可复现与不足', () => {
  it('同 seed 结果一致，不同 seed 结果不同（确定性）', () => {
    const first = select('L3.1', 10, 123).words.map((word) => word.text)
    const second = select('L3.1', 10, 123).words.map((word) => word.text)
    const third = select('L3.1', 10, 456).words.map((word) => word.text)
    expect(first).toEqual(second)
    expect(third).not.toEqual(first)
  })

  it('count 超过候选时返回全部可用词', () => {
    const { words } = select('L2.4', 600)
    expect(words.length).toBeGreaterThan(0)
    expect(words.length).toBeLessThanOrEqual(600)
  })

  it('复习课：未学 final:v 时排除含 n/l+ü 的词，已学后可选到', () => {
    const weiruan = loadEngine('weiruan')
    const base = findLesson(loadCurriculum('weiruan'), 'L9.1')
    // 去掉 focus 与 blocking，验证纯「未知阻塞原子」门控
    const lesson = { ...base, focusAtoms: [], blockingAtoms: [], nonBlockingAtoms: [] }
    const words = [makeWordEntry('旅游', ['lv', 'you']), makeWordEntry('学习', ['xue', 'xi'])]
    const withoutVAtoms = lesson.prerequisites.filter((atom) => atom !== 'final:v')
    const withV = selectWords({
      words,
      engine: weiruan,
      lesson,
      learnedAtoms: lesson.prerequisites,
      count: 2,
      seed: 9,
    })
    const withoutV = selectWords({
      words,
      engine: weiruan,
      lesson,
      learnedAtoms: withoutVAtoms,
      count: 2,
      seed: 9,
    })
    expect(withoutV.map((word) => word.text)).not.toContain('旅游')
    expect(withV.map((word) => word.text)).toContain('旅游')
  })
})

describe('无 focus 兜底', () => {
  it('lesson.focusAtoms 为空时按已学词随机组卷', () => {
    const base = findLesson(curriculum, 'L9.1')
    const lesson: LessonDef = {
      ...base,
      focusAtoms: [],
      blockingAtoms: [],
      nonBlockingAtoms: [],
      prerequisites: base.prerequisites,
    }
    const words = selectWords({
      words: loadPool('L9.1').words,
      engine,
      lesson,
      learnedAtoms: base.prerequisites,
      count: 10,
      seed: 3,
    })
    expect(words.length).toBe(10)
  })
})
