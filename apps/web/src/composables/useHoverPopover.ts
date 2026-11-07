/**
 * 悬停浮层状态机：统一「指针/焦点进入触发区打开、离开后宽限期关闭、可移入浮层、
 * Escape 关闭、滚动/缩放重新定位」的行为，供所有「溢出内容 + 浮层」类组件复用。
 *
 * 设计背景（对应报障）：
 * - 浮层不要放在触发组件内部做 absolute：祖先的 transform / overflow 会形成
 *   stacking context 或裁剪，导致被其它面板遮挡、被底栏裁剪；
 * - 浮层与触发区之间的间距会让 CSS :hover 立即失效，必须用 JS 状态 + 宽限期
 *   让指针有时间移入浮层。
 *
 * 用法（组件）：
 * ```vue
 * const { triggerRef, popupRef, open, popupStyle, ...handlers } = useHoverPopover({
 *   maxHeight: 260,
 *   horizontalOverflow: 20,
 * })
 * <div ref="triggerRef" @pointerenter="onTriggerPointerEnter" ...>
 * <Teleport to="body">
 *   <div v-if="open" ref="popupRef" :style="popupStyle" @pointerenter="onPopupPointerEnter" ...>
 * ```
 * 注意：`open` 只表示悬停状态；是否真的有溢出内容仍由组件自行判断
 * （如 `overflowing && open`），避免没有溢出时也弹浮层。
 */
import {
  computed,
  getCurrentScope,
  onScopeDispose,
  readonly,
  ref,
  type ComputedRef,
  type Ref,
} from 'vue'
import { computePopoverPosition, type PopoverPlacement } from '@/lib/popoverPosition'

export interface HoverPopoverOptions {
  /** 浮层最大高度上限（px），与所选方向可用空间取小 */
  maxHeight: number
  /** 离开触发区后的关闭宽限期（ms），默认 240（约 200–250ms） */
  closeDelay?: number
  /** 触发区与浮层间距（px），与定位纯函数同一套语义 */
  gap?: number
  /** 视口安全边距（px） */
  viewportPadding?: number
  /** 水平外扩：浮层宽度 = 触发区宽度 + 该值（px） */
  horizontalOverflow?: number
  /** 优先展开方向，默认向上 */
  preferred?: PopoverPlacement
  /** 是否允许打开（如「内容未溢出」时返回 false）；默认始终允许 */
  enabled?: () => boolean
}

export interface HoverPopover {
  /** 是否展开（组件据此决定 Teleport 内容是否渲染） */
  open: Readonly<Ref<boolean>>
  triggerRef: Ref<HTMLElement | null>
  popupRef: Ref<HTMLElement | null>
  /** 浮层的 fixed 定位样式；未展开时为 undefined */
  popupStyle: ComputedRef<Record<string, string> | undefined>
  /** 实际展开方向，未展开时为 null */
  placement: ComputedRef<PopoverPlacement | null>
  onTriggerPointerEnter: () => void
  onTriggerPointerLeave: () => void
  onTriggerFocusIn: () => void
  onTriggerFocusOut: (event: FocusEvent) => void
  onPopupPointerEnter: () => void
  onPopupPointerLeave: () => void
  onPopupFocusIn: () => void
  onPopupFocusOut: (event: FocusEvent) => void
  /** 立即打开（并重新定位） */
  show: () => void
  /** 立即关闭（Escape / 程序调用） */
  close: () => void
  /** 重新计算位置；滚动 / 缩放由内部自动调度，也可手动调用 */
  reposition: () => void
}

const DEFAULT_CLOSE_DELAY = 240

