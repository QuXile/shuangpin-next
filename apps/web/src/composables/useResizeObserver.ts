/**
 * ResizeObserver 生命周期封装：组件只关心测量回调，不再各自手写 observer。
 * - `target` 为 ref 元素，挂载后观察；ref 变化时自动重新观察。
 * - `enabled === false` 时暂停观察（默认始终启用）。
 * - 环境不支持 ResizeObserver 时静默降级（SSR / 旧浏览器）。
 */
import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue'

interface UseResizeObserverOptions {
  enabled?: Ref<boolean>
}

export function useResizeObserver(
  target: Ref<HTMLElement | null>,
  callback: (entry: ResizeObserverEntry) => void,
  options: UseResizeObserverOptions = {},
): void {
  let observer: ResizeObserver | null = null

  function disconnect(): void {
    observer?.disconnect()
    observer = null
  }

  function connect(): void {
    disconnect()
    if (typeof ResizeObserver === 'undefined') return
    const el = target.value
    if (!el) return
    if (options.enabled && !options.enabled.value) return
    observer = new ResizeObserver(([entry]) => {
      if (entry) callback(entry)
    })
    observer.observe(el)
  }

  onMounted(connect)
  watch(target, connect)
  if (options.enabled) watch(options.enabled, connect)
  onBeforeUnmount(disconnect)
}
