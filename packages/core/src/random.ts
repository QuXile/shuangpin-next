/**
 * 确定性随机工具：同一 seed 产出同一结果，供选词/组卷/测试复现使用。
 * 纯函数，无状态；rng 由调用方持有并顺序消费。
 */

/** mulberry32：32 位种子伪随机数生成器（返回 [0, 1)） */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher–Yates 洗牌（不修改入参） */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(rng() * (index + 1))
    const value = result[index] as T
    result[index] = result[swap] as T
    result[swap] = value
  }
  return result
}

/** 以数值 seed 洗牌的便捷函数（同 seed 完全可复现） */
export function shuffleSeeded<T>(items: readonly T[], seed: number): T[] {
  return shuffle(items, mulberry32(seed))
}
