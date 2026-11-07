/**
 * 浮层定位纯函数（无 DOM 依赖，便于单测）。
 *
 * 设计背景：浮层统一 Teleport 到 body 并用 position: fixed 渲染，彻底脱离
 * 祖先 stacking context 与 overflow 裁剪；这里只负责「给定触发区矩形 + 视口尺寸」
 * 算出 fixed 坐标、宽度与 max-height。
 *
 * 约定：
 * - 优先方向由调用方指定（现有两个映射浮层都是向上展开），该方向放不下且另一侧
 *   空间更大时翻转到另一侧；
 * - 水平方向夹在视口安全边距内，宽度 = 触发区宽度 + horizontalOverflow；
 * - max-height 取「浮层上限」与「所选方向可用空间」的较小值，超出时浮层内部滚动。
 */

/** 浮层相对触发区的方向 */
export type PopoverPlacement = 'up' | 'down'

/** 定位所需的矩形信息（getBoundingClientRect 的子集，测试可直接构造） */
export interface PopoverAnchorRect {
  top: number
  bottom: number
  left: number
  width: number
}

export interface PopoverPositionInput {
  /** 触发区矩形 */
  anchor: PopoverAnchorRect
  viewportWidth: number
  viewportHeight: number
  /** 浮层自身最大高度上限（如现有 260 / 240），与可用空间取小 */
  maxHeight: number
  /** 触发区与浮层的间距，默认 8px */
  gap?: number
  /** 视口安全边距（水平夹取 / 上下可用空间），默认 8px */
  viewportPadding?: number
  /** 水平外扩：浮层宽度 = 触发区宽度 + 该值，默认 0；现有 TagArea 视觉为左右各 10px */
  horizontalOverflow?: number
  /** 优先展开方向，默认向上 */
  preferred?: PopoverPlacement
}

export interface PopoverPosition {
  placement: PopoverPlacement
  /** fixed 定位的 left / width / maxHeight（px） */
  left: number
  width: number
  maxHeight: number
  /** 向下展开时使用（视口坐标）；向上展开时为空 */
  top?: number
  /** 向上展开时使用（距视口底部的距离）；向下展开时为空 */
  bottom?: number
}

const DEFAULT_GAP = 8
const DEFAULT_VIEWPORT_PADDING = 8

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function flipOf(placement: PopoverPlacement): PopoverPlacement {
  return placement === 'up' ? 'down' : 'up'
}

/**
 * 计算 Teleport 浮层的 fixed 定位。
 *
 * @example
 * const position = computePopoverPosition({
 *   anchor: trigger.getBoundingClientRect(),
 *   viewportWidth: window.innerWidth,
 *   viewportHeight: window.innerHeight,
 *   maxHeight: 260,
 *   horizontalOverflow: 20,
 * })
 * // => { placement: 'up', left, width, maxHeight, bottom }
 */
export function computePopoverPosition(input: PopoverPositionInput): PopoverPosition {
  const gap = input.gap ?? DEFAULT_GAP
  const padding = input.viewportPadding ?? DEFAULT_VIEWPORT_PADDING
  const overflow = input.horizontalOverflow ?? 0
  const preferred = input.preferred ?? 'up'
  const { anchor, viewportWidth, viewportHeight } = input

  // 水平：宽度跟随触发区（含视觉外扩），夹在视口安全边距内
  const maxWidth = Math.max(0, viewportWidth - padding * 2)
  const width = Math.min(maxWidth, Math.max(0, anchor.width + overflow))
  const preferredLeft = anchor.left - overflow / 2
  const left = clamp(preferredLeft, padding, Math.max(padding, viewportWidth - padding - width))

  // 垂直：上下各自可用空间（扣掉间距与安全边距）
  const spaceAbove = Math.max(0, anchor.top - gap - padding)
  const spaceBelow = Math.max(0, viewportHeight - anchor.bottom - gap - padding)
  const preferredSpace = preferred === 'up' ? spaceAbove : spaceBelow
  const otherSpace = preferred === 'up' ? spaceBelow : spaceAbove
  const desired = Math.max(0, input.maxHeight)
  // 优先方向放得下就用它；放不下但另一侧空间更大则翻转；否则仍留在优先方向并压缩高度
  const placement: PopoverPlacement =
    preferredSpace >= desired || preferredSpace >= otherSpace ? preferred : flipOf(preferred)
  const available = placement === 'up' ? spaceAbove : spaceBelow
  const maxHeight = Math.max(0, Math.min(desired, available))

  if (placement === 'down') {
    return { placement, left, width, maxHeight, top: anchor.bottom + gap }
  }
  // 向上展开：用 bottom 定位，无需知道浮层实际高度
  return { placement, left, width, maxHeight, bottom: viewportHeight - anchor.top + gap }
}
