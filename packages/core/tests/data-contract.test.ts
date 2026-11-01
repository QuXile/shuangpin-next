/**
 * 数据契约测试：方案 / 课程 / 统一 Lexicon / public 同步产物。
 * 数据更新后必须通过；Lexicon 与 curriculum 是权威数据。
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CurriculumIndexFile, DataManifest, Final, SchemeDef, WordEntry } from '../src/types.ts'
import { FINALS } from '../src/pinyin.ts'
import {
  dataPath,
  loadCurriculum,
  loadCurriculumIndex,
  loadEngine,
  loadEngineCases,
  loadSchemeIndex,
  readDataJSON,
} from './helpers.ts'

const schemeIndex = loadSchemeIndex()
const curriculumIndex = loadCurriculumIndex()
const validFinals = new Set<string>([...FINALS, 'er'])
const schemeIds = schemeIndex.courseSupported as string[]

describe('方案与课程数据契约', () => {
  it('19 套方案、19 套课程支持，方案均可构造引擎', () => {
    const dirs = readdirSync(join(dataPath(), 'schemes'), { withFileTypes: true }).filter((entry) => entry.isDirectory())
    expect(dirs).toHaveLength(19)
    expect(schemeIds).toHaveLength(19)
    const cases = loadEngineCases()
    expect(Object.keys(cases.schemes)).toHaveLength(19)
    for (const id of schemeIds) {
      const def = readDataJSON<SchemeDef>('schemes', id, 'scheme.json')
      expect(def.name).toBeTruthy()
      const diff = loadEngine(id).diff()
      expect(diff.learnInitials.length + diff.learnFinals.length).toBeGreaterThan(0)
      // 19 套方案都必须完整覆盖 12 个零声母；C 双拼曾在这里漏掉 eng。
      expect(Object.keys(def.zeroInitial).sort(), `${id}: 零声母表不完整`).toEqual(
        ['a', 'ai', 'an', 'ang', 'ao', 'e', 'ei', 'en', 'eng', 'er', 'o', 'ou'],
      )
      for (const [final, codes] of Object.entries(def.zeroInitial)) {
        expect(codes.length, `${id}: 零声母 ${final} 无键位`).toBeGreaterThan(0)
        expect(loadEngine(id).acceptedSequences({ initial: '', final: final as Final, zeroInitial: true }).length).toBeGreaterThan(0)
      }
    }
  })

  it('19 套课程可加载且版本一致（5 套自有 + 14 套通用生成）', () => {
    const indexFile = curriculumIndex as CurriculumIndexFile
    expect(indexFile.schemes).toHaveLength(19)
    const fullIds: string[] = []
    const simplifiedIds: string[] = []
    for (const schemeId of schemeIds) {
      const curriculum = loadCurriculum(schemeId)
      expect(curriculum.lessons.length).toBeGreaterThan(0)
      expect(curriculum.dataVersion).toMatch(/^curriculum-[0-9a-f]{12}$/)
      expect(curriculumIndex.schemes.some((item) => item.schemeId === schemeId)).toBe(true)
      const requested = new Set(curriculum.lessons.flatMap((lesson) => lesson.prerequisites))
      for (const lesson of curriculum.lessons) {
        for (const atom of lesson.focusAtoms) expect(atom).toMatch(/^(initial|final|zero):/)
      }
      expect(requested.size).toBeGreaterThan(0)
      if (curriculum.supportLevel === 'full') fullIds.push(schemeId)
      else if (curriculum.supportLevel === 'simplified') simplifiedIds.push(schemeId)
      else expect.fail(`${schemeId}: 未知 supportLevel ${curriculum.supportLevel}`)
    }
    expect(fullIds.sort()).toEqual(['sougou', 'weiruan', 'xiaohe', 'zhinengabc', 'ziranma'])
    expect(simplifiedIds).toHaveLength(14)
  })

  it('通用生成课程：入门 → 内容原子课 → 期中 → 最终考核的固定骨架', () => {
    for (const schemeId of schemeIds) {
      const curriculum = loadCurriculum(schemeId)
      if (curriculum.supportLevel !== 'simplified') continue
      const chapters = [...curriculum.chapters].sort((a, b) => a.order - b.order)
      expect(chapters[0]?.id, `${schemeId}: 第一章`).toBe('ch-intro')
      expect(chapters[chapters.length - 1]?.id, `${schemeId}: 最终章`).toBe('ch-final')
      expect(curriculum.lessons[0]?.kind, `${schemeId}: 首课`).toBe('intro')
      const last = curriculum.lessons[curriculum.lessons.length - 1]
      expect(last?.kind, `${schemeId}: 最后一课`).toBe('exam')
      expect(last?.title, `${schemeId}: 最终考核`).toBe('通关 · 最终考核')
      // 期中：内容章之间独立成章，只有复习课
      const mid = chapters.find((chapter) => chapter.id === 'ch-mid')
      if (mid) {
        const midLessons = curriculum.lessons.filter((lesson) => lesson.chapterId === 'ch-mid')
        expect(midLessons.length, `${schemeId}: 期中课数`).toBe(2)
        for (const lesson of midLessons) expect(lesson.kind, `${schemeId}: 期中应只有复习课`).toBe('review')
      }
      // 每个学习原子恰好一节课，且不合并
      const drills = curriculum.lessons.filter((lesson) => lesson.kind === 'drill')
      for (const lesson of drills) expect(lesson.focusAtoms, `${schemeId}/${lesson.id}: 每原子一节课`).toHaveLength(1)
      expect(new Set(drills.flatMap((lesson) => lesson.focusAtoms)).size, `${schemeId}: 新课原子重复`).toBe(drills.length)
      // 全拼沿用复习：覆盖 free 原子，prerequisites 为空
      const freeReview = curriculum.lessons.find((lesson) => lesson.title === '复习 · 全拼沿用')
      expect(freeReview, `${schemeId}: 缺全拼复习`).toBeTruthy()
      if (freeReview) {
        expect(freeReview.kind).toBe('review')
        expect(freeReview.prerequisites).toEqual([])
        expect(freeReview.focusAtoms.length).toBeGreaterThan(0)
        // 全拼沿用复习允许少量预习原子：部分方案（如键道3）全部韵母都需要重学。
        expect(freeReview.wordPlan.maxUnfamiliar).toBe(2)
      }
      for (const lesson of curriculum.lessons) {
        if (lesson.title !== '复习 · 全拼沿用') expect(lesson.wordPlan.maxUnfamiliar, `${schemeId}/${lesson.id}`).toBe(0)
      }
    }
  })
})

describe('统一 Lexicon 数据契约', () => {
  it('词/字/音节示例完整，词条字段合法且无重复', () => {
    const lexicon = readDataJSON<{
      dataVersion: string
      words: WordEntry[]
      chars: WordEntry[]
      syllableExamples: Record<string, unknown>
    }>('lexicon', 'lexicon.json')
    expect(lexicon.dataVersion).toMatch(/^lexicon-[0-9a-f]{12}$/)
    expect(lexicon.words.length).toBeGreaterThanOrEqual(20000)
    expect(lexicon.chars.length).toBeGreaterThanOrEqual(3000)
    expect(Object.keys(lexicon.syllableExamples).length).toBeGreaterThanOrEqual(390)
    const seen = new Set<string>()
    for (const word of lexicon.words) {
      expect(seen.has(word.text), `重复词：${word.text}`).toBe(false)
      seen.add(word.text)
      expect(word.length).toBe(word.chars.length)
      expect(word.length).toBeGreaterThanOrEqual(2)
      expect(word.length).toBeLessThanOrEqual(5)
      for (const syllable of word.syllables) {
        expect(validFinals.has(syllable.final)).toBe(true)
        if (syllable.tone !== undefined) expect([1, 2, 3, 4, 5]).toContain(syllable.tone)
      }
    }
  })

  it('public/data 同步 lexicon 且 manifest 版本链一致', () => {
    const publicRoot = join(dataPath(), '..', 'apps', 'web', 'public', 'data')
    const manifest = JSON.parse(readFileSync(join(publicRoot, 'manifest.json'), 'utf8')) as DataManifest
    const lexicon = readDataJSON<{ dataVersion: string }>('lexicon', 'lexicon.json')
    expect(manifest.versions.curriculum).toBe(loadCurriculum('xiaohe').dataVersion)
    expect(manifest.versions.lexicon).toBe(lexicon.dataVersion)
    expect(manifest.defaultScheme).toBe(schemeIndex.defaultScheme)
    expect(manifest.courses).toEqual(schemeIds)
    const source = readFileSync(join(dataPath(), 'lexicon', 'lexicon.json'))
    const synced = readFileSync(join(publicRoot, 'lexicon', 'lexicon.json'))
    expect(Buffer.compare(source, synced), 'lexicon 未同步').toBe(0)
    expect(manifest.files.some((file) => file.file === 'lexicon/lexicon.json')).toBe(true)
    expect(manifest.files.some((file) => file.file.startsWith('pools/'))).toBe(false)
  })
})

