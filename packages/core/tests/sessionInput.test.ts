/**
 * SessionState 内置输入跟踪测试（原 apps/web/src/lib/sessionInput.ts 语义逐条钉住）。
 *
 * 覆盖：错误锁定、wrongInputs 记录、第 3 次错误揭示、退格/清空解除错误、
 * keyErrors「按错|应为」配对、char/word 完成清除错误、resume/append 保留跟踪状态。
 * web 侧可直接删除 sessionInput 层，只读 SessionState 的四个字段。
 */
import { describe, expect, it } from 'vitest'
import type { SessionState } from '../src/types.ts'
import {
  applyKey,
  appendSessionWords,
  backspace,
  clearInput,
  createSession,
  cellKeyOf,
  hasInputError,
  keyErrorEntries,
  resumeSession,
} from '../src/session.ts'
import { makePracticeWord } from './helpers.ts'

/** 女人：n,v / r,f */
const nvRen = makePracticeWord('女人', ['nv', 'ren'])
/** 女（单字）：n,v */
const nv = makePracticeWord('女', ['nv'])

function sessionOf(words = [nvRen], now = 0): SessionState {
  return createSession({ words, now })
}

function press(state: SessionState, keys: readonly string[], startAt = 100): SessionState {
  let current = state
  keys.forEach((key, index) => {
    current = applyKey(current, key, startAt + index * 100).state
  })
  return current
}

/** 打满当前字并制造一次错误（x x） */
function wrongOnce(state: SessionState, at = 10): SessionState {
  return press(state, ['x', 'x'], at)
}

describe('SessionState 输入跟踪 · 初始与命令键', () => {
  it('createSession 初始化四个跟踪字段，cellKeyOf 指向 0:0', () => {
    const state = sessionOf()
    expect(state.revealed.size).toBe(0)
    expect(state.wrongInputs.size).toBe(0)
    expect(state.cellErrors.size).toBe(0)
    expect(state.keyErrors.size).toBe(0)
    expect(cellKeyOf(state)).toBe('0:0')
    expect(hasInputError(state)).toBe(false)
  })

  it('typing 输入不产生错误跟踪；多解输入 qv 判题通过且不记录错误', () => {
    const nvState = press(sessionOf([makePracticeWord('去', ['qu'])]), ['q', 'v'])
    expect(nvState.wrongInputs.size).toBe(0)
    expect(nvState.cellErrors.size).toBe(0)
    expect(nvState.keyErrors.size).toBe(0)
    expect(nvState.revealed.size).toBe(0)
  })

  it('会话结束 / 非法按键时跟踪字段不变', () => {
    const finished = press(sessionOf([nv]), ['n', 'v'])
    expect(finished.phase).toBe('finished')
    expect(applyKey(finished, 'n', 500).state).toBe(finished)
    const state = sessionOf()
    for (const key of ['中', 'ab', '', ' ']) {
      expect(applyKey(state, key, 10).state).toBe(state)
    }
  })
})

describe('SessionState 输入跟踪 · 错误锁定与错误红态', () => {
  it('整字错误：wrongInputs/错误次数/keyErrors 记录，hasInputError=true', () => {
    const state = wrongOnce(sessionOf())
    expect(state.wrongInputs.get('0:0')).toEqual(['x', 'x'])
    expect(state.cellErrors.get('0:0')).toBe(1)
    expect(state.keyErrors.get('x|n')).toBe(1)
    expect(state.revealed.has('0:0')).toBe(false)
    expect(hasInputError(state)).toBe(true)
    expect(state.stats.errors).toBe(1)
    // 错误锁定：继续字母输入被忽略，状态引用不变
    const locked = applyKey(state, 'n', 1000)
    expect(locked.feedback.kind).toBe('idle')
    expect(locked.state).toBe(state)
    expect(locked.state.wrongInputs.get('0:0')).toEqual(['x', 'x'])
    expect(locked.state.stats.errors).toBe(1)
  })

  it('错误只按整字提交计一次：已满输入重复按键不会累加错误', () => {
    let state = wrongOnce(sessionOf())
    for (let index = 0; index < 5; index += 1) {
      state = applyKey(state, 'n', 1000 + index).state
    }
    expect(state.cellErrors.get('0:0')).toBe(1)
    expect(state.keyErrors.get('x|n')).toBe(1)
  })

  it('同一字第 3 次错误触发 revealed；此前不揭示', () => {
    let state = sessionOf()
    state = wrongOnce(state)
    expect(state.revealed.size).toBe(0)
    state = backspace(backspace(state))
    state = wrongOnce(state, 500)
    expect(state.revealed.size).toBe(0)
    state = clearInput(state)
    state = wrongOnce(state, 900)
    expect(state.cellErrors.get('0:0')).toBe(3)
    expect(state.revealed.has('0:0')).toBe(true)
  })

  it('退格解除当前字错误红态（cellErrors/revealed 保留）', () => {
    let state = wrongOnce(sessionOf())
    expect(hasInputError(state)).toBe(true)
    state = backspace(state)
    expect(state.wrongInputs.has('0:0')).toBe(false)
    expect(hasInputError(state)).toBe(false)
    expect(state.words[0]?.input).toEqual(['x'])
    expect(state.cellErrors.get('0:0')).toBe(1)
  })

  it('清空解除当前字错误红态并清空输入', () => {
    let state = wrongOnce(sessionOf())
    state = clearInput(state)
    expect(state.words[0]?.input).toEqual([])
    expect(state.wrongInputs.has('0:0')).toBe(false)
    expect(state.cellErrors.get('0:0')).toBe(1)
  })

  it('错误后重试成功：char-complete 清除 wrongInputs，追踪统计保留', () => {
    let state = wrongOnce(sessionOf())
    state = backspace(backspace(state))
    state = press(state, ['n'], 500) // 第一个字补 n
    expect(state.words[0]?.input).toEqual(['n'])
    expect(state.wrongInputs.has('0:0')).toBe(false) // 退格时已清除
    state = press(state, ['v'], 600)
    expect(state.words[0]?.charIndex).toBe(1)
    expect(state.wrongInputs.size).toBe(0)
    expect(state.cellErrors.get('0:0')).toBe(1)
  })

  it('不同字使用不同 cell key，第 3 次揭示按字独立', () => {
    let state = sessionOf()
    state = wrongOnce(state)
    state = backspace(backspace(state))
    state = press(state, ['n', 'v'], 500)
    expect(state.words[0]?.charIndex).toBe(1)
    expect(cellKeyOf(state)).toBe('0:1')
    expect(hasInputError(state)).toBe(false)
    state = press(state, ['x', 'x'], 700) // 第二个字错误
    expect(state.wrongInputs.has('0:1')).toBe(true)
    expect(state.cellErrors.get('0:1')).toBe(1)
    expect(state.cellErrors.get('0:0')).toBe(1)
  })

  it('单词完成后即完成字不再有错误红态；下一词 cell key 从 1:0 开始', () => {
    let state = sessionOf([nvRen, nv])
    state = press(state, ['n', 'v', 'r', 'f'], 100)
    expect(state.index).toBe(1)
    expect(cellKeyOf(state)).toBe('1:0')
    expect(hasInputError(state)).toBe(false)
    expect(state.wrongInputs.size).toBe(0)
  })
})

