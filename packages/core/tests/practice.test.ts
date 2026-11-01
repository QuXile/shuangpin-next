/**
 * 练习展示模型测试：真实词池数据 + 多方案（小鹤/微软）的键帽、零声母、判定序列一致性。
 */
import { describe, expect, it } from 'vitest'
import { buildPracticeWord, buildPracticeWordFromSyllable } from '../src/practice.ts'
import { loadEngine, loadPool, loadWordBank, findWord, makeSingleCharEntry } from './helpers.ts'

const xiaohe = loadEngine('xiaohe')
const words = loadWordBank()

describe('buildPracticeWord · 真实词库', () => {
  it('银行（yín háng）：键帽 y,b / h,h；多音标记保留', () => {
    const entry = findWord(words, '银行')
    const word = buildPracticeWord(xiaohe, entry)
    expect(word.text).toBe('银行')
    expect(word.chars).toEqual(['银', '行'])
    expect(word.syllables.map((syllable) => syllable.caps.map((cap) => cap.key))).toEqual([
      ['y', 'b'],
      ['h', 'h'],
    ])
    expect(word.polyphone).toBe(true)
    expect(word.caps).toHaveLength(4)
  })

  it('女人（nǚ rén）：ü 记 v，键帽 n,v / r,f', () => {
    const word = buildPracticeWord(xiaohe, findWord(words, '女人'))
    expect(word.syllables[0]?.caps.map((cap) => cap.key)).toEqual(['n', 'v'])
    expect(word.syllables[0]?.pinyinTone).toBe('nǚ')
  })

  it('爱情（ài qíng）：零声母两枚键帽均 role=final、atomId=zero:ai', () => {
    const word = buildPracticeWord(xiaohe, findWord(words, '爱情'))
    const first = word.syllables[0]
    expect(first?.zeroInitial).toBe(true)
    expect(first?.caps.map((cap) => cap.role)).toEqual(['final', 'final'])
    expect(first?.caps.map((cap) => cap.atomId)).toEqual(['zero:ai', 'zero:ai'])
    expect(first?.caps.map((cap) => cap.key)).toEqual(['a', 'i'])
  })

  it('学习（xué xí）：xue→x,t', () => {
    const word = buildPracticeWord(xiaohe, findWord(words, '学习'))
    expect(word.syllables[0]?.caps.map((cap) => cap.key)).toEqual(['x', 't'])
    expect(word.caps).toHaveLength(4)
  })

  it('过去（guò qù）：qu 主键 q,u（jqxy+ü 用 U 键），accepted 含 qu/qv', () => {
    const word = buildPracticeWord(xiaohe, findWord(words, '过去'))
    const qu = word.syllables[1]
    expect(qu?.caps.map((cap) => cap.key)).toEqual(['q', 'u'])
    expect(qu?.accepted).toContain('qu')
    expect(qu?.accepted).toContain('qv')
  })

  it('战略（zhàn lüè）：lve→l,t', () => {
    const word = buildPracticeWord(xiaohe, findWord(words, '战略'))
    expect(word.syllables[1]?.caps.map((cap) => cap.key)).toEqual(['l', 't'])
    expect(word.syllables[1]?.pinyinTone).toBe('lüè')
  })

  it('微软方案：qu 主键 q,u，accepted 含 qu/qy；nv 主键 n,y', () => {
    const weiruan = loadEngine('weiruan')
    const quWord = buildPracticeWord(weiruan, findWord(words, '过去'))
    expect(quWord.syllables[1]?.caps.map((cap) => cap.key)).toEqual(['q', 'u'])
    expect(quWord.syllables[1]?.accepted).toEqual(expect.arrayContaining(['qu', 'qy']))
    const nvWord = buildPracticeWord(weiruan, findWord(words, '女人'))
    expect(nvWord.syllables[0]?.caps.map((cap) => cap.key)).toEqual(['n', 'y'])
  })
})

describe('buildPracticeWord · 单字与结构不变量', () => {
  it('爱（ài）单字零声母：两枚 role=final 键帽 a,i', () => {
    const word = buildPracticeWordFromSyllable(xiaohe, {
      text: '爱',
      pinyin: 'ai',
      initial: '',
      final: 'ai',
      tone: 4,
      zeroInitial: true,
    })
    expect(word.caps.map((cap) => cap.key)).toEqual(['a', 'i'])
    expect(word.text).toBe('爱')
  })

  it('每个音节键帽数 = 主键长度，caps 与 syllables 对齐，accepted 全小写', () => {
    for (const text of ['银行', '女人', '爱情', '学习', '战略']) {
      const word = buildPracticeWord(xiaohe, findWord(words, text))
      expect(word.caps).toEqual(word.syllables.flatMap((syllable) => syllable.caps))
      for (const syllable of word.syllables) {
        expect(syllable.accepted.length).toBeGreaterThan(0)
        for (const sequence of syllable.accepted) expect(sequence).toBe(sequence.toLowerCase())
      }
    }
  })

  it('C 双拼 zero:eng 按 fcitx sp.dat 构建为 eg', () => {
    const c = loadEngine('c')
    const word = buildPracticeWordFromSyllable(c, {
      text: '鞥',
      pinyin: 'eng',
      initial: '',
      final: 'eng',
      tone: 1,
      zeroInitial: true,
    })
    expect(word.caps.map((cap) => cap.key)).toEqual(['e', 'g'])
    expect(word.syllables[0]?.accepted).toEqual(['eg'])
  })
})

describe('buildPracticeWord · 真实词池示例', () => {
  it('L2.1 词池 examples 全部可按小鹤方案构建', () => {
    const pool = loadPool('L2.1')
    expect(pool.examples.length).toBeGreaterThan(0)
    for (const example of pool.examples) {
      const word = buildPracticeWordFromSyllable(xiaohe, {
        text: example.char,
        pinyin: example.pinyin,
        initial: example.initial,
        final: example.final,
        tone: example.tone,
        zeroInitial: example.initial === '',
      })
      expect(word.caps.length, example.char).toBeGreaterThan(0)
    }
    expect(makeSingleCharEntry('女', 'nv', 3).syllables[0]?.final).toBe('v')
  })
})
