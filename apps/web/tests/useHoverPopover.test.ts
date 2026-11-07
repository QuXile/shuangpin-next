import { effectScope, type EffectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHoverPopover, type HoverPopover } from '../src/composables/useHoverPopover.ts'

/** 事件宿主：既可以给 window / document 当桩，也能手动派发事件 */
function makeHost(extra: Record<string, unknown> = {}) {
  const handlers = new Map<string, Set<(event: unknown) => void>>()
  return {
    handlers,
    ...extra,
    addEventListener(type: string, handler: (event: never) => void) {
      let set = handlers.get(type)
      if (!set) {
        set = new Set()
        handlers.set(type, set)
      }
      set.add(handler as (event: unknown) => void)
    },
    removeEventListener(type: string, handler: (event: never) => void) {
      handlers.get(type)?.delete(handler as (event: unknown) => void)
    },
    dispatch(type: string, event: unknown = {}): void {
      for (const handler of [...(handlers.get(type) ?? [])]) handler(event)
    },
    listenerCount(type: string): number {
      return handlers.get(type)?.size ?? 0
    },
  }
}

type TriggerHarness = {
  getBoundingClientRect: () => DOMRect
  focus: () => void
}

const INITIAL_RECT = { top: 600, bottom: 640, left: 100, width: 200, height: 40 }

