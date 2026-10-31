/**
 * 概率均衡抽样（纯函数、可复现）。
 *
 * 目标：
 * - 每个 focus 音在 N 个结果中的**期望出现次数相等**；
 * - 含目标音次数多的候选权重更高（基础权重乘总出现次数）；
 * - 固定 N 个、不重复、实际单轮允许随机波动。
 *
 * 方法：
 * 1. 候选权重 = quality × 目标音总次数 × ∏ exp(θ_f × a_w(f))；
 * 2. 迭代调整 θ_f，使所有 focus 的期望出现次数收敛到均值；
 * 3. 由权重求包含概率 π（Σπ=N），用不等概率系统抽样选出 N 个。
 */
import type { AtomId } from './types.ts'
import { mulberry32 } from './random.ts'

export interface BalancedCandidate<T> {
  item: T
  /** 该候选中每个 focus 音出现次数 */
  counts: ReadonlyMap<AtomId, number>
  /** 基础质量（词频/难度/长度偏好等），必须为正 */
  quality: number
}

export interface BalancedCalibration<T> {
  candidates: readonly BalancedCandidate<T>[]
  /** 每个候选的包含概率，长度为 candidates.length */
  inclusion: number[]
  /** 校准后的期望出现次数 */
  expected: ReadonlyMap<AtomId, number>
  iterations: number
  maxDeviation: number
}

const MAX_ITERATIONS = 160
const TOLERANCE = 0.01
const STEP = 0.35
const THETA_LIMIT = 24

function totalCount(candidate: BalancedCandidate<unknown>): number {
  let total = 0
  for (const count of candidate.counts.values()) total += count
  return total
}

/** 给定权重与目标数量，求 Σπ=N 且 π∈[0,1]。 */
export function targetInclusionProbabilities(
  weights: readonly number[],
  count: number,
): number[] {
  const n = Math.max(0, Math.min(Math.floor(count), weights.length))
  if (weights.length === 0) return []
  if (n >= weights.length) return weights.map(() => 1)
  if (n <= 0) return weights.map(() => 0)

  const sumAt = (lambda: number): number => {
    let sum = 0
    for (const weight of weights) sum += Math.min(1, lambda * Math.max(0, weight))
    return sum
  }

  let low = 0
  let high = 1
  while (sumAt(high) < n && high < 1e12) high *= 2
  for (let i = 0; i < 70; i++) {
    const mid = (low + high) / 2
    if (sumAt(mid) < n) low = mid
    else high = mid
  }
  const lambda = (low + high) / 2
  const inclusion = weights.map((weight) => Math.min(1, lambda * Math.max(0, weight)))
  let sum = inclusion.reduce((acc, value) => acc + value, 0)
  // 数值修正：把残差按剩余容量分配给 π<1 的候选，保证 Σπ=N。
  let guard = 0
  while (Math.abs(sum - n) > 1e-9 && guard < 20) {
    guard += 1
    const residual = n - sum
    const capacity = inclusion.map((value) => 1 - value)
    const totalCapacity = capacity.reduce((acc, value) => acc + value, 0)
    if (residual > 0) {
      if (totalCapacity <= 1e-12) break
      for (let i = 0; i < inclusion.length; i++) {
        inclusion[i] = Math.min(1, (inclusion[i] ?? 0) + (residual * (capacity[i] ?? 0)) / totalCapacity)
      }
    } else {
      const total = inclusion.reduce((acc, value) => acc + value, 0)
      if (total <= 1e-12) break
      for (let i = 0; i < inclusion.length; i++) {
        inclusion[i] = Math.max(0, (inclusion[i] ?? 0) * (1 + residual / total))
      }
    }
    sum = inclusion.reduce((acc, value) => acc + value, 0)
  }
  return inclusion
}

function rawWeights<T>(
  candidates: readonly BalancedCandidate<T>[],
  theta: ReadonlyMap<AtomId, number>,
): number[] {
  const weights: number[] = []
  for (const candidate of candidates) {
    const multiplicity = Math.max(1, totalCount(candidate))
    let logWeight = Math.log(Math.max(1e-9, candidate.quality) * multiplicity)
    for (const [atom, count] of candidate.counts) {
      logWeight += (theta.get(atom) ?? 0) * count
    }
    weights.push(Math.exp(Math.max(-60, Math.min(60, logWeight))))
  }
  return weights
}

