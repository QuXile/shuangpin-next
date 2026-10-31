/**
 * 练习板块纯函数测试：范围过滤与文章解析。
 */
import { describe, expect, it } from 'vitest'
import type { Initial, SchemeDef, SyllableFinal, WordEntry } from '../src/types.ts'
import { filterTrainingEntries, freeTrainingAtoms, parseArticleText } from '../src/training.ts'

function entry(text: string, syllables: Array<{ initial: string; final: string }>): WordEntry {
  return {
    text,
    length: Array.from(text).length,
    freq: 100,
    freqRank: 1,
    syllables: syllables.map((syllable, index) => ({
      text: text[index] ?? '',
      pinyin: `${syllable.initial}${syllable.final}`,
      initial: syllable.initial as Initial,
      final: syllable.final as SyllableFinal,
      tone: 1,
    })),
    chars: Array.from(text),
    minCharRank: 100,
  }
}

describe('filterTrainingEntries · 范围过滤', () => {
  const entries = [
    entry('字', [{ initial: 'z', final: 'i' }]),
    entry('词', [{ initial: 'c', final: 'i' }]),
    entry('爱', [{ initial: '', final: 'ai' }]),
    entry('摘', [{ initial: 'zh', final: 'ai' }]),
    entry('中国', [{ initial: 'zh', final: 'ong' }, { initial: 'g', final: 'uo' }]),
  ]

  it('字：声母、韵母都必须命中', () => {
    expect(filterTrainingEntries(entries, { initials: ['z', 'c'], finals: ['i'] }).map((e) => e.text)).toEqual(['字', '词'])
    expect(filterTrainingEntries(entries, { initials: ['zh'], finals: ['ai'] }).map((e) => e.text)).toEqual(['摘'])
  })

  it('零声母需要显式选中空声母', () => {
    expect(filterTrainingEntries(entries, { initials: ['z'], finals: ['ai'] })).toEqual([])
    expect(filterTrainingEntries(entries, { initials: [''], finals: ['ai'] }).map((e) => e.text)).toEqual(['爱'])
  })

  it('零声母可按音节逐项选择（zeroFinals）', () => {
    expect(
      filterTrainingEntries(entries, { initials: [''], finals: ['ai'], zeroFinals: ['ai'] }).map((e) => e.text),
    ).toEqual(['爱'])
    expect(filterTrainingEntries(entries, { initials: [''], finals: ['ai'], zeroFinals: [] })).toEqual([])
    expect(filterTrainingEntries(entries, { initials: [''], finals: ['ai'], zeroFinals: ['an'] })).toEqual([])
    // 零声母独立选择：即使普通韵母未勾选，只要 zeroFinals 命中就可以练
    expect(filterTrainingEntries(entries, { initials: [], finals: [], zeroFinals: ['ai'] }).map((e) => e.text)).toEqual(['爱'])
  })

  it('词：每个音节都必须命中', () => {
    expect(filterTrainingEntries(entries, { initials: ['zh', 'g'], finals: ['ong', 'uo'] }).map((e) => e.text)).toEqual(['中国'])
    expect(filterTrainingEntries(entries, { initials: ['zh'], finals: ['ong'] })).toEqual([])
  })
})

describe('parseArticleText · 文章解析', () => {
  it('只保留汉字，标点断行且不显示', () => {
    const { chars, lines } = parseArticleText('你好，世界！')
    expect(chars).toEqual(['你', '好', '世', '界'])
    expect(lines).toEqual([['你', '好'], ['世', '界']])
  })

  it('每行最多 5 个汉字', () => {
    const { lines } = parseArticleText('一二三四五六七')
    expect(lines).toEqual([['一', '二', '三', '四', '五'], ['六', '七']])
  })

  it('引号、括号、字母数字、空白与换行都作为断行', () => {
    const { chars, lines } = parseArticleText('“你好”（世界）abc 123\n再见')
    expect(chars).toEqual(['你', '好', '世', '界', '再', '见'])
    expect(lines).toEqual([['你', '好'], ['世', '界'], ['再', '见']])
  })

  it('连续分隔合并、空文本返回空', () => {
    expect(parseArticleText('，，，').lines).toEqual([])
    expect(parseArticleText('').chars).toEqual([])
    expect(parseArticleText('甲 乙').lines).toEqual([['甲'], ['乙']])
  })
})

describe('freeTrainingAtoms · 当前方案与全拼的公共键位', () => {
  function scheme(
    initials: Record<string, string[]>,
    finals: Record<string, string[]>,
    zeroInitial: Record<string, string[]>,
  ): SchemeDef {
    return { id: 'test', name: '测试', type: 'compositional', initials, finals, zeroInitial } as SchemeDef
  }

  it('free atom 只认与全拼拼写完全一致的键位', () => {
    const free = freeTrainingAtoms(
      scheme(
        { b: ['b'], zh: ['v'], ch: ['i'] },
        { a: ['a'], ai: ['d'], o: ['o'] },
        { ai: ['ai'], an: ['an'], a: ['aa'] },
      ),
    )
    expect(free.initials).toEqual(['b'])
    expect(free.finals).toEqual(['a', 'o'])
    expect(free.zeroFinals).toEqual(['ai', 'an'])
  })

})
