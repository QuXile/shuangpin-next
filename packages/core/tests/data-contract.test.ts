/**
 * 数据契约测试：只校验 data/ 源数据与运行时生成结果（干净 clone 必须可跑）。
 * public 产物与 data 的同步一致性由 scripts/validate-all.mjs 负责。
 */
import { describe, expect, it } from 'vitest'
import type { Lexicon, WordEntry } from '../src/types.ts'
import { FINALS, ZERO_INITIALS } from '../src/pinyin.ts'
import {
  loadCurriculum,
  loadEngine,
  loadEngineCases,
  loadLexicon,
  loadSchemeDef,
  loadSchemeIndex,
  readDataJSON,
} from './helpers.ts'

const index = loadSchemeIndex()
const schemeIds = index.schemes.map((item) => item.id)
const validFinals = new Set<string>([...FINALS, 'er'])

describe('方案索引（data/schemes/index.json）', () => {
  it('19 套方案：id / name 唯一，默认方案与推荐顺序完整，定制课程列表合法', () => {
    expect(index.schemes).toHaveLength(19)
    expect(schemeIds).toHaveLength(19)
    expect(new Set(schemeIds).size).toBe(19)
    expect(index.schemes.map((item) => item.id).sort()).toEqual([...schemeIds].sort())
    expect(new Set(index.schemes.map((item) => item.name)).size).toBe(19)
    expect(schemeIds).toContain(index.defaultScheme)
    expect(index.customCourses.length).toBe(5)
    expect(new Set(index.customCourses).size).toBe(5)
    for (const id of index.customCourses) expect(schemeIds).toContain(id)
  })

  it('每套 scheme.json 可构造引擎，零声母 12 音节齐全，判题用例覆盖全部方案', () => {
    const zeroNames = ZERO_INITIALS.map(String).sort()
    for (const id of schemeIds) {
      const def = loadSchemeDef(id)
      expect(def.id).toBe(id)
      expect(Object.keys(def.zeroInitial).sort()).toEqual(zeroNames)
      for (const sequence of Object.values(def.zeroInitial)) expect(sequence.length).toBeGreaterThan(0)
      const engine = loadEngine(id)
      const free = engine.freeSets()
      const diff = engine.diff()
      expect([...free.initials]).toEqual(diff.freeInitials)
      expect([...free.finals]).toEqual(diff.freeFinals)
      expect([...free.zero]).toEqual(diff.freeZero)
      for (const zero of ZERO_INITIALS) {
        expect(engine.keysForAtom(`zero:${zero}`).length).toBe(1)
      }
    }
    const cases = loadEngineCases()
    expect(Object.keys(cases.schemes).sort()).toEqual([...schemeIds].sort())
  })
})

describe('课程', () => {
  it('定制课程源数据只含 chapters / lessons，其余方案运行时生成', () => {
    for (const id of schemeIds) {
      const file = `data/schemes/${id}/curriculum.json`
      const isCustom = index.customCourses.includes(id)
      if (isCustom) {
        const source = readDataJSON<Record<string, unknown>>('schemes', id, 'curriculum.json')
        expect(Object.keys(source).sort()).toEqual(['chapters', 'lessons'])
      } else {
        expect(() => readDataJSON('schemes', id, 'curriculum.json')).toThrow()
      }
      expect(file.length).toBeGreaterThan(0)
    }
  })

  it('每套课程可加载并补齐运行期字段', () => {
    for (const id of schemeIds) {
      const curriculum = loadCurriculum(id)
      expect(curriculum.schemeId).toBe(id)
      expect(curriculum.chapters.length).toBeGreaterThan(0)
      expect(curriculum.lessons.length).toBeGreaterThan(0)
      const chapterIds = new Set(curriculum.chapters.map((chapter) => chapter.id))
      const lessonIds = new Set<string>()
      for (const lesson of curriculum.lessons) {
        expect(lessonIds.has(lesson.id)).toBe(false)
        lessonIds.add(lesson.id)
        expect(chapterIds.has(lesson.chapterId)).toBe(true)
        expect(['intro', 'drill', 'review', 'exam']).toContain(lesson.kind)
        expect(lesson.title).toMatch(/^(入门|声母|零声母|韵母|同键|复习|期中|综合|通关) · /)
        expect(lesson.blockingAtoms).toEqual(
          lesson.focusAtoms.filter((atom) => atom.startsWith('initial:') || atom.startsWith('final:')),
        )
        expect(lesson.nonBlockingAtoms).toEqual(lesson.focusAtoms.filter((atom) => atom.startsWith('zero:')))
        expect(lesson.wordPlan.lengthRange).toHaveLength(2)
        expect('atomMeta' in lesson).toBe(false)
        expect('zeroExamples' in lesson).toBe(false)
        if (lesson.kind === 'intro') {
          expect(lesson.passCriteria).toBeUndefined()
        } else {
          expect(lesson.passCriteria?.accuracy).toBeGreaterThan(0)
        }
      }
      expect(curriculum.lessons.at(-1)?.kind).toBe('exam')
    }
  })
})

describe('统一 Lexicon（data/lexicon/lexicon.json）', () => {
  it('词/字/音节示例完整，词条字段合法且无重复', () => {
    const source = readDataJSON<Lexicon>('lexicon', 'lexicon.json')
    expect(source.schemaVersion).toBe(2)
    const lexicon = loadLexicon()
    expect(lexicon.words.length).toBeGreaterThanOrEqual(50000)
    expect(lexicon.chars.length).toBeGreaterThanOrEqual(3200)
    expect(Object.keys(lexicon.syllableExamples).length).toBeGreaterThanOrEqual(390)

    const validTones = new Set([1, 2, 3, 4, 5])
    const seen = new Set<string>()
    const issues: string[] = []
    for (const word of lexicon.words as WordEntry[]) {
      if (seen.has(word.text)) issues.push(`重复词：${word.text}`)
      seen.add(word.text)
      if (word.length !== word.chars.length) issues.push(`词长与字数不一致：${word.text}`)
      if (word.length < 2 || word.length > 5) issues.push(`词长越界：${word.text}`)
      for (const syllable of word.syllables) {
        if (!validFinals.has(syllable.final)) issues.push(`词 ${word.text} 韵母非法：${syllable.final}`)
        if (syllable.tone !== undefined && !validTones.has(syllable.tone)) issues.push(`词 ${word.text} 声调非法`)
      }
    }
    for (const char of lexicon.chars as WordEntry[]) {
      if (char.length !== 1) issues.push(`单字长度非法：${char.text}`)
      if (!validFinals.has(char.syllables[0]?.final ?? '')) issues.push(`单字 ${char.text} 韵母非法`)
    }
    for (const [syllable, example] of Object.entries(lexicon.syllableExamples)) {
      if (example.char.length === 0) issues.push(`音节 ${syllable} 缺示例字`)
      if (example.pinyin !== syllable) issues.push(`音节 ${syllable} 拼音不一致`)
      if (!validFinals.has(example.final)) issues.push(`音节 ${syllable} 韵母非法`)
    }
    expect(issues.slice(0, 10)).toEqual([])
  }, 20000)
})
