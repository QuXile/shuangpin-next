/**
 * 拼音基础测试：常量口径、规范化、声调、拆分（含 er 与 jqxy+u 系）、知识点 ID。
 */
import { describe, expect, it } from 'vitest'
import {
  FINALS,
  INITIALS,
  JQXY,
  ZERO_INITIALS,
  atomDisplayLabel,
  atomId,
  detectTone,
  normalizePinyin,
  parseAtomId,
  splitPinyin,
  splitSyllable,
  toToneMarks,
} from '../src/pinyin.ts'

describe('拼音常量', () => {
  it('23 声母 / 33 韵母 / 12 零声母（含 er）', () => {
    expect(INITIALS).toHaveLength(23)
    expect(FINALS).toHaveLength(33)
    expect(ZERO_INITIALS).toHaveLength(12)
    expect(ZERO_INITIALS).toContain('er')
    expect(FINALS).not.toContain('er')
    expect(INITIALS).toContain('zh')
    expect(INITIALS).toContain('ch')
    expect(INITIALS).toContain('sh')
  })

  it('JQXY 集合', () => {
    expect([...JQXY].sort().join('')).toBe('jqxy')
  })
})

describe('normalizePinyin', () => {
  it('去声调符号/数字、ü→v、小写', () => {
    expect(normalizePinyin('Chóng')).toBe('chong')
    expect(normalizePinyin('nǚ')).toBe('nv')
    expect(normalizePinyin('nv3')).toBe('nv')
    expect(normalizePinyin('nü')).toBe('nv')
    expect(normalizePinyin('lüè')).toBe('lve')
    expect(normalizePinyin('lu:e')).toBe('lve')
    expect(normalizePinyin('  QU  ')).toBe('qu')
  })

  it('空输入返回空串', () => {
    expect(normalizePinyin('')).toBe('')
  })
})

describe('detectTone', () => {
  it('声调符号优先，其次末尾数字；无调 undefined', () => {
    expect(detectTone('chóng')).toBe(2)
    expect(detectTone('chong2')).toBe(2)
    expect(detectTone('chong')).toBeUndefined()
    expect(detectTone('nv3')).toBe(3)
  })
})

describe('splitPinyin：规范拆分', () => {
  const cases: { pinyin: string; initial: string; final: string; zero?: boolean }[] = [
    { pinyin: 'zhong', initial: 'zh', final: 'ong' },
    { pinyin: 'chuang', initial: 'ch', final: 'uang' },
    { pinyin: 'shuang', initial: 'sh', final: 'uang' },
    { pinyin: 'xue', initial: 'x', final: 'ue' },
    { pinyin: 'jun', initial: 'j', final: 'un' },
    { pinyin: 'quan', initial: 'q', final: 'uan' },
    { pinyin: 'nv', initial: 'n', final: 'v' },
    { pinyin: 'lve', initial: 'l', final: 've' },
    { pinyin: 'ying', initial: 'y', final: 'ing' },
    { pinyin: 'wu', initial: 'w', final: 'u' },
    { pinyin: 'er', initial: '', final: 'er', zero: true },
    { pinyin: 'ai', initial: '', final: 'ai', zero: true },
    { pinyin: 'zhuang', initial: 'zh', final: 'uang' },
  ]
  for (const item of cases) {
    it(`splitPinyin('${item.pinyin}') → ${item.initial || '∅'} + ${item.final}`, () => {
      expect(splitPinyin(item.pinyin)).toEqual({
        initial: item.initial,
        final: item.final,
        zeroInitial: item.zero === true,
      })
    })
  }

  it('带调输入自动规范化后拆分', () => {
    expect(splitPinyin('Zhōng')).toEqual({ initial: 'zh', final: 'ong', zeroInitial: false })
    expect(splitPinyin('nǚ')).toEqual({ initial: 'n', final: 'v', zeroInitial: false })
  })

  it('非法音节返回 null', () => {
    for (const invalid of ['', 'ter', 'jv', 'foo', 'zhiangx', '123']) {
      expect(splitPinyin(invalid), invalid).toBeNull()
    }
  })

  it('jqxy 后 u 系仍记 u 系，不记 v 系', () => {
    expect(splitPinyin('ju')?.final).toBe('u')
    expect(splitPinyin('jue')?.final).toBe('ue')
    expect(splitPinyin('jun')?.final).toBe('un')
    expect(splitPinyin('juan')?.final).toBe('uan')
  })
})

describe('splitSyllable', () => {
  it('生成 Syllable（含 text/tone/zeroInitial）', () => {
    expect(splitSyllable('zhōng', '中')).toEqual({
      text: '中',
      pinyin: 'zhong',
      initial: 'zh',
      final: 'ong',
      tone: 1,
      zeroInitial: false,
    })
    expect(splitSyllable('ài')?.zeroInitial).toBe(true)
  })
})

describe('toToneMarks', () => {
  it('ü 正常显示并标调', () => {
    expect(toToneMarks('zhong', 1)).toBe('zhōng')
    expect(toToneMarks('nv', 3)).toBe('nǚ')
    expect(toToneMarks('lve', 4)).toBe('lüè')
    expect(toToneMarks('qu', 4)).toBe('qù')
    expect(toToneMarks('jun', 1)).toBe('jūn')
  })

  it('轻声/无调只做 ü 展示', () => {
    expect(toToneMarks('nv', 5)).toBe('nü')
    expect(toToneMarks('nv')).toBe('nü')
  })
})

describe('parseAtomId / atomId', () => {
  it('解析四类知识点 ID', () => {
    expect(parseAtomId('initial:zh')).toEqual({ atomId: 'initial:zh', type: 'initial', key: 'zh' })
    expect(parseAtomId('final:ai')?.key).toBe('ai')
    expect(parseAtomId('zero:er')?.key).toBe('er')
  })

  it('非法 ID 返回 null', () => {
    expect(parseAtomId('initial:')).toBeNull()
    expect(parseAtomId(':zh')).toBeNull()
    expect(parseAtomId('unknown:zh')).toBeNull()
  })

  it('atomId 组合函数', () => {
    expect(atomId('final', 'ai')).toBe('final:ai')
    expect(atomId('zero', 'er')).toBe('zero:er')
  })
})


describe('atomDisplayLabel · 知识点显示标签（全项目唯一规则）', () => {
  it('零声母一律带「零 」前缀，声母/韵母原样', () => {
    expect(atomDisplayLabel('zero:ai')).toBe('零 ai')
    expect(atomDisplayLabel('zero:a')).toBe('零 a')
    expect(atomDisplayLabel('initial:zh')).toBe('zh')
    expect(atomDisplayLabel('final:ai')).toBe('ai')
    expect(atomDisplayLabel('final:v', 'ü')).toBe('ü')
    expect(atomDisplayLabel('zero:ai', 'ai')).toBe('零 ai')
  })
})
