import { describe, expect, it } from 'vitest'
import { computePopoverPosition, type PopoverAnchorRect } from '../src/lib/popoverPosition.ts'

/** 视口 1000×800 的常用基准；安全边距 8、间距 8 与默认值一致 */
const VIEWPORT = { viewportWidth: 1000, viewportHeight: 800 }

function anchor(patch: Partial<PopoverAnchorRect>): PopoverAnchorRect {
  return { top: 300, bottom: 340, left: 200, width: 200, ...patch }
}

describe('computePopoverPosition', () => {
  it('优先方向空间足够时保持向上，并用 bottom 定位（无需知道浮层高度）', () => {
    const position = computePopoverPosition({
      ...VIEWPORT,
      anchor: anchor({ top: 300, bottom: 340 }),
      maxHeight: 260,
    })

    expect(position.placement).toBe('up')
    expect(position.maxHeight).toBe(260)
    expect(position.top).toBeUndefined()
    // 浮层底边在触发区上方 gap=8 处：距视口底部 = 800 - 300 + 8
    expect(position.bottom).toBe(508)
    expect(position.left).toBe(200)
    expect(position.width).toBe(200)
  })

  it('上方放不下且下方空间更大时翻转到下方，用 top 定位', () => {
    const position = computePopoverPosition({
      ...VIEWPORT,
      anchor: anchor({ top: 20, bottom: 60 }),
      maxHeight: 260,
    })

    expect(position.placement).toBe('down')
    expect(position.top).toBe(68)
    expect(position.bottom).toBeUndefined()
    // 下方可用空间 = 800 - 60 - 8 - 8 = 724，取上限 260
    expect(position.maxHeight).toBe(260)
  })

  it('优先向下且下方不足、上方更大时翻转到上方', () => {
    const position = computePopoverPosition({
      ...VIEWPORT,
      anchor: anchor({ top: 500, bottom: 540 }),
      maxHeight: 260,
      preferred: 'down',
    })

    expect(position.placement).toBe('up')
    expect(position.bottom).toBe(308)
    expect(position.maxHeight).toBe(260)
  })

  it('两侧空间都小于上限时，留在空间较大的一侧并压缩 max-height', () => {
    const position = computePopoverPosition({
      viewportWidth: 1000,
      viewportHeight: 400,
      anchor: anchor({ top: 180, bottom: 220 }),
      maxHeight: 600,
    })

    // 上方可用 = 180-16 = 164，下方可用 = 400-220-16 = 164，平手保持优先向上
    expect(position.placement).toBe('up')
    expect(position.maxHeight).toBe(164)
  })

  it('水平方向夹在视口安全边距内（左侧越界）', () => {
    const position = computePopoverPosition({
      ...VIEWPORT,
      anchor: anchor({ left: 2, width: 200 }),
      maxHeight: 260,
      horizontalOverflow: 20,
    })

    expect(position.width).toBe(220)
    expect(position.left).toBe(8)
  })

  it('水平方向夹在视口安全边距内（右侧越界）', () => {
    const position = computePopoverPosition({
      ...VIEWPORT,
      anchor: anchor({ left: 900, width: 200 }),
      maxHeight: 260,
      horizontalOverflow: 20,
    })

    expect(position.width).toBe(220)
    // 最大 left = 1000 - 8 - 220 = 772
    expect(position.left).toBe(772)
  })

  it('触发区比视口还宽时，宽度收缩到视口内', () => {
    const position = computePopoverPosition({
      ...VIEWPORT,
      anchor: anchor({ left: 0, width: 1200 }),
      maxHeight: 260,
      horizontalOverflow: 20,
    })

    expect(position.width).toBe(984)
    expect(position.left).toBe(8)
  })

  it('无外扩时宽度等于触发区宽度，left 与触发区对齐', () => {
    const position = computePopoverPosition({
      ...VIEWPORT,
      anchor: anchor({ left: 420, width: 180 }),
      maxHeight: 240,
      horizontalOverflow: 0,
    })

    expect(position.width).toBe(180)
    expect(position.left).toBe(420)
  })

  it('自定义间距 / 安全边距参与垂直与水平计算', () => {
    const position = computePopoverPosition({
      viewportWidth: 800,
      viewportHeight: 600,
      anchor: anchor({ top: 300, bottom: 340, left: 0, width: 100 }),
      maxHeight: 300,
      gap: 0,
      viewportPadding: 16,
    })

    expect(position.placement).toBe('up')
    // 上方可用 = 300 - 0 - 16 = 284，取上限 300 → 284
    expect(position.maxHeight).toBe(284)
    expect(position.bottom).toBe(600 - 300 + 0)
    expect(position.left).toBe(16)
  })
})
