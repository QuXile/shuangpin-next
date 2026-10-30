/**
 * 训练场会话：core SessionState + 共享输入跟踪（错误锁定/揭示/退格/清空）+ 实时速度。
 * 与课程练习共用 lib/sessionInput，不复制判题交互；专注模式始终提供延伸词批次（无尽练习）。
 */
import { computed, shallowRef } from 'vue'
import {
  createSession,
  sessionMetrics,
  type PracticeWord,
  type SessionFeedback,
  type SessionState,
} from '@shuangpin/core'
import {
  applySessionKey,
  backspaceSession,
  clearSessionInput,
  createInputTracker,
  currentCellKey,
  hasInputError,
  type InputTracker,
} from '@/lib/sessionInput'
import { useLiveCpm } from './useLiveCpm'

export function useTrainingSession() {
  const session = shallowRef<SessionState | null>(null)
  const tracker = shallowRef<InputTracker>(createInputTracker())
  const liveCpm = useLiveCpm(() => session.value)
  let extendProvider: (() => PracticeWord[]) | null = null

  function start(
    words: readonly PracticeWord[],
    options?: { extend?: () => PracticeWord[] },
  ): boolean {
    if (words.length === 0) return false
    session.value = createSession({ words: [...words], now: performance.now() })
    tracker.value = createInputTracker()
    extendProvider = options?.extend ?? null
    liveCpm.reset()
    return true
  }

  function reset(): void {
    session.value = null
    tracker.value = createInputTracker()
    extendProvider = null
    liveCpm.reset()
  }

  const metrics = computed(() => {
    const state = session.value
    return state ? sessionMetrics(state, performance.now()) : null
  })
  const completedWords = computed(() => metrics.value?.completedWords ?? 0)
  const accuracy = computed(() => metrics.value?.accuracy ?? 0)
  const currentCell = computed(() => currentCellKey(session.value))
  const inError = computed(() =>
    session.value ? hasInputError(session.value, tracker.value) : false,
  )

  function apply(raw: string): SessionFeedback | null {
    const state = session.value
    if (!state || state.phase === 'finished') return null
    const result = applySessionKey(state, raw, tracker.value, {
      at: performance.now(),
      extendWords: extendProvider ?? undefined,
    })
    session.value = result.state
    tracker.value = result.tracker
    return result.feedback
  }

  function backspace(): void {
    const state = session.value
    if (!state || state.phase === 'finished') return
    const result = backspaceSession(state, tracker.value)
    session.value = result.state
    tracker.value = result.tracker
  }

  function clearInput(): void {
    const state = session.value
    if (!state || state.phase === 'finished') return
    const result = clearSessionInput(state, tracker.value)
    session.value = result.state
    tracker.value = result.tracker
  }

  return {
    session,
    revealed: computed(() => tracker.value.revealed),
    wrongInputs: computed(() => tracker.value.wrongInputs),
    metrics,
    completedWords,
    accuracy,
    currentCell,
    inError,
    cpm: liveCpm.cpm,
    start,
    reset,
    apply,
    backspace,
    clearInput,
  }
}
