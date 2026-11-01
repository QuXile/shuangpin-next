/**
 * 通用入门课模型校验：直接遍历 data/schemes 下的全部方案。
 * 对应设计文档 tmp/intro-lesson-design.md §8 的验收项：
 * 原子数量 / 全部键位 / 主键唯一 / 条件 section / 示例来自数据 / 不含方案名与专有术语。
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createSchemeEngine } from '@shuangpin/core'
import type { SchemeDef, WordEntry } from '@shuangpin/core'
import {
  buildIntroLessonModel,
  type AtomsSectionBase,
  type CodesSection,
  type IntroLessonModel,
  type KeyAtom,
  type MultiKeySection,
} from '../src/components/intro/introLessonModel.ts'

const schemesDir = fileURLToPath(new URL('../../../data/schemes/', import.meta.url))
const schemeIds = readdirSync(schemesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

interface BuiltModel {
  scheme: SchemeDef
  model: IntroLessonModel
}

function loadScheme(id: string): SchemeDef {
  return JSON.parse(readFileSync(join(schemesDir, id, 'scheme.json'), 'utf8')) as SchemeDef
}

function buildModel(id: string, words: readonly WordEntry[] = []): BuiltModel {
  const scheme = loadScheme(id)
  const engine = createSchemeEngine(scheme)
  return { scheme, model: buildIntroLessonModel(scheme, engine, words) }
}

/** 方案数据键位数组 → 去重、保序、大写（与模型生成口径一致） */
function normalizedKeys(values: readonly string[] | undefined): string[] {
  if (!values) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const sequence = String(value).toUpperCase()
    if (!sequence || seen.has(sequence)) continue
    seen.add(sequence)
    out.push(sequence)
  }
  return out
}

function sectionOf<T extends { kind: string }>(model: IntroLessonModel, kind: T['kind']): T | undefined {
  return model.sections.find((section) => section.kind === kind) as T | undefined
}

function atomTableOf(scheme: SchemeDef, atom: KeyAtom): string[] {
  const name = atom.atomId.slice(atom.kind.length + 1)
  if (atom.kind === 'initial') return normalizedKeys(scheme.initials[name])
  if (atom.kind === 'final') return normalizedKeys(scheme.finals[name])
  return normalizedKeys(scheme.zeroInitial[name])
}

function expectedMultiCount(scheme: SchemeDef): number {
  let count = 0
  for (const table of [scheme.initials, scheme.finals, scheme.zeroInitial]) {
    for (const keys of Object.values(table)) if (normalizedKeys(keys).length > 1) count++
  }
  return count
}

