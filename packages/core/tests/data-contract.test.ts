/**
 * 数据契约测试：只校验 `data/` 源数据（干净 clone 必须可跑）。
 * public 产物与 data 的同步一致性由 `scripts/validate-all.mjs` 负责，这里不读 gitignored 文件。
 */
import { describe, expect, it } from 'vitest'
import type { Lexicon, SchemeSummary, WordEntry } from '../src/types.ts'
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

const schemeIndex = loadSchemeIndex()
const schemeIds: string[] = [...schemeIndex.courseSupported]
const summaryById = new Map<string, SchemeSummary>(
  schemeIndex.schemes.map((summary) => [summary.id, summary]),
)
const validFinals = new Set<string>([...FINALS, 'er'])

describe('方案索引（data/schemes/index.json）', () => {
  it('19 套方案索引完整：id 唯一、课程能力声明齐全、defaultScheme 合法', () => {
    expect(schemeIndex.schemes.length).toBeGreaterThanOrEqual(19)
    expect(schemeIds).toHaveLength(schemeIndex.schemes.length)
    expect(new Set(schemeIds).size).toBe(schemeIds.length)
    expect(schemeIndex.schemes.map((summary) => summary.id).sort()).toEqual([...schemeIds].sort())
    for (const id of schemeIds) {
      const summary = summaryById.get(id)
      expect(summary, id).toBeTruthy()
      if (!summary) continue
      expect(summary.name.length).toBeGreaterThan(0)
      expect(['compositional', 'syllable-code', 'hybrid']).toContain(summary.type)
      expect(summary.course?.supportsGuidedCourse).toBe(true)
      expect(typeof summary.course?.courseTier).toBe('string')
      expect(summary.atoms?.total?.total).toBe((summary.atoms?.total?.free ?? 0) + (summary.atoms?.total?.learn ?? 0))
      for (const key of ['initials', 'finals', 'zeroInitial'] as const) {
        const stats = summary.atoms?.[key]
        expect(stats?.total, `${id}.${key}`).toBe((stats?.free ?? 0) + (stats?.learn ?? 0))
      }
    }
    expect(schemeIds).toContain(schemeIndex.defaultScheme)
    expect([...schemeIndex.recommendedOrder].sort()).toEqual([...schemeIds].sort())
  })

  it('每套 scheme.json 可构造引擎，free/learn 统计与索引一致、零声母 12 音节齐全', () => {
    const zeroNames = ZERO_INITIALS.map(String).sort()
    for (const id of schemeIds) {
      const summary = summaryById.get(id)
      expect(summary, id).toBeTruthy()
      if (!summary) continue
      const def = loadSchemeDef(id)
      expect(def.id).toBe(id)
      expect(def.type).toBe(summary.type)
      expect(Object.keys(def.zeroInitial).sort()).toEqual(zeroNames)
      for (const [final, sequence] of Object.entries(def.zeroInitial)) {
        expect(sequence.length, `${id}: zero ${final}`).toBeGreaterThan(0)
      }
      const engine = loadEngine(id)
      const diff = engine.diff()
      const free = engine.freeSets()
      expect(diff.freeInitials.length).toBe(summary.atoms?.initials?.free)
      expect(diff.learnInitials.length).toBe(summary.atoms?.initials?.learn)
      expect(diff.freeFinals.length).toBe(summary.atoms?.finals?.free)
      expect(diff.learnFinals.length).toBe(summary.atoms?.finals?.learn)
      expect(diff.freeZero.length).toBe(summary.atoms?.zeroInitial?.free)
      expect(diff.learnZero.length).toBe(summary.atoms?.zeroInitial?.learn)
      expect([...free.initials]).toEqual(diff.freeInitials)
      expect([...free.finals]).toEqual(diff.freeFinals)
      expect([...free.zero]).toEqual(diff.freeZero)
      // 零声母主键必须可展示
      for (const zero of ZERO_INITIALS) {
        const primary = engine.primarySequence({ initial: '', final: zero, zeroInitial: true })
        expect(primary.length, `${id}: zero ${zero}`).toBeGreaterThan(0)
        expect(engine.keysForAtom(`zero:${zero}` as `zero:${string}`).length).toBe(1)
      }
    }
    const cases = loadEngineCases()
    expect(Object.keys(cases.schemes).sort()).toEqual([...schemeIds].sort())
  })
})