describe('SessionState 输入跟踪 · keyErrors 配对', () => {
  it('记录第一个错位键：按错|应为', () => {
    let state = sessionOf()
    state = press(state, ['n', 'x'], 100) // 期望 n,v；第二键错
    expect(state.keyErrors.get('x|v')).toBe(1)
    state = backspace(backspace(state))
    state = press(state, ['x', 'v'], 500)
    expect(state.keyErrors.get('x|n')).toBe(1)
    state = backspace(backspace(state))
    state = press(state, ['x', 'v'], 900)
    expect(state.keyErrors.get('x|n')).toBe(2)
  })

  it('多个字/多次错误累计到同一 pair', () => {
    let state = sessionOf([nv, nv])
    state = wrongOnce(state)
    state = clearInput(state)
    state = wrongOnce(state, 500)
    expect(state.keyErrors.get('x|n')).toBe(2)
    expect(state.cellErrors.get('0:0')).toBe(2)
  })
})

describe('SessionState 输入跟踪 · 会话生命周期', () => {
  it('resumeSession 保留跟踪字段', () => {
    let state = wrongOnce(sessionOf())
    state = resumeSession(state, 5000)
    expect(state.wrongInputs.get('0:0')).toEqual(['x', 'x'])
    expect(state.cellErrors.get('0:0')).toBe(1)
    expect(state.keyErrors.get('x|n')).toBe(1)
  })

  it('appendSessionWords 保留跟踪字段并恢复 playing', () => {
    let state = press(sessionOf([nv]), ['n', 'v'], 100)
    expect(state.phase).toBe('finished')
    state = appendSessionWords(state, [nvRen])
    expect(state.phase).toBe('playing')
    expect(state.wrongInputs.size).toBe(0)
    expect(state.revealed.size).toBe(0)
  })
})

describe('cellKeyOf / keyErrorEntries · 公共查询 API', () => {
  it('cellKeyOf：进行中返回 词下标:字下标，会话结束后返回 null', () => {
    let state = sessionOf()
    expect(cellKeyOf(state)).toBe('0:0')
    state = press(state, ['n'], 100)
    expect(cellKeyOf(state)).toBe('0:0')
    state = press(state, ['v'], 200)
    expect(cellKeyOf(state)).toBe('0:1')
    state = press(state, ['r', 'f'], 300)
    expect(cellKeyOf(state)).toBeNull() // 单词表完成 → finished
  })

  it('keyErrorEntries：解析 typed|expected 并按次数降序', () => {
    let state = sessionOf([nv, nv])
    state = wrongOnce(state) // x|x → x|n 一次
    state = clearInput(state)
    state = wrongOnce(state, 500) // x|x → x|n 二次
    state = clearInput(state)
    state = press(state, ['n', 'x'], 900) // n,x → x|v
    expect(keyErrorEntries(state)).toEqual([
      { typed: 'x', expected: 'n', count: 2 },
      { typed: 'x', expected: 'v', count: 1 },
    ])
  })

  it('keyErrorEntries：无错误返回空数组，未知 pair 兜底为 ?', () => {
    expect(keyErrorEntries(sessionOf())).toEqual([])
    const state = sessionOf()
    state.keyErrors = new Map([['only-one-part|', 3]])
    expect(keyErrorEntries(state)).toEqual([{ typed: 'only-one-part', expected: '?', count: 3 }])
  })
})
