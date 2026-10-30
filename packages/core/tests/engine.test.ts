/**
 * 方案引擎测试：
 * 1) data/schemes/engine-cases.json 的 19 套方案正例/反例；
 * 2) 主键与判题口径（j/q/x/y + ü 主键 = U 键，n/l 后 ü = 方案 ü 键）；
 * 3) 零声母 / override / 飞键 / 多键韵母 / 整音节码特例；
 * 4) keyMap 与 diff() 数据一致性。
 */
import { describe, expect, it } from 'vitest'
import type { Final, Initial, SyllableFinal, SyllableSpec } from '../src/types.ts'
import { splitPinyin } from '../src/pinyin.ts'
import { createSchemeEngine } from '../src/scheme.ts'
import {
  loadEngine,
  loadEngineCases,
  loadSchemeDef,
  loadSchemeIndex,
  type EngineCasePositive,
} from './helpers.ts'

const cases = loadEngineCases()
const schemeIndex = loadSchemeIndex()

function specOf(item: Pick<EngineCasePositive, 'initial' | 'final' | 'zeroInitial'>): SyllableSpec {
  return {
    initial: item.initial as Initial,
    final: item.final as SyllableFinal,
    zeroInitial: item.zeroInitial === true,
  }
}

function specFromPinyin(pinyin: string): SyllableSpec {
  const split = splitPinyin(pinyin)
  if (!split) throw new Error(`测试用例拼音无法规范拆分：${pinyin}`)
  return { initial: split.initial, final: split.final, zeroInitial: split.zeroInitial }
}

describe('方案引擎 · 19 套方案 golden cases', () => {
  for (const [schemeId, schemeCases] of Object.entries(cases.schemes)) {
    it(`${schemeId}（${schemeCases.name}）正例全部命中，主键属于接受集`, () => {
      const engine = createSchemeEngine(loadSchemeDef(schemeId))
      const problems: string[] = []
      for (const item of schemeCases.positive) {
        const spec = specOf(item)
        const accepted = engine.acceptedSequences(spec).map((sequence) => sequence.join(''))
        for (const sequence of item.accepted) {
          if (!engine.judge(sequence, spec)) problems.push(`${item.pinyin} 应接受 ${sequence}`)
          if (!accepted.includes(sequence.toLowerCase())) {
            problems.push(`${item.pinyin} acceptedSequences 缺少 ${sequence}`)
          }
        }
        const primary = engine.primarySequence(spec).join('')
        if (primary.length === 0) problems.push(`${item.pinyin} 主键序列为空`)
        else if (!accepted.includes(primary)) problems.push(`${item.pinyin} 主键 ${primary} 不在接受集`)
      }
      expect(problems.slice(0, 10), problems.join('\n')).toEqual([])
    })

    it(`${schemeId}（${schemeCases.name}）反例全部拒绝`, () => {
      const engine = createSchemeEngine(loadSchemeDef(schemeId))
      const problems: string[] = []
      for (const item of schemeCases.negative) {
        const spec = specFromPinyin(item.pinyin)
        for (const sequence of item.rejected) {
          if (engine.judge(sequence, spec)) problems.push(`${item.pinyin} 不应接受 ${sequence}`)
        }
      }
      expect(problems.slice(0, 10), problems.join('\n')).toEqual([])
    })
  }
})