describe('通用入门课模型', () => {
  it('全部方案都能生成；基础 section 齐全，条件 section 与数据一致', () => {
    expect(schemeIds.length).toBeGreaterThanOrEqual(19)
    for (const id of schemeIds) {
      const { scheme, model } = buildModel(id)
      const kinds = model.sections.map((section) => section.kind)
      expect(kinds[0], `${id}: 第一页应是拼音基础`).toBe('pinyin-basics')
      expect(kinds, `${id}: 声母 section`).toContain('initials')
      expect(kinds, `${id}: 韵母 section`).toContain('finals')
      expect(kinds, `${id}: 零声母 section`).toContain('zero-initials')
      expect(kinds[kinds.length - 1], `${id}: 最后一页应是工具说明`).toBe('tool-legend')
      expect(model.schemeName).toBe(scheme.name)

      const hasMulti = expectedMultiCount(scheme) > 0
      expect(kinds.includes('multi-key'), `${id}: 多键 section 条件`).toBe(hasMulti)
      const hasCodes =
        Object.keys(scheme.recommended ?? {}).length > 0 ||
        Object.keys(scheme.compatCodes ?? {}).length > 0
      expect(kinds.includes('codes'), `${id}: 编码 section 条件`).toBe(hasCodes)
    }
  })

  it('声母 / 韵母 / 零声母：数量、全部键位、主键唯一均与方案数据一致', () => {
    for (const id of schemeIds) {
      const { scheme, model } = buildModel(id)
      const sections = [
        sectionOf<AtomsSectionBase & { kind: 'initials' }>(model, 'initials'),
        sectionOf<AtomsSectionBase & { kind: 'finals' }>(model, 'finals'),
        sectionOf<AtomsSectionBase & { kind: 'zero-initials' }>(model, 'zero-initials'),
      ]
      const tables = [scheme.initials, scheme.finals, scheme.zeroInitial]
      sections.forEach((section, index) => {
        expect(section, `${id}: section ${index}`).toBeDefined()
        const table = tables[index]
        if (!section || !table) return
        expect(section.atoms.length, `${id}: 原子数量`).toBe(Object.keys(table).length)
        for (const atom of section.atoms) {
          expect(atom.keys.length, `${id}/${atom.atomId}: 至少一个键`).toBeGreaterThan(0)
          expect(
            atom.keys.filter((key) => key.primary).length,
            `${id}/${atom.atomId}: 恰好一个主键`,
          ).toBe(1)
          expect(atom.keys[0]?.primary, `${id}/${atom.atomId}: 第一条是主键`).toBe(true)
          expect(atom.keys.map((key) => key.sequence), `${id}/${atom.atomId}: 展示全部键`).toEqual(
            atomTableOf(scheme, atom),
          )
          for (const key of atom.keys) {
            expect(key.sequence, `${id}/${atom.atomId}: 键位合法`).toMatch(/^[A-Z;]+$/)
          }
        }
        expect(section.learnCount + section.freeCount, `${id}: free/learn 计数`).toBe(section.atoms.length)
      })

      // 每个多键原子在对应 section 里都展示全部键（不截断）。
      for (const atom of model.sections.flatMap((section) =>
        'atoms' in section ? section.atoms : [],
      )) {
        if (atom.keys.length > 1) {
          expect(atom.keys.map((key) => key.sequence), `${id}/${atom.atomId}: 多键全部展示`).toEqual(
            atomTableOf(scheme, atom),
          )
        }
      }
    }
  })

  it('多键 section：总数与数据一致，示例原子都带全部键', () => {
    for (const id of schemeIds) {
      const { scheme, model } = buildModel(id)
      const multi = sectionOf<MultiKeySection>(model, 'multi-key')
      const expected = expectedMultiCount(scheme)
      if (!multi) {
        expect(expected, `${id}: 无多键 section 时应无多键原子`).toBe(0)
        continue
      }
      expect(multi.totalCount, `${id}: 多键总数`).toBe(expected)
      expect(multi.atoms.length, `${id}: 应有示例`).toBeGreaterThan(0)
      for (const atom of multi.atoms) {
        expect(atom.keys.length, `${id}/${atom.atomId}: 多键示例`).toBeGreaterThan(1)
        expect(atom.keys.map((key) => key.sequence), `${id}/${atom.atomId}: 展示全部键`).toEqual(
          atomTableOf(scheme, atom),
        )
      }
      expect(multi.hasRecommended, `${id}: hasRecommended`).toBe(
        Object.keys(scheme.recommended ?? {}).length > 0,
      )
    }
  })

  it('推荐码 / 兼容编码：有数据就有示例，标答与兼容码都在 accepted 内', () => {
    for (const id of schemeIds) {
      const { scheme, model } = buildModel(id)
      const codes = sectionOf<CodesSection>(model, 'codes')
      const hasRecommended = Object.keys(scheme.recommended ?? {}).length > 0
      const hasCompat = Object.keys(scheme.compatCodes ?? {}).length > 0
      if (!codes) {
        expect(hasRecommended, `${id}: 无编码 section 时不应有推荐码`).toBe(false)
        expect(hasCompat, `${id}: 无编码 section 时不应有兼容编码`).toBe(false)
        continue
      }
      expect(codes.hasRecommended, `${id}: hasRecommended`).toBe(hasRecommended)
      expect(codes.hasCompat, `${id}: hasCompat`).toBe(hasCompat)
      if (hasRecommended) expect(codes.recommended.length, `${id}: 推荐码示例`).toBeGreaterThan(0)
      if (hasCompat) expect(codes.compat.length, `${id}: 兼容编码示例`).toBeGreaterThan(0)
      for (const example of [...codes.recommended, ...codes.compat]) {
        expect(example.accepted, `${id}/${example.syllable}: 标答在 accepted 内`).toContain(example.primary)
        expect(example.accepted, `${id}/${example.syllable}: extra 在 accepted 内`).toContain(example.extra)
        if (example.reason === 'recommended-override') {
          expect(example.mainKeys, `${id}/${example.syllable}: 覆盖示例有主键组合`).not.toBeNull()
          expect(example.primary, `${id}/${example.syllable}: 推荐码与主键组合不同`).not.toBe(
            example.mainKeys,
          )
        }
        if (example.reason === 'recommended-default') {
          expect(example.primary, `${id}/${example.syllable}: 推荐码等于主键组合`).toBe(
            example.mainKeys,
          )
        }
      }
      expect(codes.recommendedTotal, `${id}: 推荐码总数`).toBe(
        Object.keys(scheme.recommended ?? {}).length,
      )
      expect(codes.compatTotal, `${id}: 兼容编码总数`).toBe(
        Object.keys(scheme.compatCodes ?? {}).length,
      )
    }
  })

  it('词表可用时抽取真实音节示例，词表为空时也能退回通用示例', () => {
    const word: WordEntry = {
      text: '摘',
      length: 1,
      freq: 1,
      syllables: [{ text: '摘', pinyin: 'zhai', initial: 'zh', final: 'ai' }],
      chars: ['摘'],
    }
    for (const id of schemeIds) {
      const { model } = buildModel(id, [word])
      const initials = sectionOf<{ kind: 'initials'; example: { syllable: string; primary: string[]; accepted: string[] } | null }>(
        model,
        'initials',
      )
      expect(initials?.example?.syllable, `${id}: 词表示例`).toBe('zhai')
      expect(initials?.example?.accepted, `${id}: 示例标答在 accepted 内`).toContain(
        initials?.example?.primary.join(''),
      )
      const zero = sectionOf<{ kind: 'zero-initials'; example: { primary: string[] } | null }>(
        model,
        'zero-initials',
      )
      expect(zero?.example, `${id}: 零声母示例（词表无零声母时退回数据第一条）`).not.toBeNull()
    }

    const empty = buildModel(schemeIds[0] ?? 'xiaohe')
    const initials = sectionOf<{ kind: 'initials'; example: { syllable: string } | null }>(
      empty.model,
      'initials',
    )
    expect(initials?.example, '空词表时仍有通用示例').not.toBeNull()
  })

  it('模型数据不包含方案名与方案专有术语', () => {
    for (const id of schemeIds) {
      const { scheme, model } = buildModel(id)
      const serialized = JSON.stringify(model.sections)
      expect(serialized.includes('对偶'), `${id}: 不应出现「对偶」`).toBe(false)
      expect(serialized.includes(scheme.name), `${id}: 不应写死方案名`).toBe(false)
    }
  })
})
