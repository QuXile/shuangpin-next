import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  applyKey,
  buildPracticeWord,
  clearInput,
  createSchemeEngine,
  createSession,
  type PracticeWord,
  type SchemeDef,
  type WordEntry,
} from '@shuangpin/core'
import {
  buildSessionSummary,
  liveMessageOf,
  playFeedback,
} from '../src/lib/sessionSummary.ts'

type FeedbackPlayer = {
  playKey(): void
  playError(): void
  playComplete(): void
}

const scheme = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../data/schemes/xiaohe/scheme.json', import.meta.url)), 'utf8'),
) as SchemeDef
const engine = createSchemeEngine(scheme)

const entry: WordEntry = {
  text: '双拼',
  length: 2,
  freq: 1,
  chars: ['双', '拼'],
  syllables: [
    { text: '双', pinyin: 'shuang', initial: 'sh', final: 'uang', tone: 1 },
    { text: '拼', pinyin: 'pin', initial: 'p', final: 'in', tone: 1 },
  ],
}

const word: PracticeWord = buildPracticeWord(engine, entry)

/** 依次敲入全部主键，返回已完成的会话 */
function typeAll(at = 0): ReturnType<typeof createSession> {
  let state = createSession({ words: [word], now: 0 })
  let time = at
  for (const cap of word.caps) {
    time += 100
    state = applyKey(state, cap.key, time).state
  }
  return state
}

describe('sessionSummary · 结束统计', () => {
  it('全对：100% 正确率、1 词、至少 1 秒、无错误键位', () => {
    const summary = buildSessionSummary(typeAll(), 10_000)
    expect(summary.completedWords).toBe(1)
    expect(summary.accuracy).toBe(100)
    expect(summary.errors).toBe(0)
    expect(summary.durationSec).toBeGreaterThanOrEqual(1)
    expect(summary.keyErrorRows).toEqual([])
  })

  it('整字打错后清空重打：正确率按 正确字数/(正确+错误) 计算，并记录错误键位', () => {
    const firstCaps = word.syllables[0]?.caps ?? []
    expect(firstCaps.length).toBeGreaterThan(1)
    const wrongKeys = firstCaps.map((cap, index) =>
      index === 0 ? (cap.key === 'q' ? 'w' : 'q') : cap.key,
    )
    let state = createSession({ words: [word], now: 0 })
    let time = 0
    for (const key of wrongKeys) {
      time += 100
      state = applyKey(state, key, time).state
    }
    expect(state.stats.errors).toBe(1)
    expect(state.wrongInputs.size).toBe(1)
    state = clearInput(state)
    expect(state.wrongInputs.size).toBe(0)
    for (const cap of word.caps) {
      time += 100
      state = applyKey(state, cap.key, time).state
    }
    const summary = buildSessionSummary(state, 50_000)
    expect(summary.accuracy).toBe(67)
    expect(summary.errors).toBe(1)
    expect(summary.completedWords).toBe(1)
    expect(summary.keyErrorRows).toHaveLength(1)
    expect(summary.keyErrorRows[0]).toMatchObject({
      expected: firstCaps[0]?.key.toUpperCase(),
      typed: wrongKeys[0]?.toUpperCase(),
      count: 1,
    })
  })

  it('未结束会话用同一时钟的 now 计算时长', () => {
    const state = createSession({ words: [word], now: 0 })
    const summary = buildSessionSummary(state, 3_000)
    expect(summary.completedWords).toBe(0)
    expect(summary.durationSec).toBe(3)
  })
})

describe('sessionSummary · 错误键位排行', () => {
  it('消费 core keyErrorEntries：按次数降序、键位大写', () => {
    const base = createSession({ words: [word], now: 0 })
    const state = {
      ...base,
      keyErrors: new Map([
        ['q|p', 2],
        ['z|p', 2],
        ['a|s', 1],
      ]),
    }
    const rows = buildSessionSummary(state, 2_000).keyErrorRows
    expect(rows).toEqual([
      { expected: 'P', typed: 'Q', count: 2 },
      { expected: 'P', typed: 'Z', count: 2 },
      { expected: 'S', typed: 'A', count: 1 },
    ])
    expect(buildSessionSummary(base, 2_000).keyErrorRows).toEqual([])
  })
})

describe('sessionSummary · 反馈文案', () => {
  it('错误与词完成有默认文案，其它反馈为空', () => {
    expect(liveMessageOf(undefined)).toBe('')
    expect(liveMessageOf({ kind: 'idle' })).toBe('')
    expect(liveMessageOf({ kind: 'wrong' })).toBe('键位错误')
    expect(liveMessageOf({ kind: 'wrong', message: '键位错误：应敲 p' })).toBe('键位错误：应敲 p')
    expect(liveMessageOf({ kind: 'word-complete' })).toBe('词语完成')
    expect(liveMessageOf({ kind: 'word-complete', message: '双拼完成' })).toBe('双拼完成')
  })
})

describe('sessionSummary · 声音反馈分支', () => {
  function recorder(): FeedbackPlayer & { calls: string[] } {
    const calls: string[] = []
    return {
      calls,
      playKey: () => calls.push('key'),
      playError: () => calls.push('error'),
      playComplete: () => calls.push('complete'),
    }
  }

  it('错误/词完成/其它分别映射三种音效', () => {
    const player = recorder()
    playFeedback(player, { kind: 'wrong' })
    playFeedback(player, { kind: 'word-complete' })
    playFeedback(player, { kind: 'char-complete' })
    playFeedback(player, { kind: 'idle' })
    playFeedback(player, undefined)
    expect(player.calls).toEqual(['error', 'complete', 'key', 'key', 'key'])
  })
})
