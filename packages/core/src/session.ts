/**
 * 练习会话状态机 + 练习展示模型（纯函数）。
 *
 * 状态机语义：
 * - 期望键 = 当前字 caps 的主键序列；判题按字的全部可接受序列（含多解容错）；
 * - 部分键输入 → kind='typing'；整字正确 → char-complete，词完成 → word-complete；
 * - 批次末词完成时若调用方提供 extendWords 且返回新词，则追加批次继续（无限练习）；
 *   只有延伸返回空数组时才 session-complete / phase='finished'；
 * - 整字错误 → kind='wrong'、errors+1、保留当前字输入并回传正确键位与已输入键位；
 *   错误锁定后继续字母输入被忽略（返回 idle），退格可撤销，clearInput 可清空；
 * - 输入跟踪（原 web sessionInput 语义全部下沉）：wrongInputs / cellErrors / keyErrors / revealed；
 *   同一字第 3 次错误自动揭示答案；退格/清空解除该字错误红态；keyErrors 记录「按错|应为」对；
 * - 统计：accuracy = correctChars / (correctChars + errors)；cpm 由 sessionMetrics 计算；
 * - 退格只回退当前字（文档口径见 docs/ARCHITECTURE.md）。
 *
 * 展示模型语义（原 practice.ts）：
 * - 键帽 = 方案主键序列（声母 1 枚 + 韵母 1 枚；飞键/多解只展示主键，判题接受全部序列）；
 * - 零声母音节全部键帽 role='final'，atomId='zero:xx'；
 * - j/q/x/y + u 的主键取 U 键（全拼写作 u）；n/l 后的 ü 取方案 ü 键。
 */
import type {
  AtomId,
  ExtendWordsOptions,
  KeyErrorDetail,
  KeyErrorEntry,
  KeyResult,
  PracticeCap,
  PracticeSyllable,
  PracticeWord,
  SchemeEngine,
  SessionFeedback,
  SessionMetrics,
  SessionOptions,
  SessionState,
  SessionStats,
  SessionWordState,
  Syllable,
  SyllableFinal,
  SyllableSpec,
  WordEntry,
  WordSyllable,
} from './types.ts'
import { detectTone, isZeroSyllable, normalizePinyin, splitPinyin, toToneMarks } from './pinyin.ts'

// ── 展示模型（原 practice.ts） ────────────────────────────────

function buildCaps(syllable: SyllableSpec, primary: readonly string[]): PracticeCap[] {
  const zeroInitial = isZeroSyllable(syllable)
  return primary.map((key, index) => ({
    key,
    role: !zeroInitial && index === 0 ? 'initial' : 'final',
    atomId: (zeroInitial
      ? `zero:${syllable.final}`
      : index === 0
        ? `initial:${syllable.initial}`
        : `final:${syllable.final}`) as AtomId,
  }))
}

/** 单音节 → 展示模型（caps 基于主键序列；缺数据时显式抛错） */
export function buildPracticeSyllable(
  engine: SchemeEngine,
  syllable: WordSyllable | Syllable,
): PracticeSyllable {
  const zeroInitial = syllable.initial === ''
  const spec: SyllableSpec = { initial: syllable.initial, final: syllable.final, zeroInitial }
  const accepted = engine.acceptedSequences(spec)
  const primary = engine.primarySequence(spec)
  if (primary.length === 0) {
    throw new Error(
      `方案「${engine.def.name}」缺少音节 ${syllable.initial || '零声母'}${syllable.final} 的键位数据`,
    )
  }
  const pinyin = normalizePinyin(syllable.pinyin)
  return {
    text: syllable.text,
    pinyin,
    pinyinTone: toToneMarks(pinyin, syllable.tone),
    initial: syllable.initial,
    final: syllable.final as SyllableFinal,
    zeroInitial,
    caps: buildCaps(spec, primary),
    accepted: accepted.map((sequence) => sequence.join('')),
  }
}

/** 单音节（一个字）→ PracticeWord：用于「单字练习」阶段与教学示例 */
export function buildPracticeWordFromSyllable(engine: SchemeEngine, syllable: Syllable): PracticeWord {
  const built = buildPracticeSyllable(engine, syllable)
  return {
    text: syllable.text || built.pinyinTone,
    chars: [built.text],
    syllables: [built],
    caps: built.caps,
  }
}

/** 词条 → PracticeWord（逐字展示 + 扁平键帽序列 + 判题用可接受键序列） */
export function buildPracticeWord(engine: SchemeEngine, word: WordEntry): PracticeWord {
  const syllables = word.syllables.map((syllable) => buildPracticeSyllable(engine, syllable))
  return {
    text: word.text,
    chars: word.chars.length > 0 ? [...word.chars] : syllables.map((syllable) => syllable.text),
    syllables,
    caps: syllables.flatMap((syllable) => syllable.caps),
  }
}

