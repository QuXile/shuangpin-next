/**
 * 训练场装配测试（core training.ts）：键位选项、条目装配、训练批次。
 */
import { describe, expect, it } from 'vitest'
import type { Initial, SyllableFinal } from '../src/types.ts'
import {
  atomOptionsOf,
  buildTrainingBatch,
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
