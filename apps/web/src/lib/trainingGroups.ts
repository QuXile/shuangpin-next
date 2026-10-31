/**
 * 训练组统一计数：一个组 = N 个普通 chip + 可选 1 个「全拼沿用」胶囊。
 * 胶囊与普通 chip 同等参与组全选/部分选中/隐藏组计数。
 */
export interface GroupStateInput {
  /** 普通 chip 数量 */
  specificCount: number
  /** 普通 chip 中已选数量 */
  specificSelected: number
  /** 该组是否存在「全拼沿用」胶囊 */
  hasCapsule: boolean
  /** 胶囊是否选中 */
  capsuleSelected: boolean
}

export function groupTotal(input: Pick<GroupStateInput, 'specificCount' | 'hasCapsule'>): number {
  return input.specificCount + (input.hasCapsule ? 1 : 0)
}

export function groupSelected(input: GroupStateInput): number {
  return input.specificSelected + (input.hasCapsule && input.capsuleSelected ? 1 : 0)
}

export function groupAllChecked(input: GroupStateInput): boolean {
  const total = groupTotal(input)
  return total > 0 && groupSelected(input) === total
}

export function groupIndeterminate(input: GroupStateInput): boolean {
  const selected = groupSelected(input)
  return selected > 0 && selected < groupTotal(input)
}
