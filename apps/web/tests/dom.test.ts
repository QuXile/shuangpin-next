import { describe, expect, it } from 'vitest'
import { isLetterKey, letterKeyOf } from '../src/lib/dom.ts'

describe('dom 输入守卫（纯函数部分）', () => {
  it('isLetterKey：只接受单个字母或分号', () => {
    expect(isLetterKey('a')).toBe(true)
    expect(isLetterKey('A')).toBe(true)
    expect(isLetterKey(';')).toBe(true)
    expect(isLetterKey('ab')).toBe(false)
    expect(isLetterKey('Enter')).toBe(false)
    expect(isLetterKey('1')).toBe(false)
    expect(isLetterKey('')).toBe(false)
  })

  it('letterKeyOf：归一化为小写单键，非法返回 null', () => {
    expect(letterKeyOf(' A ')).toBe('a')
    expect(letterKeyOf(';')).toBe(';')
    expect(letterKeyOf('Shift')).toBeNull()
    expect(letterKeyOf('')).toBeNull()
  })
})