describe('方案引擎 · 主键与判题口径', () => {
  it('小鹤 j/q/x/y + ü：主键用 U 键；ü 键（V）作为容错多解', () => {
    const engine = loadEngine('xiaohe')
    const qu: SyllableSpec = { initial: 'q', final: 'u' }
    expect(engine.primarySequence(qu)).toEqual(['q', 'u'])
    expect(engine.acceptedSequences(qu).map((s) => s.join(''))).toEqual(['qu', 'qv'])
    expect(engine.judge('qu', qu)).toBe(true)
    expect(engine.judge('QV', qu)).toBe(true)
  })

  it('微软/搜狗：ü 键在 Y，jqxy+u 主键仍为 U、容错接受 Y', () => {
    for (const schemeId of ['weiruan', 'sougou']) {
      const engine = loadEngine(schemeId)
      const qu: SyllableSpec = { initial: 'q', final: 'u' }
      expect(engine.primarySequence(qu), schemeId).toEqual(['q', 'u'])
      expect(engine.acceptedSequences(qu).map((s) => s.join('')), schemeId).toEqual(['qu', 'qy'])
    }
  })

  it('n/l 后 ü：主键取方案 ü 键（小鹤 V / 微软 Y）', () => {
    expect(loadEngine('xiaohe').primarySequence({ initial: 'n', final: 'v' })).toEqual(['n', 'v'])
    expect(loadEngine('xiaohe').primarySequence({ initial: 'l', final: 've' })).toEqual(['l', 't'])
    expect(loadEngine('weiruan').primarySequence({ initial: 'n', final: 'v' })).toEqual(['n', 'y'])
  })

  it('小鹤：12 个零声母整段序列', () => {
    const engine = loadEngine('xiaohe')
    const expected: Record<string, string> = {
      a: 'aa', ai: 'ai', an: 'an', ang: 'ah', ao: 'ao', e: 'ee',
      ei: 'ei', en: 'en', eng: 'eg', er: 'er', o: 'oo', ou: 'ou',
    }
    for (const [final, sequence] of Object.entries(expected)) {
      expect(engine.primarySequence({ initial: '', final: final as Final, zeroInitial: true })).toEqual([
        ...sequence,
      ])
    }
  })

  it('微软/搜狗：零声母为 o+键 式', () => {
    const engine = loadEngine('weiruan')
    expect(engine.primarySequence({ initial: '', final: 'an', zeroInitial: true })).toEqual(['o', 'j'])
    expect(engine.primarySequence({ initial: '', final: 'ang', zeroInitial: true })).toEqual(['o', 'h'])
  })

  it('智能ABC：zh→a / ch→e / sh→v 声母改造', () => {
    const engine = loadEngine('zhinengabc')
    expect(engine.primarySequence({ initial: 'zh', final: 'ong' })).toEqual(['a', 's'])
    expect(engine.primarySequence({ initial: 'ch', final: 'ang' })).toEqual(['e', 'h'])
    expect(engine.primarySequence({ initial: 'sh', final: 'u' })).toEqual(['v', 'u'])
  })

  it('零声母优先于组合展开：xiaohe a 只接受 aa', () => {
    const engine = loadEngine('xiaohe')
    expect(engine.judge('aa', { initial: '', final: 'a', zeroInitial: true })).toBe(true)
    expect(engine.judge('a', { initial: '', final: 'a', zeroInitial: true })).toBe(false)
  })

  it('键道3：jqxy+ü override 收窄组合展开（ju→jl）', () => {
    const engine = loadEngine('jiandao3')
    const ju: SyllableSpec = { initial: 'j', final: 'u' }
    expect(engine.primarySequence(ju)).toEqual(['j', 'l'])
    expect(engine.judge('jl', ju)).toBe(true)
    expect(engine.judge('ju', ju)).toBe(false)
  })

  it('大牛：飞键声母多解（sh→u/v），任一命中即正确，主键取第一个', () => {
    const engine = loadEngine('daniu')
    const spec: SyllableSpec = { initial: 'sh', final: 'i' }
    const accepted = engine.acceptedSequences(spec).map((sequence) => sequence.join(''))
    expect(accepted.length).toBeGreaterThan(1)
    for (const sequence of accepted) expect(engine.judge(sequence, spec), sequence).toBe(true)
    expect(accepted[0]).toBe(engine.primarySequence(spec).join(''))
  })

  it('微软：多键韵母 ue→[t,v] 双解均接受', () => {
    const engine = loadEngine('weiruan')
    const spec: SyllableSpec = { initial: 'x', final: 'ue' }
    expect(engine.judge('xt', spec)).toBe(true)
    expect(engine.judge('xv', spec)).toBe(true)
  })

  it('C 双拼：syllable-code 整音节码查表', () => {
    const engine = loadEngine('c')
    expect(engine.primarySequence({ initial: 'b', final: 'a' })).toEqual(['b', 'a'])
    expect(engine.primarySequence({ initial: 'b', final: 'ai' })).toEqual(['b', 'h'])
    expect(engine.primarySequence({ initial: '', final: 'a', zeroInitial: true })).toEqual(['a', 'h'])
  })

  it('C 双拼缺 zero:eng 数据时显式返回空序列（不静默兜底）', () => {
    const engine = loadEngine('c')
    expect(engine.acceptedSequences({ initial: '', final: 'eng', zeroInitial: true })).toEqual([])
  })
})

describe('方案引擎 · keyMap / diff', () => {
  it('keyMap：3 行键盘，字母齐全；方案用到 ; 时包含分号键', () => {
    const xiaohe = loadEngine('xiaohe').keyMap()
    expect(xiaohe).toHaveLength(3)
    expect(xiaohe.map((row) => row.length)).toEqual([10, 9, 7])
    const letters = xiaohe.flat().map((key) => key.letter).join('')
    for (const letter of 'qwertyuiopasdfghjklzxcvbnm') expect(letters).toContain(letter)

    const weiruan = loadEngine('weiruan').keyMap()
    expect(weiruan[1]?.map((key) => key.letter)).toContain(';')
    const ingKey = weiruan[1]?.find((key) => key.atomIds.includes('final:ing' as never))
    expect(ingKey?.letter).toBe(';')
  })

  it('diff：free/learn 数量与 data/schemes/index.json 原子统计一致', () => {
    for (const summary of schemeIndex.schemes) {
      const engine = createSchemeEngine(loadSchemeDef(summary.id))
      const diff = engine.diff()
      const stats = summary.atoms
      expect(diff.freeInitials.length, summary.id).toBe(stats?.initials?.free)
      expect(diff.freeFinals.length, summary.id).toBe(stats?.finals?.free)
      expect(diff.freeZero.length, summary.id).toBe(stats?.zeroInitial?.free)
      expect(diff.learnInitials.length + diff.freeInitials.length, summary.id).toBe(stats?.initials?.total)
    }
  })

  it('judge 支持字符串/数组两种输入，大小写不敏感', () => {
    const engine = loadEngine('xiaohe')
    const spec: SyllableSpec = { initial: 'zh', final: 'ong' }
    expect(engine.judge('VS', spec)).toBe(true)
    expect(engine.judge(['v', 's'], spec)).toBe(true)
    expect(engine.judge(['v', 's', 'x'], spec)).toBe(false)
  })
})