export function useHoverPopover(options: HoverPopoverOptions): HoverPopover {
  const open = ref(false)
  const position = ref<ReturnType<typeof computePopoverPosition> | null>(null)
  const triggerRef = ref<HTMLElement | null>(null)
  const popupRef = ref<HTMLElement | null>(null)
  const closeDelay = options.closeDelay ?? DEFAULT_CLOSE_DELAY

  let closeTimer: ReturnType<typeof setTimeout> | undefined
  let frame = 0
  let attached = false

  const placement = computed<PopoverPlacement | null>(() => position.value?.placement ?? null)
  const popupStyle = computed<Record<string, string> | undefined>(() => {
    const value = position.value
    if (!value) return undefined
    const style: Record<string, string> = {
      left: `${value.left}px`,
      width: `${value.width}px`,
      maxHeight: `${value.maxHeight}px`,
    }
    if (value.placement === 'down') style.top = `${value.top ?? 0}px`
    else style.bottom = `${value.bottom ?? 0}px`
    return style
  })

  /** 用触发区矩形 + 视口尺寸重新计算 fixed 坐标 */
  function reposition(): void {
    if (typeof window === 'undefined') return
    const trigger = triggerRef.value
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    position.value = computePopoverPosition({
      anchor: { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width },
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      maxHeight: options.maxHeight,
      gap: options.gap,
      viewportPadding: options.viewportPadding,
      horizontalOverflow: options.horizontalOverflow,
      preferred: options.preferred,
    })
  }

  /** 滚动 / 缩放时用 rAF 合并重算，避免事件风暴里反复布局读取 */
  function scheduleReposition(): void {
    if (frame !== 0) return
    if (typeof requestAnimationFrame !== 'function') {
      reposition()
      return
    }
    frame = requestAnimationFrame(() => {
      frame = 0
      reposition()
    })
  }

  function cancelFrame(): void {
    if (frame === 0) return
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
    frame = 0
  }

  function cancelClose(): void {
    if (closeTimer === undefined) return
    clearTimeout(closeTimer)
    closeTimer = undefined
  }

  /** 延迟关闭：给指针从触发区移入浮层留出宽限期 */
  function requestClose(): void {
    if (closeTimer !== undefined || !open.value) return
    closeTimer = setTimeout(() => {
      closeTimer = undefined
      close()
    }, closeDelay)
  }

  function isInside(container: HTMLElement, target: EventTarget | null): boolean {
    if (!target) return false
    // 浏览器事件目标一定是 Node；Node 在 SSR / 部分测试环境不存在
    if (typeof Node !== 'undefined' && target instanceof Node) return container.contains(target)
    return false
  }

  function onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !open.value) return
    // 浮层优先消费 Escape：关闭后不再触发页面级 Esc 快捷键（如练习场退出会话）。
    event.stopPropagation()
    close()
  }

  function attachGlobalListeners(): void {
    if (attached) return
    attached = true
    if (typeof window !== 'undefined') {
      window.addEventListener('scroll', scheduleReposition, { capture: true, passive: true })
      window.addEventListener('resize', scheduleReposition, { passive: true })
    }
    // 浮层是 modal 之外的一层：Escape 只关闭浮层，不阻断页面快捷键；
    // 监听只在浮层打开期间挂载，关闭 / 卸载时移除。
    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', onDocumentKeydown, true)
    }
  }

  function detachGlobalListeners(): void {
    if (!attached) return
    attached = false
    if (typeof window !== 'undefined') {
      window.removeEventListener('scroll', scheduleReposition, { capture: true })
      window.removeEventListener('resize', scheduleReposition)
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', onDocumentKeydown, true)
    }
    cancelFrame()
  }

  function show(): void {
    // 没有溢出内容时不要打开（也不挂全局监听）
    if (options.enabled && !options.enabled()) return
    cancelClose()
    if (!open.value) {
      open.value = true
      reposition()
      attachGlobalListeners()
      return
    }
    reposition()
  }

  function close(): void {
    cancelClose()
    if (!open.value) return
    // Escape 关闭时如果焦点在浮层内，先把焦点还回触发区，避免 Teleport 内容卸载后焦点丢失
    const active = typeof document !== 'undefined' ? document.activeElement : null
    const popup = popupRef.value
    const restoreFocus = Boolean(popup && isInside(popup, active))
    open.value = false
    position.value = null
    detachGlobalListeners()
    if (restoreFocus) triggerRef.value?.focus()
  }

  function onTriggerPointerEnter(): void {
    show()
  }

  function onTriggerPointerLeave(): void {
    requestClose()
  }

  function onTriggerFocusIn(): void {
    show()
  }

  function onTriggerFocusOut(event: FocusEvent): void {
    // 焦点从触发区进入浮层（例如练习场可点击 chip）时保持展开
    if (popupRef.value && isInside(popupRef.value, event.relatedTarget)) return
    requestClose()
  }

  function onPopupPointerEnter(): void {
    cancelClose()
  }

  function onPopupPointerLeave(): void {
    requestClose()
  }

  function onPopupFocusIn(): void {
    cancelClose()
  }

  function onPopupFocusOut(event: FocusEvent): void {
    if (triggerRef.value && isInside(triggerRef.value, event.relatedTarget)) return
    if (popupRef.value && isInside(popupRef.value, event.relatedTarget)) return
    requestClose()
  }

  function cleanup(): void {
    cancelClose()
    detachGlobalListeners()
    open.value = false
    position.value = null
  }

  if (getCurrentScope()) onScopeDispose(cleanup)

  return {
    open: readonly(open),
    triggerRef,
    popupRef,
    popupStyle,
    placement,
    onTriggerPointerEnter,
    onTriggerPointerLeave,
    onTriggerFocusIn,
    onTriggerFocusOut,
    onPopupPointerEnter,
    onPopupPointerLeave,
    onPopupFocusIn,
    onPopupFocusOut,
    show,
    close,
    reposition,
  }
}