describe('课程（data/schemes/<id>/curriculum.json）', () => {
  it('每套课程可加载：来源标记、版本、章节与课程引用完整', () => {
    for (const id of schemeIds) {
      const curriculum = loadCurriculum(id)
      expect(curriculum.schemeId, id).toBe(id)
      expect(['full', 'simplified']).toContain(curriculum.supportLevel)
      if (curriculum.supportLevel === 'simplified') expect(curriculum.origin, id).toBe('generated')
      else expect(curriculum.origin, id).toBeUndefined()
      expect(curriculum.dataVersion).toMatch(/^curriculum-[0-9a-f]{12}$/)
      expect(curriculum.chapters.length).toBeGreaterThan(0)
      expect(curriculum.lessons.length).toBeGreaterThan(0)
      const chapterIds = new Set(curriculum.chapters.map((chapter) => chapter.id))
      const lessonIds = new Set<string>()
      const allAtoms = new Set<string>()
      for (const lesson of curriculum.lessons) {
        expect(lessonIds.has(lesson.id), `${id}/${lesson.id}: 课程 id 重复`).toBe(false)
        lessonIds.add(lesson.id)
        expect(chapterIds.has(lesson.chapterId), `${id}/${lesson.id}: 未知章节`).toBe(true)
        expect(['intro', 'drill', 'review', 'exam']).toContain(lesson.kind)
        expect(typeof lesson.title).toBe('string')
        expect(lesson.title.length).toBeGreaterThan(0)
        for (const atom of lesson.focusAtoms) {
          expect(atom, `${id}/${lesson.id}: 非法原子 ${atom}`).toMatch(/^(initial|final|zero):/)
          expect(lesson.atomMeta[atom], `${id}/${lesson.id}: 缺 atomMeta ${atom}`).toBeTruthy()
          allAtoms.add(atom)
        }
        const blocking = lesson.focusAtoms.filter((atom) => atom.startsWith('initial:') || atom.startsWith('final:'))
        const nonBlocking = lesson.focusAtoms.filter((atom) => atom.startsWith('zero:'))
        expect(blocking).toEqual(lesson.blockingAtoms)
        expect(nonBlocking).toEqual(lesson.nonBlockingAtoms)
        expect(lesson.wordPlan.lengthRange).toHaveLength(2)
        expect(lesson.wordPlan.maxUnfamiliar).toBeGreaterThanOrEqual(0)
        expect(Array.isArray(lesson.tips)).toBe(true)
        for (const tip of lesson.tips) expect(typeof tip).toBe('string')
        if (lesson.stageMinWords) {
          for (const stage of Object.keys(lesson.stageMinWords)) {
            expect(['single', 'word', 'exam']).toContain(stage)
          }
        }
        if (lesson.kind === 'intro') {
          expect(lesson.passCriteria).toBeUndefined()
        } else {
          const criteria = lesson.passCriteria
          expect(criteria, `${id}/${lesson.id}: 缺 passCriteria`).toBeTruthy()
          if (criteria) {
            expect(criteria.accuracy).toBeGreaterThan(0)
            expect(criteria.accuracy).toBeLessThanOrEqual(1)
            if (criteria.mode) expect(['accuracy', 'speed', 'accuracy-speed']).toContain(criteria.mode)
          }
        }
      }
      // 每个 learn 原子至少出现在一门课里（free 原子可能只出现在 prerequisites）
      for (const atom of allAtoms) expect(atom).not.toMatch(/^rule:/)
    }
  })

})

describe('统一 Lexicon（data/lexicon/lexicon.json）', () => {
  it('词/字/音节示例完整，词条字段合法且无重复', () => {
    const source = readDataJSON<Lexicon>('lexicon', 'lexicon.json')
    expect(source.schemaVersion).toBe(2)
    expect(source.dataVersion).toMatch(/^lexicon-[0-9a-f]{12}$/)
    const lexicon = loadLexicon()
    expect(lexicon.words.length).toBeGreaterThanOrEqual(50000)
    expect(lexicon.chars.length).toBeGreaterThanOrEqual(3000)
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
        if (syllable.tone !== undefined && !validTones.has(syllable.tone)) {
          issues.push(`词 ${word.text} 声调非法：${syllable.tone}`)
        }
      }
    }
    for (const char of lexicon.chars as WordEntry[]) {
      if (char.length !== 1) issues.push(`单字长度非法：${char.text}`)
      if (!validFinals.has(char.syllables[0]?.final ?? '')) issues.push(`单字 ${char.text} 韵母非法`)
    }
    for (const [syllable, example] of Object.entries(lexicon.syllableExamples)) {
      if (example.char.length === 0) issues.push(`音节 ${syllable} 缺示例字`)
      if (example.pinyin !== syllable) issues.push(`音节 ${syllable} 拼音不一致：${example.pinyin}`)
      if (!validFinals.has(example.final)) issues.push(`音节 ${syllable} 韵母非法：${example.final}`)
    }
    expect(issues.slice(0, 10)).toEqual([])
  }, 20000)
})
