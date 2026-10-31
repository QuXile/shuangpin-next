import { describe, expect, it } from 'vitest'
import {
  groupAllChecked,
  groupIndeterminate,
  groupSelected,
  groupTotal,
} from '../src/lib/trainingGroups.ts'

describe('trainingGroups', () => {
  it('胶囊算作组内一个项目，参与全选与部分选中', () => {
    const base = { specificCount: 3, specificSelected: 3, hasCapsule: true }
    expect(groupTotal(base)).toBe(4)
    expect(groupSelected({ ...base, capsuleSelected: false })).toBe(3)
    expect(groupAllChecked({ ...base, capsuleSelected: false })).toBe(false)
    expect(groupIndeterminate({ ...base, capsuleSelected: false })).toBe(true)
    expect(groupAllChecked({ ...base, capsuleSelected: true })).toBe(true)
    expect(groupIndeterminate({ ...base, capsuleSelected: true })).toBe(false)
  })

  it('只有胶囊时，隐藏组也有 1 个可选项', () => {
    expect(groupTotal({ specificCount: 0, hasCapsule: true })).toBe(1)
    expect(
      groupSelected({
        specificCount: 0,
        specificSelected: 0,
        hasCapsule: true,
        capsuleSelected: true,
      }),
    ).toBe(1)
  })

  it('无胶囊的组按普通项目计算', () => {
    expect(groupTotal({ specificCount: 5, hasCapsule: false })).toBe(5)
    expect(
      groupSelected({
        specificCount: 5,
        specificSelected: 2,
        hasCapsule: false,
        capsuleSelected: false,
      }),
    ).toBe(2)
  })
})
