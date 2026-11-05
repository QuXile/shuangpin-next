import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import {
  buildPracticeWord,
  createSchemeEngine,
  type PracticeWord,
  type SchemeDef,
  type WordEntry,
} from '@shuangpin/core'
import { useSessionRuntime, type SessionRuntime } from '../src/composables/useSessionRuntime.ts'

const scheme = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../data/schemes/xiaohe/scheme.json', import.meta.url)), 'utf8'),
) as SchemeDef
const engine = createSchemeEngine(scheme)

const wordEntry: WordEntry = {
  text: '双拼',
  length: 2,
  freq: 1,
  chars: ['双', '拼'],
  syllables: [
    { text: '双', pinyin: 'shuang', initial: 'sh', final: 'uang', tone: 1 },
    { text: '拼', pinyin: 'pin', initial: 'p', final: 'in', tone: 1 },
  ],
}
const word: PracticeWord = buildPracticeWord(engine, wordEntry)

/** 在独立 effectScope 中使用运行时，便于测 onScopeDispose 路径 */
function withRuntime(run: (runtime: SessionRuntime) => void): void {
  const scope = effectScope()
  const runtime = scope.run(() => useSessionRuntime())
  if (!runtime) throw new Error('runtime missing')
  try {
    run(runtime)
  } finally {
    scope.stop()
  }
}

describe('useSessionRuntime', () => {
  it('空词表不启动会话', () => {
    withRuntime((runtime) => {
      expect(runtime.start([])).toBe(false)
      expect(runtime.session.value).toBeNull()
    })
  })

  it('开始后可按 core 语义推进，错误锁定/退格解除/清空都可观察', () => {
    withRuntime((runtime) => {
      const startedAt = performance.now()
      expect(runtime.start([word])).toBe(true)
      expect(runtime.session.value).not.toBeNull()
      expect(runtime.hasStarted.value).toBe(false)
      expect(runtime.inError.value).toBe(false)

      const firstCaps = word.syllables[0]?.caps ?? []
      const wrongKeys = firstCaps.map((cap, index) =>
        index === 0 ? (cap.key === 'q' ? 'w' : 'q') : cap.key,
      )
      let at = startedAt + 100
      let feedback = null
      for (const key of wrongKeys) {
        at += 100
        feedback = runtime.apply(key, at)
      }
      expect(feedback?.kind).toBe('wrong')
      expect(runtime.session.value?.stats.errors).toBe(1)
      expect(runtime.inError.value).toBe(true)
      expect(runtime.wrongInputs.value.size).toBe(1)
      expect(runtime.keyErrors.value.size).toBe(1)
      expect(runtime.liveMessage.value).toContain('键位错误')
      expect(runtime.revealed.value.size).toBe(0)

      // 错误锁定后字母输入被忽略
      runtime.apply('x', at + 100)
      expect(runtime.session.value?.stats.errors).toBe(1)

      runtime.backspace()
      expect(runtime.inError.value).toBe(false)
      expect(runtime.wrongInputs.value.size).toBe(0)

      // 打满当前字但输错 → 再清空
      for (const key of wrongKeys) {
        at += 100
        runtime.apply(key, at)
      }
      expect(runtime.inError.value).toBe(true)
      runtime.clearInput()
      expect(runtime.inError.value).toBe(false)
      expect(runtime.session.value?.wrongInputs.size).toBe(0)
    })
  })

  it('全部答对后 finished，带 extend 可继续无尽批次', () => {
    withRuntime((runtime) => {
      const extend = (): PracticeWord[] => [word]
      expect(runtime.start([word], { extend })).toBe(true)
      const startedAt = performance.now()
      let at = startedAt
      for (const cap of word.caps) {
        at += 100
        runtime.apply(cap.key, at)
      }
      // 第一个词完成 → 会话继续（extend 提供下一批）
      expect(runtime.session.value?.phase).toBe('playing')
      expect(runtime.completedWords.value).toBe(1)
      expect(runtime.hasStarted.value).toBe(true)

      runtime.reset()
      expect(runtime.session.value).toBeNull()
      expect(runtime.cpm.value).toBe(0)
    })
  })

  it('暂停时冻结输入，继续后恢复', () => {
    withRuntime((runtime) => {
      runtime.start([word])
      const stateBefore = runtime.session.value
      runtime.togglePause()
      expect(runtime.paused.value).toBe(true)
      expect(runtime.apply('a')).toBeNull()
      expect(runtime.session.value).toBe(stateBefore)
      runtime.togglePause()
      expect(runtime.paused.value).toBe(false)
      const firstCap = word.caps[0]
      expect(firstCap).toBeTruthy()
      expect(runtime.apply(firstCap!.key)).not.toBeNull()
    })
  })

  it('暂停时长不计入最终完成时长', () => {
    let now = 1000
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => now)
    try {
      withRuntime((runtime) => {
        runtime.start([word])
        const caps = word.caps
        expect(caps.length).toBeGreaterThan(1)
        now += 100
        runtime.apply(caps[0]!.key)
        runtime.togglePause()
        now += 5_000
        runtime.togglePause()
        for (const cap of caps.slice(1)) {
          now += 100
          runtime.apply(cap.key)
        }
        const state = runtime.session.value
        expect(state?.phase).toBe('finished')
        expect((state?.stats.finishedAt ?? 0) - (state?.stats.startedAt ?? 0)).toBe(caps.length * 100)
      })
    } finally {
      nowSpy.mockRestore()
    }
  })

  it('无 extend 时批次结束即 finished，完成后 apply 返回 null', () => {
    withRuntime((runtime) => {
      runtime.start([word])
      const startedAt = performance.now()
      let at = startedAt
      for (const cap of word.caps) {
        at += 100
        runtime.apply(cap.key, at)
      }
      expect(runtime.session.value?.phase).toBe('finished')
      const finished = runtime.session.value
      expect(runtime.apply('a', at + 100)).toBeNull()
      runtime.backspace()
      runtime.clearInput()
      expect(runtime.session.value).toBe(finished)
    })
  })
})
