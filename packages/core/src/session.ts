/**
 * 练习会话状态机（纯函数）：逐字输入 → 判题 → 反馈 / 推进。
 *
 * 语义：
 * - 期望键 = 当前字 caps 的主键序列；判题按字的全部可接受序列（含多解容错）；
 * - 部分键输入 → kind='typing'；整字正确 → char-complete，词完成 → word-complete；
 * - 批次末词完成时若调用方提供 extendWords 且返回新词，则追加批次继续（无限练习）；
 *   只有延伸返回空数组时才 session-complete / phase='finished'；
 * - 整字错误 → kind='wrong'、errors+1、保留当前字输入并回传正确键位与已输入键位；
 *   错误锁定后继续字母输入被忽略（返回 idle），退格可撤销，clearInput 可清空；
 * - 统计：accuracy = correctChars / (correctChars + errors)；cpm 由 sessionMetrics 计算；
 * - 退格只回退当前字（文档口径见 docs/ARCHITECTURE.md）。
 */
import type {
  KeyResult,
  PracticeSyllable,
  PracticeWord,
  SessionFeedback,
  SessionMetrics,
  SessionOptions,
  SessionState,
  SessionStats,
  SessionWordState,
} from './types.ts'

function nowOf(value?: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Date.now()
}

function accuracyOf(correctChars: number, errors: number): number {
  const attempts = correctChars + errors
  return attempts === 0 ? 0 : correctChars / attempts
}

function emptyStats(startedAt: number, totalChars: number): SessionStats {
  return {
    totalChars,
    correctChars: 0,
    errors: 0,
    keystrokes: 0,
    wordsCompleted: 0,
    startedAt,
    totalMs: 0,
    accuracy: 0,
  }
}

function currentWordState(state: SessionState): SessionWordState | undefined {
  return state.words[state.index]
}

function currentSyllable(state: SessionState): PracticeSyllable | undefined {
  const wordState = currentWordState(state)
  return wordState?.word.syllables[wordState.charIndex]
}

function replaceWord(
  words: SessionWordState[],
  index: number,
  wordState: SessionWordState,
): SessionWordState[] {
  const next = [...words]
  next[index] = wordState
  return next
}

/**
 * 归一化用户输入为合法键字符：仅接受小写字母或分号（屏蔽中文 IME/多字符输入）。
 * 不是合法单键时返回 null。
 */
export function normalizeKeyInput(raw: string): string | null {
  const normalized = String(raw ?? '').trim().toLowerCase()
  return /^[a-z;]$/.test(normalized) ? normalized : null
}

/** 创建练习会话（now 用于计时起点；同一次会话内所有时间使用同一时钟） */
export function createSession(options: SessionOptions): SessionState {
  const startedAt = nowOf(options.now)
  const words: SessionWordState[] = options.words.map((word) => ({
    word,
    charIndex: 0,
    input: [],
    charInputs: [],
  }))
  const totalChars = words.reduce((sum, item) => sum + item.word.syllables.length, 0)
  const finished = words.length === 0
  const stats = emptyStats(startedAt, totalChars)
  if (finished) {
    stats.finishedAt = startedAt
  }
  return {
    words,
    index: 0,
    phase: finished ? 'finished' : 'playing',
    startedAt,
    lastFeedback: { kind: finished ? 'session-complete' : 'idle', message: finished ? '练习完成' : undefined },
    stats,
  }
}

/** 延伸批次选项：批次末词完成后调用，返回空数组表示不再延伸（会话结束） */
export interface ExtendWordsOptions {
  extendWords?: () => PracticeWord[]
}

