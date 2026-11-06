/**
 * 运行时词表解码测试：覆盖词 / 字分流、freqRank、音节表共享、零声母与非法产物报错。
 * 全量「编码 → 解码」一致性由 scripts/validate/public-data.mjs 对真实数据校验。
 */
import { describe, expect, it } from 'vitest'
import {
  RUNTIME_LEXICON_SCHEMA_VERSION,
  decodeRuntimeLexicon,
  type RuntimeLexiconFile,
} from '../src/lib/lexicon.ts'

/** 手写小样本：5 个音节表项、2 个词 + 3 个字，含零声母与跨词条复用的音节。 */
function fixture(overrides: Partial<RuntimeLexiconFile> = {}): RuntimeLexiconFile {
  return {
    schemaVersion: RUNTIME_LEXICON_SCHEMA_VERSION,
    meta: {
      sourceHash: 'test-hash',
      resolverVersion: 1,
      pinyinVersion: 'test',
      wordCount: 2,
      charCount: 3,
      syllableCount: 5,
    },
    syllableTable: [
      ['了', 'liao', 3], // 0
      ['是', 'shi', 4], // 1
      ['一', 'yi', 1], // 2
      ['个', 'ge', 4], // 3
      ['爱', 'ai', 4], // 4（零声母）
    ],
    entries: [
      [1000, 2, 3], // 一个
      [900, 0], // 了
      [800, 1], // 是
      [700, 4], // 爱
      [600, 0, 1], // 了是
    ],
    syllableExamples: {
      liao: {
        char: '了',
        pinyin: 'liao',
        pinyinTone: 'liǎo',
        initial: 'l',
        final: 'iao',
        tone: 3,
      },
    },
    ...overrides,
  }
}

describe('decodeRuntimeLexicon', () => {
  it('按音节数分流 words / chars，并按各自顺序重新赋 freqRank', () => {
    const lexicon = decodeRuntimeLexicon(fixture())
    expect(lexicon.words.map((entry) => entry.text)).toEqual(['一个', '了是'])
    expect(lexicon.chars.map((entry) => entry.text)).toEqual(['了', '是', '爱'])
    expect(lexicon.words.map((entry) => entry.freqRank)).toEqual([1, 2])
    expect(lexicon.chars.map((entry) => entry.freqRank)).toEqual([1, 2, 3])
    expect(lexicon.words[0]).toMatchObject({ length: 2, freq: 1000, chars: ['一', '个'] })
    expect(lexicon.chars[0]).toMatchObject({ length: 1, freq: 900, chars: ['了'] })
  })

  it('音节字段与构建期 resolveLexicon 口径一致（拼音 / 声母 / 韵母 / 声调）', () => {
    const lexicon = decodeRuntimeLexicon(fixture())
    expect(lexicon.words[0]?.syllables).toEqual([
      { text: '一', pinyin: 'yi', initial: 'y', final: 'i', tone: 1 },
      { text: '个', pinyin: 'ge', initial: 'g', final: 'e', tone: 4 },
    ])
    // 零声母：initial 为空字符串，韵母是完整零声母音节。
    expect(lexicon.chars[2]?.syllables[0]).toEqual({
      text: '爱',
      pinyin: 'ai',
      initial: '',
      final: 'ai',
      tone: 4,
    })
  })

  it('同一音节在所有词条间共享同一个对象（避免 5 万词条重复分配）', () => {
    const lexicon = decodeRuntimeLexicon(fixture())
    const liaoInChar = lexicon.chars[0]?.syllables[0]
    const liaoInWord = lexicon.words[1]?.syllables[0]
    expect(liaoInChar).toBe(liaoInWord)
  })

  it('syllableExamples 原样透传', () => {
    const file = fixture()
    expect(decodeRuntimeLexicon(file).syllableExamples).toBe(file.syllableExamples)
  })

  it('版本不匹配时给出可操作的报错', () => {
    expect(() =>
      decodeRuntimeLexicon(fixture({ schemaVersion: RUNTIME_LEXICON_SCHEMA_VERSION - 1 })),
    ).toThrow(/词表数据版本不支持/)
  })

  it('音节下标越界时抛错', () => {
    expect(() => decodeRuntimeLexicon(fixture({ entries: [[100, 99]] }))).toThrow(
      /词表音节下标越界/,
    )
  })

  it('音节表含非法拼音时抛错', () => {
    expect(() =>
      decodeRuntimeLexicon(fixture({ syllableTable: [['哦', 'xx', 1]] as never, entries: [[100, 0]] })),
    ).toThrow(/词表音节表含非法拼音/)
  })

  it('空词条（无音节）视为损坏产物', () => {
    expect(() => decodeRuntimeLexicon(fixture({ entries: [[100]] }))).toThrow(/词表词条音节为空/)
  })
})
