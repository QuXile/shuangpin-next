/**
 * 练习会话状态机测试：逐字推进、错误反馈、退格、统计与速度、结束态。
 */
import { describe, expect, it } from 'vitest'
import type { SessionState } from '../src/types.ts'
import { appendSessionWords, applyKey, backspace, clearInput, createSession, normalizeKeyInput, resumeSession, sessionMetrics } from '../src/session.ts'
import { makePracticeWord } from './helpers.ts'

/** 女人：n,v / r,f */
const nvRen = makePracticeWord('女人', ['nv', 'ren'])
/** 女（单字）：n,v */
const nv = makePracticeWord('女', ['nv'])

function makeSession(words = [nvRen, nv], now = 0): SessionState {
  return createSession({ words, now })
}

function typeKeys(state: SessionState, keys: readonly string[], startAt = 100, step = 100): SessionState {
  let current = state
  keys.forEach((key, index) => {
    current = applyKey(current, key, startAt + index * step).state
  })
  return current
}

describe('createSession', () => {
  it('初始状态：playing、首词、空输入、统计归零', () => {
    const state = makeSession()
    expect(state.phase).toBe('playing')
    expect(state.index).toBe(0)
    expect(state.words).toHaveLength(2)
    expect(state.stats.totalChars).toBe(3)
    expect(state.stats.correctChars).toBe(0)
    expect(state.stats.accuracy).toBe(0)
    expect(state.lastFeedback.kind).toBe('idle')
  })

  it('空词表：直接 finished', () => {
    const state = createSession({ words: [], now: 10 })
    expect(state.phase).toBe('finished')
    expect(state.lastFeedback.kind).toBe('session-complete')
  })
})

describe('applyKey · 无限延伸', () => {
  it('批次末词完成后 extendWords 返回新词：继续 playing、追加词表、字数累加', () => {
    let state = makeSession([nv], 0) // 仅 1 个词
    let extended = 0
    const extendWords = () => {
      extended += 1
      return [nvRen]
    }
    state = applyKey(state, 'n', 100).state
    state = applyKey(state, 'v', 200, { extendWords }).state
    expect(extended).toBe(1)
    expect(state.phase).toBe('playing')
    expect(state.words).toHaveLength(2)
    expect(state.index).toBe(1)
    expect(state.stats.totalChars).toBe(3)
    expect(state.lastFeedback.kind).toBe('word-complete')
  })

  it('extendWords 返回空数组：会话结束', () => {
    let state = makeSession([nv], 0)
    state = applyKey(state, 'n', 100).state
    state = applyKey(state, 'v', 200, { extendWords: () => [] }).state
    expect(state.phase).toBe('finished')
    expect(state.lastFeedback.kind).toBe('session-complete')
  })
})

describe('appendSessionWords · 完成目标后继续练习', () => {
  it('finished 会话追加词后恢复 playing，字数累加', () => {
    let state = makeSession([nv], 0)
    state = applyKey(state, 'n', 100).state
    state = applyKey(state, 'v', 200).state
    expect(state.phase).toBe('finished')
    const next = appendSessionWords(state, [nvRen])
    expect(next.phase).toBe('playing')
    expect(next.words).toHaveLength(2)
    expect(next.stats.totalChars).toBe(3)
    expect(next.stats.finishedAt).toBeUndefined()
    expect(next.index).toBe(1)
  })

  it('空数组 no-op', () => {
    const state = makeSession()
    expect(appendSessionWords(state, [])).toBe(state)
  })
})

describe('resumeSession · 阶段切换恢复计时', () => {
  it('暂停时间不计入 cpm', () => {
    let state = makeSession([nvRen], 0)
    state = applyKey(state, 'n', 500).state
    state = applyKey(state, 'v', 1000).state
    const before = sessionMetrics(state, 1000)
    state = resumeSession(state, 6000)
    const after = sessionMetrics(state, 6000)
    expect(after.cpm).toBe(before.cpm)
    expect(after.completedChars).toBe(1)
    expect(after.completedWords).toBe(0)
  })
})