/** 应用一次按键（key 归一化为小写单字符；非法输入忽略） */
export function applyKey(
  initialState: SessionState,
  key: string,
  at?: number,
  options?: ExtendWordsOptions,
): KeyResult {
  const normalized = normalizeKeyInput(key)
  const idle = (state: SessionState, feedback?: SessionFeedback): KeyResult => ({
    state,
    feedback: feedback ?? state.lastFeedback,
  })
  if (initialState.phase === 'finished') return idle(initialState)
  if (normalized === null) return idle(initialState, { kind: 'idle' })

  const timestamp = nowOf(at)
  const wordState = currentWordState(initialState)
  if (!wordState) return idle(initialState)
  const syllable = currentSyllable(initialState)
  const expected = syllable?.caps.map((cap) => cap.key.toLowerCase()) ?? []
  if (expected.length === 0) {
    return idle(initialState, { kind: 'wrong', message: '该字缺少键位数据', expected: [] })
  }

  // 错误锁定：当前字输入已满且未通过时，忽略字母输入（等待退格或 clearInput）
  if (wordState.input.length >= expected.length) {
    return idle(initialState, { kind: 'idle' })
  }

  const input = [...wordState.input, normalized]
  const stats: SessionStats = {
    ...initialState.stats,
    keystrokes: initialState.stats.keystrokes + 1,
    totalMs: Math.max(0, timestamp - initialState.stats.startedAt),
  }

  // 尚未打满当前字：仅更新输入
  if (input.length < expected.length) {
    const words = replaceWord(initialState.words, initialState.index, { ...wordState, input })
    const feedback: SessionFeedback = { kind: 'typing' }
    return {
      state: { ...initialState, words, stats, lastFeedback: feedback },
      feedback,
    }
  }

  // 打满：判题
  const typed = input.join('')
  const accepted = syllable?.accepted.includes(typed) ?? false
  if (!accepted) {
    stats.errors = initialState.stats.errors + 1
    stats.accuracy = accuracyOf(stats.correctChars, stats.errors)
    const words = replaceWord(initialState.words, initialState.index, { ...wordState, input: [...input] })
    const feedback: SessionFeedback = {
      kind: 'wrong',
      message: `键位错误，正确键位：${expected.join('').toUpperCase()}`,
      expected: [...expected],
      input: [...input],
      wordText: wordState.word.text,
    }
    return { state: { ...initialState, words, stats, lastFeedback: feedback }, feedback }
  }

  // 当前字正确
  stats.correctChars = initialState.stats.correctChars + 1
  stats.accuracy = accuracyOf(stats.correctChars, stats.errors)
  const charIndex = wordState.charIndex + 1
  const wordFinished = charIndex >= wordState.word.syllables.length

  const charInputs = [...(wordState.charInputs ?? []), [...input]]
  if (!wordFinished) {
    const words = replaceWord(initialState.words, initialState.index, { ...wordState, charIndex, input: [], charInputs })
    const feedback: SessionFeedback = { kind: 'char-complete', wordText: wordState.word.text }
    return { state: { ...initialState, words, stats, lastFeedback: feedback }, feedback }
  }

  stats.wordsCompleted = initialState.stats.wordsCompleted + 1
  const completed = { ...wordState, charIndex, input: [], charInputs }
  const nextIndex = initialState.index + 1
  let words = replaceWord(initialState.words, initialState.index, completed)

  if (nextIndex >= initialState.words.length) {
    const extra = options?.extendWords?.() ?? []
    if (extra.length === 0) {
      stats.finishedAt = timestamp
      stats.totalMs = Math.max(0, timestamp - stats.startedAt)
      const feedback: SessionFeedback = {
        kind: 'session-complete',
        message: '练习完成',
        wordText: wordState.word.text,
      }
      return {
        state: {
          ...initialState,
          words,
          index: nextIndex,
          phase: 'finished',
          stats,
          lastFeedback: feedback,
        },
        feedback,
      }
    }
    // 追加延伸批次，继续练习（无限练习由调用方决定何时停止）
    const extraWords: SessionWordState[] = extra.map((word) => ({ word, charIndex: 0, input: [], charInputs: [] }))
    stats.totalChars += extraWords.reduce((sum, item) => sum + item.word.syllables.length, 0)
    words = [...words, ...extraWords]
  }

  const feedback: SessionFeedback = {
    kind: 'word-complete',
    message: `「${wordState.word.text}」完成`,
    wordText: wordState.word.text,
  }
  return {
    state: { ...initialState, words, index: nextIndex, stats, lastFeedback: feedback },
    feedback,
  }
}

/**
 * 在会话末尾追加词（有限目标完成、用户选择"继续练习"时使用）：
 * 若会话已 finished 则恢复为 playing，字数累计。
 */
export function appendSessionWords(state: SessionState, words: PracticeWord[]): SessionState {
  if (words.length === 0) return state
  const extra: SessionWordState[] = words.map((word) => ({ word, charIndex: 0, input: [], charInputs: [] }))
  const totalChars =
    state.stats.totalChars + words.reduce((sum, word) => sum + word.syllables.length, 0)
  const stats: SessionStats = { ...state.stats, totalChars }
  delete stats.finishedAt
  return {
    ...state,
    words: [...state.words, ...extra],
    phase: 'playing',
    stats,
    lastFeedback: { kind: 'idle' },
  }
}

/**
 * 恢复暂停过的会话（阶段来回切换时使用）：
 * 以最后一次输入时刻为基准平移计时起点，暂停时间不计入 cpm。
 */
export function resumeSession(state: SessionState, at?: number): SessionState {
  if (state.phase === 'finished') return state
  const now = nowOf(at)
  const pivot = state.stats.totalMs > 0 ? now - state.stats.totalMs : now
  return {
    ...state,
    stats: { ...state.stats, startedAt: pivot },
    lastFeedback: { kind: 'idle' },
  }
}

/** 退格：删除当前字已输入的最后一个键（不推进、不计错；当前字为空时不动） */
export function backspace(state: SessionState): SessionState {
  if (state.phase === 'finished') return state
  const wordState = currentWordState(state)
  if (!wordState || wordState.input.length === 0) return state
  const words = replaceWord(state.words, state.index, {
    ...wordState,
    input: wordState.input.slice(0, -1),
  })
  return { ...state, words, lastFeedback: { kind: 'idle' } }
}

/** 清空当前字全部输入（空格/Enter 错误恢复用；不增加错误数、不推进） */
export function clearInput(state: SessionState): SessionState {
  if (state.phase === 'finished') return state
  const wordState = currentWordState(state)
  if (!wordState || wordState.input.length === 0) return state
  const words = replaceWord(state.words, state.index, { ...wordState, input: [] })
  return { ...state, words, lastFeedback: { kind: 'idle' } }
}

/** 会话统计快照（accuracy / cpm / 完成字数；now 用于进行中会话的速度） */
export function sessionMetrics(state: SessionState, at?: number): SessionMetrics {
  const { stats } = state
  const finished = state.phase === 'finished'
  const endTime = finished ? (stats.finishedAt ?? stats.startedAt) : nowOf(at)
  const elapsedMs = Math.max(0, endTime - stats.startedAt)
  const cpm = elapsedMs > 0 ? Math.round((stats.correctChars / elapsedMs) * 60_000) : 0
  return {
    accuracy: accuracyOf(stats.correctChars, stats.errors),
    cpm,
    completedChars: stats.correctChars,
    completedWords: stats.wordsCompleted,
    totalChars: stats.totalChars,
    finished,
  }
}
