/**
 * 会话输入的共享逻辑：错误锁定 / 第 3 次错误揭示 / 退格撤销 / 空格或 Enter 清空。
 * 课程练习（usePractice）与训练场（useTrainingSession）共用，避免复制判题交互。
 */
import {
  applyKey,
  backspace,
  clearInput,
  type PracticeWord,
  type SessionFeedback,
  type SessionState,
} from '@shuangpin/core'

export interface InputTracker {
  revealed: ReadonlySet<string>
  wrongInputs: ReadonlyMap<string, string[]>
  cellErrors: ReadonlyMap<string, number>
}

export function createInputTracker(): InputTracker {
  return { revealed: new Set(), wrongInputs: new Map(), cellErrors: new Map() }
}

/** 当前字在会话中的稳定 key（词下标:字下标） */
export function currentCellKey(state: SessionState | null): string | null {
  if (!state) return null
  const charIndex = state.words[state.index]?.charIndex ?? 0
  return `${state.index}:${charIndex}`
}

export function hasInputError(state: SessionState | null, tracker: InputTracker): boolean {
  const key = currentCellKey(state)
  return Boolean(key && tracker.wrongInputs.has(key))
}

export interface ApplySessionKeyResult {
  state: SessionState
  feedback: SessionFeedback
  tracker: InputTracker
}

/** 应用一次字母输入并更新错误/揭示跟踪 */
export function applySessionKey(
  state: SessionState,
  raw: string,
  tracker: InputTracker,
  options?: { at?: number; extendWords?: () => PracticeWord[] },
): ApplySessionKeyResult {
  const cellKey = currentCellKey(state)
  const result = applyKey(state, raw, options?.at, options?.extendWords ? { extendWords: options.extendWords } : undefined)
  let { revealed, wrongInputs, cellErrors } = tracker
  if (result.feedback.kind === 'wrong' && cellKey) {
    const wrong = new Map(wrongInputs)
    wrong.set(cellKey, result.feedback.input ?? [])
    wrongInputs = wrong
    const errors = new Map(cellErrors)
    const count = (errors.get(cellKey) ?? 0) + 1
    errors.set(cellKey, count)
    cellErrors = errors
    if (count >= 3 && !revealed.has(cellKey)) {
      const next = new Set(revealed)
      next.add(cellKey)
      revealed = next
    }
  } else if (
    cellKey &&
    (result.feedback.kind === 'char-complete' || result.feedback.kind === 'word-complete') &&
    wrongInputs.has(cellKey)
  ) {
    const wrong = new Map(wrongInputs)
    wrong.delete(cellKey)
    wrongInputs = wrong
  }
  return { state: result.state, feedback: result.feedback, tracker: { revealed, wrongInputs, cellErrors } }
}

/** 退格：删一键并取消当前字红色错误态 */
export function backspaceSession(
  state: SessionState,
  tracker: InputTracker,
): { state: SessionState; tracker: InputTracker } {
  const cellKey = currentCellKey(state)
  if (!cellKey || !tracker.wrongInputs.has(cellKey)) {
    return { state: backspace(state), tracker }
  }
  const wrong = new Map(tracker.wrongInputs)
  wrong.delete(cellKey)
  return { state: backspace(state), tracker: { ...tracker, wrongInputs: wrong } }
}

/** 清空当前字输入并取消红色错误态（空格 / Enter 优先清空） */
export function clearSessionInput(
  state: SessionState,
  tracker: InputTracker,
): { state: SessionState; tracker: InputTracker } {
  const cellKey = currentCellKey(state)
  if (!cellKey || !tracker.wrongInputs.has(cellKey)) {
    return { state: clearInput(state), tracker }
  }
  const wrong = new Map(tracker.wrongInputs)
  wrong.delete(cellKey)
  return { state: clearInput(state), tracker: { ...tracker, wrongInputs: wrong } }
}