describe('applyKey · 正确推进', () => {
  it('逐字推进：typing → char-complete → word-complete → 下一词 → session-complete', () => {
    let state = makeSession()
    let result = applyKey(state, 'n', 100)
    state = result.state
    expect(result.feedback.kind).toBe('typing')
    expect(state.words[0]?.input).toEqual(['n'])

    result = applyKey(state, 'v', 200)
    state = result.state
    expect(result.feedback.kind).toBe('char-complete')
    expect(state.words[0]?.charIndex).toBe(1)

    result = applyKey(state, 'r', 300)
    state = result.state
    expect(result.feedback.kind).toBe('typing')

    result = applyKey(state, 'f', 400)
    state = result.state
    expect(result.feedback.kind).toBe('word-complete')
    expect(state.index).toBe(1)
    expect(state.stats.wordsCompleted).toBe(1)

    result = applyKey(state, 'n', 500)
    state = result.state
    expect(result.feedback.kind).toBe('typing')
    result = applyKey(state, 'v', 600)
    state = result.state
    expect(result.feedback.kind).toBe('session-complete')
    expect(result.feedback.wordText).toBe('女')
    expect(state.index).toBe(2)
    expect(state.phase).toBe('finished')
    expect(state.stats.wordsCompleted).toBe(2)
    expect(state.stats.correctChars).toBe(3)
    expect(state.stats.accuracy).toBe(1)
  })

  it('末词完成时 session-complete，phase=finished，finishedAt 记录', () => {
    let state = makeSession([nv], 1000)
    state = applyKey(state, 'n', 1500).state
    const result = applyKey(state, 'v', 2000)
    expect(result.feedback.kind).toBe('session-complete')
    expect(result.state.phase).toBe('finished')
    expect(result.state.stats.finishedAt).toBe(2000)
    expect(result.state.stats.totalMs).toBe(1000)
    expect(result.state.stats.correctChars).toBe(1)
    expect(result.state.stats.accuracy).toBe(1)
  })
})

describe('applyKey · 错误反馈', () => {
  it('整字错误：errors+1、保留输入、回传 expected/input', () => {
    let state = makeSession([nv], 0)
    state = applyKey(state, 'x', 10).state
    const result = applyKey(state, 'x', 20)
    state = result.state
    expect(result.feedback.kind).toBe('wrong')
    expect(result.feedback.expected).toEqual(['n', 'v'])
    expect(result.feedback.input).toEqual(['x', 'x'])
    expect(state.stats.errors).toBe(1)
    expect(state.stats.accuracy).toBe(0)
    expect(state.words[0]?.input).toEqual(['x', 'x'])
    expect(state.phase).toBe('playing')
  })

  it('错误锁定后继续字母无反应（errors 不增、状态不变）', () => {
    let state = makeSession([nv], 0)
    state = applyKey(state, 'x', 10).state
    state = applyKey(state, 'x', 20).state // 错误 1 次
    const before = state
    const result = applyKey(state, 'n', 30)
    expect(result.feedback.kind).toBe('idle')
    expect(result.state).toBe(before)
    expect(result.state.stats.errors).toBe(1)
    expect(result.state.words[0]?.input).toEqual(['x', 'x'])
  })

  it('退格逐键撤销错误，回归正常后可重试成功', () => {
    let state = makeSession([nv], 0)
    state = applyKey(state, 'x', 10).state
    state = applyKey(state, 'x', 20).state
    state = backspace(state)
    expect(state.words[0]?.input).toEqual(['x'])
    state = backspace(state)
    expect(state.words[0]?.input).toEqual([])
    state = applyKey(state, 'n', 30).state
    state = applyKey(state, 'v', 40).state // 正确完成
    expect(state.stats.correctChars).toBe(1)
    expect(state.stats.errors).toBe(1)
    expect(state.stats.accuracy).toBe(0.5)
  })

  it('clearInput 清空错误输入后可重试', () => {
    let state = makeSession([nv], 0)
    state = applyKey(state, 'x', 10).state
    state = applyKey(state, 'x', 20).state
    state = clearInput(state)
    expect(state.words[0]?.input).toEqual([])
    expect(state.stats.errors).toBe(1)
    state = applyKey(state, 'n', 30).state
    const result = applyKey(state, 'v', 40)
    expect(result.feedback.kind).toBe('session-complete')
  })

  it('多解序列容错：qv 与 qu 均可完成 qù', () => {
    const qu = makePracticeWord('去', ['qu'])
    let state = makeSession([qu])
    state = applyKey(state, 'q', 10).state
    const result = applyKey(state, 'v', 20)
    expect(result.feedback.kind).toBe('session-complete')
  })

  it('非法输入被忽略（中文/多字符/空），状态不变', () => {
    const state = makeSession()
    for (const key of ['中', 'ab', '', ' ']) {
      const result = applyKey(state, key, 10)
      expect(result.feedback.kind).toBe('idle')
      expect(result.state).toBe(state)
    }
    expect(normalizeKeyInput('A')).toBe('a')
    expect(normalizeKeyInput(';')).toBe(';')
    expect(normalizeKeyInput('中')).toBeNull()
  })

  it('会话结束后按键无效', () => {
    let state = makeSession([nv], 0)
    state = applyKey(state, 'n', 10).state
    state = applyKey(state, 'v', 20).state
    expect(state.phase).toBe('finished')
    const result = applyKey(state, 'n', 30)
    expect(result.state).toBe(state)
    expect(result.feedback.kind).toBe('session-complete')
  })
})

