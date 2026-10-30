/**
 * 实时速度（字/分）：500ms 轮询 core sessionMetrics，阶段结束后冻结快照。
 * 组件销毁时清理 interval（onScopeDispose），不泄漏。
 */
import { computed, onMounted, onScopeDispose, ref, type ComputedRef } from 'vue'
import type { SessionState } from '@shuangpin/core'
import { sessionMetrics } from '@shuangpin/core'

export interface LiveCpm {
  cpm: ComputedRef<number>
  reset: () => void
}

export function useLiveCpm(getState: () => SessionState | null): LiveCpm {
  const cpm = ref(0)
  let frozen: number | null = null
  let timer: number | undefined

  function tick(): void {
    const state = getState()
    if (!state) {
      cpm.value = 0
      return
    }
    const metrics = sessionMetrics(state, performance.now())
    if (metrics.finished) {
      if (frozen === null) frozen = metrics.cpm
      cpm.value = frozen
      return
    }
    cpm.value = metrics.completedChars > 0 ? metrics.cpm : 0
  }

  function reset(): void {
    frozen = null
    cpm.value = 0
  }

  onMounted(() => {
    timer = window.setInterval(tick, 500)
  })
  onScopeDispose(() => {
    if (timer !== undefined) window.clearInterval(timer)
  })

  return { cpm: computed(() => cpm.value), reset }
}
