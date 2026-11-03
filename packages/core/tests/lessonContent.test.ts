/**
 * 课程派生内容测试：原子记忆锚点（同键组合规则）与推荐码/兼容码 tips 的课程归位规则。
 */
import { describe, expect, it } from 'vitest'
import type { AtomId, LessonDef, SchemeDef } from '../src/types.ts'
import { buildAtomMemory, buildLessonCodeTips } from '../src/lesson.ts'
import { createSchemeEngine } from '../src/scheme.ts'
import { loadEngine, loadLexicon, loadSchemeDef } from './helpers.ts'

const lexicon = loadLexicon()
const engine = loadEngine('xiaohe')

function lesson(id: string, prerequisites: string[], focusAtoms: string[]): LessonDef {
  return {
    id,
    chapterId: 'ch-test',
    kind: 'drill',
    title: id,
    desc: '',
    focusAtoms: focusAtoms as AtomId[],
    blockingAtoms: focusAtoms.filter((atom) => !atom.startsWith('zero:')) as AtomId[],
    nonBlockingAtoms: focusAtoms.filter((atom) => atom.startsWith('zero:')) as AtomId[],
    prerequisites: prerequisites as AtomId[],
    wordPlan: { maxUnfamiliar: 0, lengthRange: [2, 3] },
  }
}

function schemeWithCodes(recommended: Record<string, string>, compatCodes: Record<string, string[]>): SchemeDef {
  return { ...loadSchemeDef('xiaohe'), recommended, compatCodes }
}

describe('buildAtomMemory · 同键组合规则', () => {
  it('声母与同键韵母组合成真实音节', () => {
    const memory = buildAtomMemory(engine, 'initial:zh', lexicon.chars)
    expect(memory?.keys).toEqual(['v'])
    expect(memory?.mnemonic).toBe('ZH + UI = ZHUI（同在 V 键）')
    expect(memory?.anchors.length).toBeGreaterThan(0)
  })

  it('韵母与同键声母组合（修复韵母课只列示例字的错误）', () => {
    const memory = buildAtomMemory(engine, 'final:ao', lexicon.chars)
    expect(memory?.keys).toEqual(['c'])
    expect(memory?.mnemonic).toBe('C + AO = CAO（同在 C 键）')
    expect(memory?.anchors).toContain('草')
  })

  it('没有同键真实组合时不生成助记与示例字', () => {
    const memory = buildAtomMemory(engine, 'final:v', lexicon.chars)
    expect(memory?.keys).toEqual(['v'])
    expect(memory?.mnemonic).toBeUndefined()
    expect(memory?.anchors).toEqual([])
  })

  it('同键声母存在但组合不是真实音节时也不退回示例字', () => {
    const cEngine = createSchemeEngine(loadSchemeDef('c'))
    const memory = buildAtomMemory(cEngine, 'final:uai' as AtomId, lexicon.chars)
    expect(memory?.keys).toEqual(['x'])
    expect(memory?.mnemonic).toBeUndefined()
    expect(memory?.anchors).toEqual([])
  })

  it('零声母只给出整段输入提示，不带锚点', () => {
    const memory = buildAtomMemory(engine, 'zero:a', lexicon.chars)
    expect(memory?.keys).toEqual(['aa'])
    expect(memory?.anchors).toEqual([])
    expect(memory?.mnemonic).toBe('零声母 a = AA，整段输入')
  })
})

describe('buildLessonCodeTips · 课程归位规则', () => {
  it('没有课程范围覆盖的完整音节（全 free）放到第一节正式练习课', () => {
    const intro = { ...lesson('L1.1', [], []), kind: 'intro' as const }
    const lessons = [intro, lesson('L2.1', [], ['initial:zh'])]
    const tips = buildLessonCodeTips(engine, lessons)
    expect([...tips.keys()]).toEqual(['L2.1'])
    expect(tips.get('L2.1')?.join('')).toContain('兼容映射：ju')
    expect(tips.get('L2.1')?.join('')).toContain('JV')
  })

  it('放到范围首次包含完整音节的课程（较晚学到的原子所在课）', () => {
    const scheme = schemeWithCodes({}, { zhang: ['zv'] })
    const customEngine = createSchemeEngine(scheme)
    const lessons = [
      lesson('L1.1', [], ['initial:zh']),
      lesson('L2.1', ['initial:zh'], ['final:ang']),
      lesson('L3.1', ['initial:zh', 'final:ang'], []),
    ]
    const tips = buildLessonCodeTips(customEngine, lessons)
    expect([...tips.keys()]).toEqual(['L2.1'])
    expect(tips.get('L2.1')?.join('')).toContain('兼容映射：zhang')
    expect(tips.get('L2.1')?.join('')).toContain('ZV')
  })

  it('推荐码例外输出推荐码 tips', () => {
    const scheme = schemeWithCodes({ zhang: 'zv' }, {})
    const customEngine = createSchemeEngine(scheme)
    const lessons = [
      lesson('L1.1', [], ['initial:zh']),
      lesson('L2.1', ['initial:zh'], ['final:ang']),
    ]
    const tips = buildLessonCodeTips(customEngine, lessons)
    expect(tips.get('L2.1')?.join('')).toContain('推荐码：zhang')
    expect(tips.get('L2.1')?.join('')).toContain('ZV')
  })

  it('任何课程范围都不包含时回退到第一节课程', () => {
    const scheme = schemeWithCodes({}, { zhang: ['zv'] })
    const customEngine = createSchemeEngine(scheme)
    const lessons = [lesson('L1.1', [], []), lesson('L2.1', [], [])]
    const tips = buildLessonCodeTips(customEngine, lessons)
    expect([...tips.keys()]).toEqual(['L1.1'])
  })
})
