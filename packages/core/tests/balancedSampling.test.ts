/**
 * 概率均衡抽样测试：期望相等、包含概率、固定数量、可复现、多出现次数偏好。
 */
import { describe, expect, it } from 'vitest'
import type { AtomId } from '../src/types.ts'
import {
  calibrateBalancedTargets,
  sampleBalancedTargets,
  targetInclusionProbabilities,
  type BalancedCandidate,
} from '../src/balancedSampling.ts'

function candidate(
  item: string,
  counts: Record<string, number>,
  quality = 1,
): BalancedCandidate<string> {
  return {
    item,
    counts: new Map(Object.entries(counts) as [AtomId, number][]),
    quality,
  }
}

describe('targetInclusionProbabilities', () => {
  it('包含概率和为 N，且每项不超过 1', () => {
    const inclusion = targetInclusionProbabilities([5, 2, 1, 0.5, 0.2], 3)
    expect(inclusion.reduce((sum, value) => sum + value, 0)).toBeCloseTo(3, 8)
    for (const value of inclusion) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })
})

describe('calibrateBalancedTargets', () => {
  it('不对称词库下，把 A/B 两音的期望校准到接近相等', () => {
    const candidates: BalancedCandidate<string>[] = []
    for (let i = 0; i < 72; i++) candidates.push(candidate(`A${i}`, { a: 1 }))
    for (let i = 0; i < 25; i++) candidates.push(candidate(`B${i}`, { b: 1 }))
    for (let i = 0; i < 3; i++) candidates.push(candidate(`AB${i}`, { a: 1, b: 1 }))
    const cal = calibrateBalancedTargets(candidates, 20)
    const a = cal.expected.get('a' as AtomId) ?? 0
    const b = cal.expected.get('b' as AtomId) ?? 0
    expect(Math.abs(a - b) / Math.max(a, b)).toBeLessThanOrEqual(0.02)
  })

  it('含 3 次目标音的候选基础权重高于含 1 次的候选', () => {
    const candidates = [
      ...Array.from({ length: 20 }, (_, i) => candidate(`one${i}`, { a: 1 })),
      ...Array.from({ length: 5 }, (_, i) => candidate(`three${i}`, { a: 3 })),
    ]
    const cal = calibrateBalancedTargets(candidates, 10)
    const one = candidates.find((item) => item.item === 'one0')!
    const three = candidates.find((item) => item.item === 'three0')!
    const oneIndex = candidates.indexOf(one)
    const threeIndex = candidates.indexOf(three)
    expect(cal.inclusion[threeIndex] ?? 0).toBeGreaterThan(cal.inclusion[oneIndex] ?? 0)
  })
})

describe('sampleBalancedTargets', () => {
  it('固定数量、不重复、同 seed 可复现', () => {
    const candidates = Array.from({ length: 40 }, (_, i) =>
      candidate(`w${i}`, i % 2 === 0 ? { a: 1 } : { b: 1 }),
    )
    const first = sampleBalancedTargets(candidates, 12, 123)
    const second = sampleBalancedTargets(candidates, 12, 123)
    const third = sampleBalancedTargets(candidates, 12, 456)
    expect(first).toHaveLength(12)
    expect(new Set(first).size).toBe(12)
    expect(first).toEqual(second)
    expect(third).not.toEqual(first)
  })

  it('候选不足时返回全部，不重复', () => {
    const candidates = [candidate('a1', { a: 1 }), candidate('a2', { a: 1 })]
    expect(sampleBalancedTargets(candidates, 10, 1).sort()).toEqual(['a1', 'a2'])
  })
})
