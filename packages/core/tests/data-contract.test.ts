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
  it('19 套方案、5 套课程支持，方案均可构造引擎', () => {
    const dirs = readdirSync(join(dataPath(), 'schemes'), { withFileTypes: true }).filter((entry) => entry.isDirectory())
    expect(dirs).toHaveLength(19)
    expect(schemeIds).toHaveLength(5)
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

  it('5 套课程可加载且版本一致', () => {
    const indexFile = curriculumIndex as CurriculumIndexFile
    expect(indexFile.schemes).toHaveLength(5)
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
    expect(lexicon.chars.length).toBeGreaterThanOrEqual(4000)
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

