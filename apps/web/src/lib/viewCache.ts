/**
 * 渲染视图复用工具（纯函数）。
 *
 * 练习流/文章网格在每次按键后都会拿到新的 SessionState：如果每次都重新生成整张
 * 单元格视图，Vue 会认为所有子卡片的 props 都变了，长列表（考核 100 词、长文章）
 * 就要整体重渲染。这里只按内容比较、复用上一帧对象/数组引用，
 * 让未变化的卡片跳过更新（配合 v-memo 还可整行跳过 diff）。
 */

/**
 * 与上一帧「等价」时返回旧对象，否则返回新对象。
 * @param isEqual 内容等价判定；两侧类型相同。
 */
export function reuseIfEqual<T>(
  previous: T | undefined,
  next: T,
  isEqual: (left: T, right: T) => boolean,
): T {
  return previous !== undefined && isEqual(previous, next) ? previous : next
}

/** 与上一帧行等长且逐项是同一引用时复用旧行数组（行数组身份稳定，v-memo 才会命中）。 */
export function reuseRowIfEqual<T>(previous: readonly T[] | undefined, next: T[]): T[] {
  if (previous === undefined || previous.length !== next.length) return next
  return previous.every((item, index) => item === next[index]) ? (previous as T[]) : next
}

/** 字符串键序列内容相同（练习输入数组的比较）。 */
export function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index])
}