/** 校准包含概率，使所有 focus 的期望出现次数相等。 */
export function calibrateBalancedTargets<T>(
  candidates: readonly BalancedCandidate<T>[],
  count: number,
): BalancedCalibration<T> {
  const desired = Math.max(0, Math.min(Math.floor(count), candidates.length))
  const atoms: AtomId[] = []
  const seen = new Set<AtomId>()
  for (const candidate of candidates) {
    for (const atom of candidate.counts.keys()) {
      if (seen.has(atom)) continue
      seen.add(atom)
      atoms.push(atom)
    }
  }
  const theta = new Map<AtomId, number>(atoms.map((atom) => [atom, 0]))
  let inclusion: number[] = []
  let expected = new Map<AtomId, number>(atoms.map((atom) => [atom, 0]))
  let maxDeviation = Number.POSITIVE_INFINITY

  if (desired === 0 || atoms.length === 0 || desired >= candidates.length) {
    inclusion = candidates.map(() => (desired >= candidates.length ? 1 : 0))
    for (let i = 0; i < candidates.length; i++) {
      for (const [atom, atomicCount] of candidates[i]!.counts) {
        expected.set(atom, (expected.get(atom) ?? 0) + inclusion[i]! * atomicCount)
      }
    }
    return { candidates, inclusion, expected, iterations: 0, maxDeviation: 0 }
  }

  // 期望总出现次数由词库自然决定；只约束各音期望相等。
  // 候选容量连目标均值都支撑不了的音退出均衡集合（实际仍可被抽到）。
  const capacity = new Map<AtomId, number>(atoms.map((atom) => [atom, 0]))
  for (const candidate of candidates) {
    for (const [atom, atomicCount] of candidate.counts) {
      capacity.set(atom, (capacity.get(atom) ?? 0) + atomicCount)
    }
  }
  // 反复剔除容量不足的音：均衡集合变小后，每个音的期望目标会提高，
  // 再剔除仍跟不上的音，直到集合稳定或只剩一个音。
  let balanceAtoms = [...atoms]
  while (balanceAtoms.length > 2) {
    const floor = desired / balanceAtoms.length
    const next = balanceAtoms.filter((atom) => (capacity.get(atom) ?? 0) >= floor)
    if (next.length === balanceAtoms.length) break
    balanceAtoms = next
  }
  if (balanceAtoms.length < 2) {
    const weights = rawWeights(candidates, theta)
    inclusion = targetInclusionProbabilities(weights, desired)
    for (let i = 0; i < candidates.length; i++) {
      for (const [atom, atomicCount] of candidates[i]!.counts) {
        expected.set(atom, (expected.get(atom) ?? 0) + inclusion[i]! * atomicCount)
      }
    }
    return { candidates, inclusion, expected, iterations: 0, maxDeviation: 0 }
  }

  let iterations = 0
  for (; iterations < MAX_ITERATIONS; iterations++) {
    const weights = rawWeights(candidates, theta)
    inclusion = targetInclusionProbabilities(weights, desired)
    expected = new Map<AtomId, number>(atoms.map((atom) => [atom, 0]))
    for (let i = 0; i < candidates.length; i++) {
      for (const [atom, atomicCount] of candidates[i]!.counts) {
        expected.set(atom, (expected.get(atom) ?? 0) + inclusion[i]! * atomicCount)
      }
    }
    const values = balanceAtoms.map((atom) => expected.get(atom) ?? 0)
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length
    maxDeviation = 0
    for (const atom of balanceAtoms) {
      const value = expected.get(atom) ?? 0
      if (mean > 1e-12) maxDeviation = Math.max(maxDeviation, Math.abs(value - mean) / mean)
    }
    if (maxDeviation <= TOLERANCE) break
    // 期望偏高的音降权，偏低的音升权。
    for (const atom of balanceAtoms) {
      const value = expected.get(atom) ?? 0
      if (value <= 1e-12 || mean <= 1e-12) continue
      const next = (theta.get(atom) ?? 0) + STEP * Math.log(mean / value)
      theta.set(atom, Math.max(-THETA_LIMIT, Math.min(THETA_LIMIT, next)))
    }
  }
  return { candidates, inclusion, expected, iterations, maxDeviation }
}

function shuffleIndices(length: number, rng: () => number): number[] {
  const order = Array.from({ length }, (_, index) => index)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const value = order[i]!
    order[i] = order[j]!
    order[j] = value
  }
  return order
}

/** 不等概率系统抽样：固定选出 N 个，包含概率恰为 π。 */
function systematicSelection(
  inclusion: readonly number[],
  count: number,
  seed: number,
): number[] {
  const n = Math.max(0, Math.min(Math.floor(count), inclusion.length))
  if (n <= 0) return []
  if (n >= inclusion.length) return inclusion.map((_, index) => index)
  const rng = mulberry32(seed >>> 0)
  const order = shuffleIndices(inclusion.length, rng)
  const start = rng()
  const selected: number[] = []
  let cumulative = 0
  let next = start
  for (const index of order) {
    const probability = inclusion[index] ?? 0
    const end = cumulative + probability
    if (next < end && probability > 0) {
      selected.push(index)
      next += 1
    }
    cumulative = end
    if (selected.length >= n) break
  }
  if (selected.length < n) {
    for (const index of order) {
      if (selected.length >= n) break
      if (!selected.includes(index) && (inclusion[index] ?? 0) > 0) selected.push(index)
    }
  }
  return selected.slice(0, n)
}

/** 概率均衡抽样入口：返回 count 个不重复候选。 */
export function sampleBalancedTargets<T>(
  candidates: readonly BalancedCandidate<T>[],
  count: number,
  seed: number,
): T[] {
  const desired = Math.max(0, Math.min(Math.floor(count), candidates.length))
  if (desired === 0) return []
  if (desired >= candidates.length) return candidates.map((candidate) => candidate.item)
  const calibration = calibrateBalancedTargets(candidates, desired)
  return systematicSelection(calibration.inclusion, desired, seed).map(
    (index) => candidates[index]!.item,
  )
}
