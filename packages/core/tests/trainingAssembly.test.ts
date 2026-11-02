/**
 * 训练场装配测试（core training.ts）：键位选项、条目装配、批次、文章计划。
 */
import { describe, expect, it } from 'vitest'
import type { Initial, SyllableFinal } from '../src/types.ts'
import {
  articlesToPracticeWords,
  atomOptionsOf,
  buildArticlePlan,
  buildTrainingBatch,
  entriesToPracticeWords,
  entryToPracticeWord,
} from '../src/training.ts'
import { loadEngine, loadLexicon, loadSchemeDef, makeWordEntry } from './helpers.ts'

const engine = loadEngine('xiaohe')
const lexicon = loadLexicon()
const chars = lexicon.chars.slice(0, 20)

describe('atomOptionsOf / 条目装配', () => {
  it('atomOptionsOf 与方案三张键位表一致', () => {
    const def = loadSchemeDef('xiaohe')
    const options = atomOptionsOf(def)
    expect(options.initials).toEqual(Object.keys(def.initials))
    expect(options.finals).toEqual(Object.keys(def.finals))
    expect(options.zeroFinals).toEqual(Object.keys(def.zeroInitial))
  })

  it('entryToPracticeWord 正常构建；方案缺音节时返回 null', () => {
    const word = entryToPracticeWord(engine, chars[0]!)
    expect(word?.caps.length).toBeGreaterThan(0)
    const broken = makeWordEntry('呃', ['e'])
    broken.syllables = [
      { text: '呃', pinyin: 'be', initial: 'b' as Initial, final: 'er' as SyllableFinal },
    ]
    expect(entryToPracticeWord(engine, broken)).toBeNull()
    expect(entriesToPracticeWords(engine, [chars[0]!, broken])).toHaveLength(1)
  })
})

describe('buildTrainingBatch', () => {
  it('取够目标数量、全部可判题；同 seed 可复现、不同 seed 顺序不同', () => {
    const first = buildTrainingBatch(engine, chars, 10, 42)
    const again = buildTrainingBatch(engine, chars, 10, 42)
    const other = buildTrainingBatch(engine, chars, 10, 7)
    expect(first).toHaveLength(10)
    expect(again.map((word) => word.text)).toEqual(first.map((word) => word.text))
    expect(other.map((word) => word.text)).not.toEqual(first.map((word) => word.text))
    for (const word of first) {
      expect(word.caps.length).toBeGreaterThan(0)
      expect(word.syllables.length).toBeGreaterThan(0)
    }
  })

  it('空条目 / 非正数量返回空数组', () => {
    expect(buildTrainingBatch(engine, [], 10)).toEqual([])
    expect(buildTrainingBatch(engine, chars, 0)).toEqual([])
  })
})

describe('buildArticlePlan / articlesToPracticeWords', () => {
  it('字库内汉字分配词下标，字库外跳过并计数', () => {
    const [a, b, c] = chars.map((entry) => entry.text)
    const lines = [[a!, b!, 'X'], [c!]]
    const plan = buildArticlePlan(lines, chars)
    expect(plan.chars).toEqual([a, b, 'X', c])
    expect(plan.skipped).toBe(1)
    expect(plan.cells[0]?.map((cell) => cell.wordIndex)).toEqual([0, 1, null])
    expect(plan.cells[1]?.[0]?.wordIndex).toBe(2)
  })

  it('按文章固定顺序装配练习词（跳过字库外汉字）', () => {
    const [a, b, c] = chars.map((entry) => entry.text)
    const plan = buildArticlePlan([[a!, 'X', b!], [c!]], chars)
    const words = articlesToPracticeWords(engine, plan, chars)
    expect(words.map((word) => word.text)).toEqual([a, b, c])
    for (const word of words) expect(word.caps.length).toBeGreaterThan(0)
  })
})