describe('useHoverPopover', () => {
  let windowHost: ReturnType<typeof makeHost>
  let documentHost: ReturnType<typeof makeHost>
  let scope: EffectScope | undefined
  let rect: typeof INITIAL_RECT

  beforeEach(() => {
    rect = { ...INITIAL_RECT }
    windowHost = makeHost({ innerWidth: 1000, innerHeight: 800 })
    documentHost = makeHost({ activeElement: null })
    vi.stubGlobal('window', windowHost)
    vi.stubGlobal('document', documentHost)
    vi.useFakeTimers()
  })

  afterEach(() => {
    scope?.stop()
    scope = undefined
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function setup(options: { closeDelay?: number; horizontalOverflow?: number } = {}): {
    popover: HoverPopover
    trigger: TriggerHarness
  } {
    scope = effectScope()
    const popover = scope.run(() =>
      useHoverPopover({ maxHeight: 260, ...options }),
    ) as HoverPopover
    const trigger: TriggerHarness = {
      getBoundingClientRect: () => rect as unknown as DOMRect,
      focus: vi.fn(),
    }
    popover.triggerRef.value = trigger as unknown as HTMLElement
    return { popover, trigger }
  }

  it('指针进入触发区立即打开，并按触发区矩形定位', () => {
    const { popover } = setup()

    popover.onTriggerPointerEnter()

    expect(popover.open.value).toBe(true)
    expect(popover.placement.value).toBe('up')
    expect(popover.popupStyle.value).toEqual({
      left: '100px',
      width: '200px',
      maxHeight: '260px',
      bottom: '208px',
    })
    // 打开期间挂载滚动 / 缩放 / Escape 监听
    expect(windowHost.listenerCount('scroll')).toBe(1)
    expect(windowHost.listenerCount('resize')).toBe(1)
    expect(documentHost.listenerCount('keydown')).toBe(1)
  })

  it('支持水平外扩（宽度 = 触发区宽度 + 外扩）', () => {
    const { popover } = setup({ horizontalOverflow: 20 })

    popover.onTriggerPointerEnter()

    expect(popover.popupStyle.value?.width).toBe('220px')
    expect(popover.popupStyle.value?.left).toBe('90px')
  })

  it('enabled 返回 false 时不打开，也不挂全局监听', () => {
    scope = effectScope()
    const popover = scope.run(() =>
      useHoverPopover({ maxHeight: 260, enabled: () => false }),
    ) as HoverPopover
    popover.triggerRef.value = {
      getBoundingClientRect: () => rect as unknown as DOMRect,
      focus: vi.fn(),
    } as unknown as HTMLElement

    popover.onTriggerPointerEnter()

    expect(popover.open.value).toBe(false)
    expect(popover.popupStyle.value).toBeUndefined()
    expect(documentHost.listenerCount('keydown')).toBe(0)
    expect(windowHost.listenerCount('scroll')).toBe(0)
  })

  it('指针离开触发区后有 240ms 宽限期，超时后关闭', () => {
    const { popover } = setup()
    popover.onTriggerPointerEnter()

    popover.onTriggerPointerLeave()
    vi.advanceTimersByTime(239)
    expect(popover.open.value).toBe(true)

    vi.advanceTimersByTime(1)
    expect(popover.open.value).toBe(false)
    expect(popover.popupStyle.value).toBeUndefined()
  })

  it('宽限期内进入浮层会取消关闭', () => {
    const { popover } = setup()
    popover.onTriggerPointerEnter()
    popover.onTriggerPointerLeave()

    vi.advanceTimersByTime(200)
    popover.onPopupPointerEnter()
    vi.advanceTimersByTime(500)

    expect(popover.open.value).toBe(true)
  })

  it('离开浮层后同样延迟关闭', () => {
    const { popover } = setup()
    popover.onTriggerPointerEnter()
    popover.onPopupPointerLeave()

    vi.advanceTimersByTime(240)
    expect(popover.open.value).toBe(false)
  })

  it('Escape 立即关闭并移除全局监听，其它按键不关闭', () => {
    const { popover } = setup()
    popover.onTriggerPointerEnter()

    const otherKey = { key: 'a', stopPropagation: vi.fn() }
    documentHost.dispatch('keydown', otherKey)
    expect(popover.open.value).toBe(true)
    expect(otherKey.stopPropagation).not.toHaveBeenCalled()

    const escape = { key: 'Escape', stopPropagation: vi.fn() }
    documentHost.dispatch('keydown', escape)
    expect(popover.open.value).toBe(false)
    // 浮层消费 Escape：不再冒泡到页面级快捷键（否则会同时退出练习会话）
    expect(escape.stopPropagation).toHaveBeenCalledTimes(1)
    expect(documentHost.listenerCount('keydown')).toBe(0)
    expect(windowHost.listenerCount('scroll')).toBe(0)
  })

  it('focusin 打开，focusout 到触发区外后延迟关闭', () => {
    const { popover } = setup()
    popover.onTriggerFocusIn()
    expect(popover.open.value).toBe(true)

    popover.onTriggerFocusOut({ relatedTarget: null } as unknown as FocusEvent)
    vi.advanceTimersByTime(240)
    expect(popover.open.value).toBe(false)
  })

  it('焦点从触发区进入浮层时保持打开', () => {
    class FakeNode {}
    vi.stubGlobal('Node', FakeNode)
    const inside = new FakeNode()
    const { popover } = setup()
    popover.popupRef.value = { contains: (node: unknown) => node === inside } as unknown as HTMLElement

    popover.onTriggerFocusIn()
    popover.onTriggerFocusOut({ relatedTarget: inside } as unknown as FocusEvent)
    vi.advanceTimersByTime(500)

    expect(popover.open.value).toBe(true)
  })

  it('浮层内 focusin 取消宽限期关闭', () => {
    const { popover } = setup()
    popover.onTriggerPointerEnter()
    popover.onTriggerPointerLeave()

    popover.onPopupFocusIn()
    vi.advanceTimersByTime(500)
    expect(popover.open.value).toBe(true)
  })

  it('Escape 时若焦点在浮层内，关闭后把焦点还回触发区', () => {
    class FakeNode {}
    vi.stubGlobal('Node', FakeNode)
    const inside = new FakeNode()
    const { popover, trigger } = setup()
    popover.popupRef.value = { contains: (node: unknown) => node === inside } as unknown as HTMLElement
    documentHost.activeElement = inside

    popover.onTriggerPointerEnter()
    documentHost.dispatch('keydown', { key: 'Escape', stopPropagation: vi.fn() })

    expect(popover.open.value).toBe(false)
    expect(trigger.focus).toHaveBeenCalledTimes(1)
  })

  it('滚动 / 缩放时重新定位（跟随触发区矩形变化）', () => {
    const { popover } = setup()
    popover.onTriggerPointerEnter()
    expect(popover.popupStyle.value?.bottom).toBe('208px')

    rect = { ...INITIAL_RECT, top: 300, bottom: 340 }
    windowHost.dispatch('scroll')
    expect(popover.popupStyle.value?.bottom).toBe('508px')

    rect = { ...INITIAL_RECT, top: 20, bottom: 60 }
    windowHost.dispatch('resize')
    expect(popover.placement.value).toBe('down')
    expect(popover.popupStyle.value?.top).toBe('68px')
  })

  it('作用域销毁时关闭浮层并清理监听', () => {
    const { popover } = setup()
    popover.onTriggerPointerEnter()

    scope?.stop()
    scope = undefined

    expect(popover.open.value).toBe(false)
    expect(documentHost.listenerCount('keydown')).toBe(0)
    expect(windowHost.listenerCount('scroll')).toBe(0)
  })
})