/** 便捷构造：拼音（可带声调）+ 可选汉字 → 规范 Syllable（非法拼音抛错） */
export function syllableOf(pinyin: string, text = '', tone?: Syllable['tone']): Syllable {
  const split = splitPinyin(pinyin)
  if (!split) throw new Error(`非法拼音音节：${pinyin}`)
  const syllable: Syllable = {
    text,
    pinyin: `${split.initial}${split.final}`,
    initial: split.initial,
    final: split.final as SyllableFinal,
  }
  const resolvedTone = tone ?? detectTone(pinyin)
  if (resolvedTone !== undefined) syllable.tone = resolvedTone
  return syllable
}

// ── 输入跟踪（原 web sessionInput.ts 语义） ──────────────────

const EMPTY_STRINGS: readonly string[] = []

/** 当前字在会话中的稳定 key（词下标:字下标）；会话结束返回 null */
export function cellKeyOf(state: SessionState): string | null {
  const wordState = state.words[state.index]
  if (!wordState) return null
  return `${state.index}:${wordState.charIndex}`
}

/** 当前字是否处于「错误红态」（提交过错误、且未退格/清空/完成） */
export function hasInputError(state: SessionState): boolean {
  const key = cellKeyOf(state)
  return key !== null && state.wrongInputs.has(key)
}

/**
 * 错误键位排行（解析 `SessionState.keyErrors` 的 `"实际按下|应为"` 编码）：
 * 按次数降序，同次数按 expected、typed 字典序。展示层直接映射即可，不再拆字符串。
 */
export function keyErrorEntries(state: SessionState): KeyErrorEntry[] {
  const entries = [...state.keyErrors.entries()].map(([pair, count]) => {
    const [typed = '?', expected = '?'] = pair.split('|')
    return { typed: typed || '?', expected: expected || '?', count }
  })
  return entries.sort(
    (a, b) =>
      b.count - a.count ||
      a.expected.localeCompare(b.expected) ||
      a.typed.localeCompare(b.typed),
  )
}

/**
 * 带知识点上下文的错误键位排行。新会话优先使用 `keyErrorDetails`；
 * 旧数据没有详细表时回退到 keyErrors（无 atomId）。
 */
export function keyErrorEntriesWithAtoms(state: SessionState): KeyErrorDetail[] {
  const details = [...state.keyErrorDetails.values()]
  if (details.length === 0) {
    return keyErrorEntries(state).map((entry) => ({ ...entry }))
  }
  return details.sort(
    (a, b) =>
      b.count - a.count ||
      a.expected.localeCompare(b.expected) ||
      a.typed.localeCompare(b.typed) ||
      (a.atomId ?? '').localeCompare(b.atomId ?? ''),
  )
}

function clearCellError(state: SessionState, cellKey: string): ReadonlyMap<string, string[]> {
  if (!state.wrongInputs.has(cellKey)) return state.wrongInputs
  const next = new Map(state.wrongInputs)
  next.delete(cellKey)
  return next
}

interface TrackerPatch {
  revealed: ReadonlySet<string>
  wrongInputs: ReadonlyMap<string, string[]>
  cellErrors: ReadonlyMap<string, number>
  keyErrors: ReadonlyMap<string, number>
  keyErrorDetails: ReadonlyMap<string, KeyErrorDetail>
}

/** 记录一次整字错误：wrongInputs / cellErrors / keyErrors / 第 3 次揭示 */
function recordWrong(state: SessionState, cellKey: string, feedback: SessionFeedback): TrackerPatch {
  const wrongInputs = new Map(state.wrongInputs)
  wrongInputs.set(cellKey, [...(feedback.input ?? EMPTY_STRINGS)])

  const cellErrors = new Map(state.cellErrors)
  const count = (cellErrors.get(cellKey) ?? 0) + 1
  cellErrors.set(cellKey, count)

  let keyErrors: ReadonlyMap<string, number> = state.keyErrors
  let keyErrorDetails: ReadonlyMap<string, KeyErrorDetail> = state.keyErrorDetails
  const expected = feedback.expected ?? EMPTY_STRINGS
  const typed = feedback.input ?? EMPTY_STRINGS
  const mismatch = expected.findIndex((key, index) => typed[index] !== key)
  if (mismatch >= 0) {
    const next = new Map(keyErrors)
    const typedKey = typed[mismatch] ?? '?'
    const expectedKey = expected[mismatch] ?? '?'
    const pair = `${typedKey}|${expectedKey}`
    next.set(pair, (next.get(pair) ?? 0) + 1)
    keyErrors = next

    const wordState = state.words[state.index]
    const syllable = wordState?.word.syllables[wordState.charIndex]
    const atomId = syllable?.caps[mismatch]?.atomId
    const detailKey = `${typedKey}|${expectedKey}|${atomId ?? ''}`
    const detailMap = new Map(keyErrorDetails)
    const previous = detailMap.get(detailKey)
    detailMap.set(detailKey, {
      typed: typedKey,
      expected: expectedKey,
      ...(atomId ? { atomId } : {}),
      count: (previous?.count ?? 0) + 1,
    })
    keyErrorDetails = detailMap
  }

  let revealed: ReadonlySet<string> = state.revealed
  if (count >= 3 && !revealed.has(cellKey)) {
    const next = new Set(revealed)
    next.add(cellKey)
    revealed = next
  }

  return { revealed, wrongInputs, cellErrors, keyErrors, keyErrorDetails }
}

