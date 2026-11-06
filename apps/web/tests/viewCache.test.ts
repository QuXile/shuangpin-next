import { describe, expect, it } from 'vitest'
import { reuseIfEqual, reuseRowIfEqual, sameStringList } from '../src/lib/viewCache.ts'

interface View {
  active: boolean
  input: string[]
}

const sameView = (left: View, right: View): boolean =>
  left.active === right.active && sameStringList(left.input, right.input)

describe('viewCache', () => {
  it('内容等价时复用旧对象引用，内容变化时返回新对象', () => {
    const previous: View = { active: true, input: ['a'] }
    const equal: View = { active: true, input: ['a'] }
    const changed: View = { active: false, input: ['a'] }

    expect(reuseIfEqual(previous, equal, sameView)).toBe(previous)
    expect(reuseIfEqual(previous, changed, sameView)).toBe(changed)
  })

  it('没有上一帧时直接使用新对象', () => {
    const next: View = { active: false, input: [] }
    expect(reuseIfEqual(undefined, next, sameView)).toBe(next)
  })

  it('行内全部单元格引用未变时复用旧行数组，否则返回新行数组', () => {
    const a: View = { active: false, input: [] }
    const b: View = { active: true, input: ['k'] }
    const previousRow = [a, b]

    expect(reuseRowIfEqual(previousRow, [a, b])).toBe(previousRow)
    expect(reuseRowIfEqual(previousRow, [a, { active: true, input: ['k'] }])).not.toBe(previousRow)
    expect(reuseRowIfEqual(previousRow, [a])).not.toBe(previousRow)
    expect(reuseRowIfEqual(undefined, [a, b])).not.toBe(previousRow)
  })

  it('字符串键序列按内容比较', () => {
    expect(sameStringList(['a', 'b'], ['a', 'b'])).toBe(true)
    expect(sameStringList(['a', 'b'], ['a'])).toBe(false)
    expect(sameStringList(['a', 'b'], ['b', 'a'])).toBe(false)
    expect(sameStringList([], [])).toBe(true)
  })
})