describe('backspace', () => {
  it('删除当前字最后一个键；空输入时不动', () => {
    let state = makeSession()
    state = applyKey(state, 'n', 10).state
    expect(state.words[0]?.input).toEqual(['n'])
    state = backspace(state)
    expect(state.words[0]?.input).toEqual([])
    const after = backspace(state)
    expect(after.words[0]?.input).toEqual([])
    expect(after.stats.keystrokes).toBe(1)
  })

  it('会话结束后退格无效', () => {
    let state = makeSession([nv], 0)
    state = applyKey(state, 'n', 10).state
    state = applyKey(state, 'v', 20).state
    expect(backspace(state)).toBe(state)
  })
})

describe('一字多码的输入保留', () => {
  it('接受别名时保留实际输入，不强行改成主键', () => {
    const qu = makePracticeWord('区', ['qu'])
    let state = createSession({ words: [qu], now: 0 })
    state = applyKey(state, 'q', 10).state
    state = applyKey(state, 'v', 20).state
    expect(state.words[0].charInputs).toEqual([['q', 'v']])
    expect(state.words[0].word.syllables[0].caps.map((cap) => cap.key)).toEqual(['q', 'u'])
    expect(state.words[0].input).toEqual([])
  })
})

describe('sessionMetrics', () => {
  it('进行中会话按 now 计算 cpm；结束后冻结', () => {
    let state = createSession({ words: [nvRen], now: 1000 })
    state = applyKey(state, 'n', 2000).state
    state = applyKey(state, 'v', 3000).state
    const mid = sessionMetrics(state, 4000)
    expect(mid.completedChars).toBe(1)
    expect(mid.totalChars).toBe(2)
    expect(mid.accuracy).toBe(1)
    expect(mid.cpm).toBe(20) // 1 字 / (4000-1000)ms = 20 字/分
    expect(mid.finished).toBe(false)

    state = typeKeys(state, ['r', 'f'], 5000, 1000)
    expect(state.phase).toBe('finished')
    const finished = sessionMetrics(state, 999999)
    expect(finished.finished).toBe(true)
    expect(finished.completedChars).toBe(2)
  })

  it('零完成时 cpm=0', () => {
    const state = createSession({ words: [nv], now: 0 })
    expect(sessionMetrics(state, 5000).cpm).toBe(0)
  })
})