// ── 会话状态机 ────────────────────────────────────────────────

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
  }
}

function newWordState(word: PracticeWord): SessionWordState {
  return { word, charIndex: 0, input: [], charInputs: [] }
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
 *
 * 输入规则唯一口径：web 输入管线（`lib/dom.ts` 的 isLetterKey/letterKeyOf）已直接调用本函数。
 */
export function normalizeKeyInput(raw: string): string | null {
  const normalized = String(raw ?? '').trim().toLowerCase()
  return /^[a-z;]$/.test(normalized) ? normalized : null
}

/** 创建练习会话（now 用于计时起点；同一次会话内所有时间使用同一时钟） */
export function createSession(options: SessionOptions): SessionState {
  const startedAt = nowOf(options.now)
  const words: SessionWordState[] = options.words.map(newWordState)
  const totalChars = words.reduce((sum, item) => sum + item.word.syllables.length, 0)
  const finished = words.length === 0
  const stats = emptyStats(startedAt, totalChars)
  if (finished) stats.finishedAt = startedAt
  return {
    words,
    index: 0,
    phase: finished ? 'finished' : 'playing',
    lastFeedback: {
      kind: finished ? 'session-complete' : 'idle',
      message: finished ? '练习完成' : undefined,
    },
    stats,
    revealed: new Set(),
    wrongInputs: new Map(),
    cellErrors: new Map(),
    keyErrors: new Map(),
    keyErrorDetails: new Map(),
  }
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
  const cellKey = `${initialState.index}:${wordState.charIndex}`

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
    const words = replaceWord(initialState.words, initialState.index, {
      ...wordState,
      input: [...input],
    })
    const feedback: SessionFeedback = {
      kind: 'wrong',
      message: `键位错误，正确键位：${expected.join('').toUpperCase()}`,
      expected: [...expected],
      input: [...input],
      wordText: wordState.word.text,
    }
    const tracker = recordWrong(initialState, cellKey, feedback)
    return {
      state: { ...initialState, words, stats, lastFeedback: feedback, ...tracker },
      feedback,
    }
  }

  // 当前字正确
  stats.correctChars = initialState.stats.correctChars + 1
  const charIndex = wordState.charIndex + 1
  const wordFinished = charIndex >= wordState.word.syllables.length

  const charInputs = [...(wordState.charInputs ?? []), [...input]]
  const wrongInputs = clearCellError(initialState, cellKey)
  if (!wordFinished) {
    const words = replaceWord(initialState.words, initialState.index, {
      ...wordState,
      charIndex,
      input: [],
      charInputs,
    })
    const feedback: SessionFeedback = { kind: 'char-complete', wordText: wordState.word.text }
    return {
      state: { ...initialState, words, stats, lastFeedback: feedback, wrongInputs },
      feedback,
    }
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
          wrongInputs,
        },
        feedback,
      }
    }
    // 追加延伸批次，继续练习（无限练习由调用方决定何时停止）
    const extraWords = extra.map(newWordState)
    stats.totalChars += extraWords.reduce((sum, item) => sum + item.word.syllables.length, 0)
    words = [...words, ...extraWords]
  }

  const feedback: SessionFeedback = {
    kind: 'word-complete',
    message: `「${wordState.word.text}」完成`,
    wordText: wordState.word.text,
  }
  return {
    state: { ...initialState, words, index: nextIndex, stats, lastFeedback: feedback, wrongInputs },
    feedback,
  }
}

/**
 * 在会话末尾追加词（有限目标完成、用户选择"继续练习"时使用）：
 * 若会话已 finished 则恢复为 playing，字数累计。
 */
export function appendSessionWords(state: SessionState, words: PracticeWord[]): SessionState {
  if (words.length === 0) return state
  const extra = words.map(newWordState)
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

/** 退格：删除当前字已输入的最后一个键（不推进、不计错；同时解除当前字错误红态） */
export function backspace(state: SessionState): SessionState {
  if (state.phase === 'finished') return state
  const wordState = currentWordState(state)
  if (!wordState || wordState.input.length === 0) return state
  const words = replaceWord(state.words, state.index, {
    ...wordState,
    input: wordState.input.slice(0, -1),
  })
  return {
    ...state,
    words,
    wrongInputs: clearCellError(state, `${state.index}:${wordState.charIndex}`),
    lastFeedback: { kind: 'idle' },
  }
}

/** 清空当前字全部输入（空格/Enter 错误恢复用；不增加错误数、不推进；解除错误红态） */
export function clearInput(state: SessionState): SessionState {
  if (state.phase === 'finished') return state
  const wordState = currentWordState(state)
  if (!wordState || wordState.input.length === 0) return state
  const words = replaceWord(state.words, state.index, { ...wordState, input: [] })
  return {
    ...state,
    words,
    wrongInputs: clearCellError(state, `${state.index}:${wordState.charIndex}`),
    lastFeedback: { kind: 'idle' },
  }
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
