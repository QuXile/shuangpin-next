/**
 * 唯一会话运行时：判题交互 + 实时速度 + 派生统计。
 *
 * - 会话状态机在 core（applyKey/backspace/clearInput，标答、错误锁定、第 3 次揭示、
 *   错误键位统计都已内置在 SessionState）；这里只做响应式包装与时钟；
 * - 500ms tick 驱动 metrics/cpm 重算；会话结束后冻结（finishedAt 固定，不随 tick 变化）；
 * - 练习场（TrainingPage）使用；课程练习 usePractice 持有独立阶段运行时，但判题规则同样来自 core。
 */
import {
  computed,
  getCurrentScope,
  onScopeDispose,
  ref,
  shallowRef,
  type ComputedRef,
  type Ref,
  type ShallowRef,
} from 'vue'
import {
  applyKey,
  backspace as coreBackspace,
  clearInput as coreClearInput,
  createSession,
  hasInputError,
  sessionMetrics,
  type PracticeWord,
  type SessionFeedback,
  type SessionMetrics,
  type SessionState,
} from '@shuangpin/core'
import { liveMessageOf } from '@/lib/sessionSummary'

const EMPTY_SET: ReadonlySet<string> = new Set()
const EMPTY_INPUTS: ReadonlyMap<string, string[]> = new Map()
const EMPTY_ERRORS: ReadonlyMap<string, number> = new Map()
/** 实时速度刷新间隔（ms） */
const TICK_MS = 500

interface SessionRuntimeStartOptions {
  /** 无尽练习：批次末尾调用，返回空数组表示结束会话 */
  extend?: () => PracticeWord[]
}

export interface SessionRuntime {
  /** 当前会话；未开始时为 null */
  session: ShallowRef<SessionState | null>
  /** 实时统计（500ms 刷新；已结束会话语义由 core 固定） */
  metrics: ComputedRef<SessionMetrics | null>
  cpm: ComputedRef<number>
  completedWords: ComputedRef<number>
  accuracy: ComputedRef<number>
  /** 完成第一个字后才展示正确率/速度，避免只按下一个键时先出现 0% */
  hasStarted: ComputedRef<boolean>
  revealed: ComputedRef<ReadonlySet<string>>
  wrongInputs: ComputedRef<ReadonlyMap<string, string[]>>
  keyErrors: ComputedRef<ReadonlyMap<string, number>>
  /** 当前字是否处于错误锁定（保留红色输入，空格/Enter 可清空） */
  inError: ComputedRef<boolean>
  liveMessage: ComputedRef<string>
  /** 暂停中：输入与实时计时冻结 */
  paused: Ref<boolean>
  start: (words: readonly PracticeWord[], options?: SessionRuntimeStartOptions) => boolean
  reset: () => void
  togglePause: () => void
  apply: (raw: string, at?: number) => SessionFeedback | null
  backspace: () => void
  clearInput: () => void
}

export function useSessionRuntime(): SessionRuntime {
  const session = shallowRef<SessionState | null>(null)
  /** 驱动 metrics 重算的时钟（performance.now，与会话创建同源） */
  const nowMs = ref(performance.now())
  const paused = ref(false)
  /** 暂停累计时长：虚拟时钟 = performance.now() - pausedTotal */
  let pausedAt = 0
  let pausedTotal = 0
  let extendProvider: (() => PracticeWord[]) | null = null
  let timer: number | undefined

  const metrics = computed(() => {
    const state = session.value
    return state ? sessionMetrics(state, nowMs.value) : null
  })
  const cpm = computed(() => {
    const value = metrics.value
    if (!value) return 0
    return value.completedChars > 0 ? value.cpm : 0
  })
  const completedWords = computed(() => metrics.value?.completedWords ?? 0)
  const accuracy = computed(() => metrics.value?.accuracy ?? 0)
  const hasStarted = computed(() => {
    const state = session.value
    if (!state) return false
    return state.phase === 'finished' || state.stats.correctChars > 0
  })
  const revealed = computed(() => session.value?.revealed ?? EMPTY_SET)
  const wrongInputs = computed(() => session.value?.wrongInputs ?? EMPTY_INPUTS)
  const keyErrors = computed(() => session.value?.keyErrors ?? EMPTY_ERRORS)
  const inError = computed(() => (session.value ? hasInputError(session.value) : false))
  const liveMessage = computed(() => liveMessageOf(session.value?.lastFeedback))

  function clockNow(): number {
    return performance.now() - pausedTotal
  }

  function tick(): void {
    const state = session.value
    if (!state || state.phase === 'finished' || paused.value) return
    nowMs.value = clockNow()
  }

  function ensureTimer(): void {
    if (timer !== undefined || typeof window === 'undefined') return
    timer = window.setInterval(tick, TICK_MS)
  }

  function stopTimer(): void {
    if (timer === undefined) return
    window.clearInterval(timer)
    timer = undefined
  }

  function start(words: readonly PracticeWord[], options?: SessionRuntimeStartOptions): boolean {
    if (words.length === 0) return false
    paused.value = false
    pausedAt = 0
    pausedTotal = 0
    const now = performance.now()
    nowMs.value = now
    session.value = createSession({ words: [...words], now })
    extendProvider = options?.extend ?? null
    ensureTimer()
    return true
  }

  function reset(): void {
    session.value = null
    paused.value = false
    pausedAt = 0
    pausedTotal = 0
    extendProvider = null
    nowMs.value = performance.now()
    stopTimer()
  }

  function togglePause(): void {
    const state = session.value
    if (!state || state.phase === 'finished') return
    if (paused.value) {
      pausedTotal += performance.now() - pausedAt
      paused.value = false
      nowMs.value = clockNow()
      return
    }
    pausedAt = performance.now()
    paused.value = true
    nowMs.value = clockNow()
  }

  function apply(raw: string, at?: number): SessionFeedback | null {
    const state = session.value
    if (!state || state.phase === 'finished' || paused.value) return null
    const timestamp = at ?? clockNow()
    const result = applyKey(
      state,
      raw,
      timestamp,
      extendProvider ? { extendWords: extendProvider } : undefined,
    )
    session.value = result.state
    nowMs.value = timestamp
    if (result.state.phase === 'finished') stopTimer()
    return result.feedback
  }

  function backspace(): void {
    const state = session.value
    if (!state || state.phase === 'finished' || paused.value) return
    session.value = coreBackspace(state)
  }

  function clearInput(): void {
    const state = session.value
    if (!state || state.phase === 'finished' || paused.value) return
    session.value = coreClearInput(state)
  }

  if (getCurrentScope()) onScopeDispose(stopTimer)

  return {
    session,
    metrics,
    cpm,
    completedWords,
    accuracy,
    hasStarted,
    revealed,
    wrongInputs,
    keyErrors,
    inError,
    liveMessage,
    paused,
    start,
    reset,
    togglePause,
    apply,
    backspace,
    clearInput,
  }
}
