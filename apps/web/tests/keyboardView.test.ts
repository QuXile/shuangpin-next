import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { atomId, createSchemeEngine, type SchemeDef } from '@shuangpin/core'
import {
  isFallbackCaps,
  keycapsOf,
  keyboardMapViewOf,
  scatterLayout,
  splitKeycapLines,
} from '../src/lib/keyboardView.ts'

const scheme = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../data/schemes/xiaohe/scheme.json', import.meta.url)), 'utf8'),
) as SchemeDef
const engine = createSchemeEngine(scheme)

describe('keyboardView · 文本 → 键帽', () => {
  it('汉字按固定读音表取声母/韵母主键，两键同组', () => {
    const specs = keycapsOf('小鹤双拼', engine)
    expect(specs).toHaveLength(8)
    expect(specs.every((spec) => /^[A-Z;]$/.test(spec.key))).toBe(true)
    expect(specs.map((spec) => spec.chineseGroup)).toEqual([0, 0, 1, 1, 2, 2, 3, 3])
    expect(isFallbackCaps(specs)).toBe(false)
  })

  it('连续英文共享一个 latinRun；最多 10 个键帽', () => {
    const specs = keycapsOf('shuangpin', engine)
    expect(specs).toHaveLength(9)
    expect(new Set(specs.map((spec) => spec.latinRun)).size).toBe(1)
    expect(keycapsOf('abcdefghijklmnop', engine)).toHaveLength(10)
  })

  it('无法生成键帽时返回 ERROR 兜底', () => {
    const specs = keycapsOf('你', engine)
    expect(isFallbackCaps(specs)).toBe(true)
    expect(specs.map((spec) => spec.key).join('')).toBe('ERROR')
    expect(keycapsOf('', engine)).toHaveLength(5)
  })
})

describe('keyboardView · 分行规则', () => {
  it('汉字两键不拆：4 键分两行各 2', () => {
    const rows = splitKeycapLines(keycapsOf('双拼', engine))
    expect(rows.map((row) => row.caps.length)).toEqual([2, 2])
    expect(rows.map((row) => row.offset)).toEqual([0, 2])
  })

  it('连续英文 9 键优先平衡断点，每行不超过 5', () => {
    const rows = splitKeycapLines(keycapsOf('shuangpin', engine))
    expect(rows.map((row) => row.caps.length)).toEqual([4, 5])
    expect(rows.every((row) => row.caps.length <= 5)).toBe(true)
  })

  it('singleRow 强制单行；ERROR 兜底也单行', () => {
    expect(splitKeycapLines(keycapsOf('小鹤双拼', engine), { singleRow: true })).toHaveLength(1)
    const fallbackRows = splitKeycapLines(keycapsOf('你', engine))
    expect(fallbackRows).toHaveLength(1)
    expect(fallbackRows[0]?.caps).toHaveLength(5)
  })

  it('无键帽时返回空数组', () => {
    expect(splitKeycapLines([])).toEqual([])
  })
})

describe('keyboardView · 随机散落', () => {
  it('注入 random 后可复现，层级按阅读顺序固定', () => {
    const layouts = scatterLayout(['A', 'B', 'C'], () => 0)
    expect(layouts.map((item) => item.zIndex)).toEqual(['1', '2', '3'])
    expect(layouts[0]?.transform).toBe('translate(-5.0px, -7.0px) rotate(-5.0deg)')
    expect(scatterLayout(['A'], () => 0.999)[0]?.transform).toBe(
      'translate(5.0px, 7.0px) rotate(5.0deg)',
    )
  })
})

describe('keyboardView · 键位图视图模型', () => {
  const baseInput = {
    rows: engine.keyMap(),
    highlightAtomIds: [atomId('initial', 'sh'), atomId('final', 'uang'), atomId('zero', 'a')],
    specialInitials: engine.diff().learnInitials,
    zeroInitials: scheme.zeroInitial,
    compatCodes: scheme.compatCodes,
  } as const

  it('键位行保持结构，focus 原子被强调', () => {
    const view = keyboardMapViewOf(baseInput)
    expect(view.showMappings).toBe(true)
    expect(view.keyRows).toHaveLength(engine.keyMap().length)
    const parts = view.keyRows.flat().flatMap((key) => [...key.initialParts, ...key.finalParts])
    expect(parts.some((part) => part.text === 'sh' && part.emphasized)).toBe(true)
    expect(view.zeroItems.some((item) => item.label === 'a' && item.emphasized)).toBe(true)
    for (const key of view.keyRows.flat()) {
      expect(key.title).toContain(key.letter.toUpperCase())
    }
  })

  it('conceal 隐藏映射，标题只播报按键', () => {
    const view = keyboardMapViewOf({ ...baseInput, conceal: true })
    expect(view.showMappings).toBe(false)
    expect(view.zeroItems).toHaveLength(0)
    expect(view.keyRows.flat().every((key) => key.title === `按键 ${key.letter.toUpperCase()}`)).toBe(true)
  })

  it('hidden / free 原子被过滤（含零声母映射行）', () => {
    const allZeroAtomIds = Object.keys(scheme.zeroInitial).map((key) => atomId('zero', key))
    expect(keyboardMapViewOf({ ...baseInput, freeAtomIds: allZeroAtomIds }).zeroItems).toHaveLength(0)
    expect(keyboardMapViewOf({ ...baseInput, hiddenAtomIds: allZeroAtomIds }).zeroItems).toHaveLength(0)

    const hiddenInitial = keyboardMapViewOf({ ...baseInput, hiddenAtomIds: [atomId('initial', 'sh')] })
    const parts = hiddenInitial.keyRows.flat().flatMap((key) => key.initialParts)
    expect(parts.some((part) => part.text === 'sh')).toBe(false)
  })

  it('兼容编码映射行按音节给出可读标题', () => {
    const view = keyboardMapViewOf(baseInput)
    for (const item of view.compatItems) {
      expect(item.codes.length).toBeGreaterThan(0)
      expect(item.title).toContain('→')
    }
  })
})
