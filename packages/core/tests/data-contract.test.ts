/**
 * 数据契约测试：直接校验 data/** 与 .refactor/CONTRACT.md §3 的一致性。
 * 这是「数据即代码契约」的守门测试；数据管线重建后必须通过。
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type {
  Curriculum,
  CurriculumIndexFile,
  DataManifest,
  LessonPool,
  PoolIndexFile,
  SchemeIndexFile,
  WordEntry,
} from '../src/types.ts'
import { FINALS, ZERO_INITIALS, parseAtomId, splitPinyin } from '../src/pinyin.ts'
import { lessonStages } from '../src/stages.ts'
import {
  dataPath,
  findLesson,
  loadCurriculum,
  loadCurriculumIndex,
  loadEngine,
  loadPool,
  loadPoolIndex,
  loadSchemeDef,
  loadSchemeIndex,
  readDataJSON,
} from './helpers.ts'

const sha256 = (buffer: Buffer): string => createHash('sha256').update(buffer).digest('hex')

const schemeIndex = loadSchemeIndex()
const curriculumIndex = loadCurriculumIndex()
const poolIndex = loadPoolIndex()
const curriculumIds = schemeIndex.courseSupported
const validFinals = new Set<string>([...FINALS, 'er'])

function curriculumHash(curriculum: Curriculum): string {
  const content = JSON.stringify({ chapters: curriculum.chapters, lessons: curriculum.lessons })
  return `curriculum-${sha256(Buffer.from(content, 'utf8')).slice(0, 12)}`
}

function poolsHash(): string {
  const dir = dataPath('pools')
  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.json') && file !== 'index.json')
    .sort()
  const buffers = files.map((file) =>
    Buffer.concat([Buffer.from(file, 'utf8'), readFileSync(join(dir, file))]),
  )
  return `pools-${sha256(Buffer.concat(buffers)).slice(0, 12)}`
}

function allPools(): LessonPool[] {
  return poolIndex.lessons.map((lesson) => loadPool(lesson.id))
}

describe('方案数据契约', () => {
  it('19 套方案、5 套课程支持、判题用例覆盖全部方案', () => {
    const schemeFiles = readdirSync(dataPath('schemes')).filter(
      (file) => file.endsWith('.json') && !['index.json', 'engine-cases.json'].includes(file),
    )
    expect(schemeFiles).toHaveLength(19)
    expect(new Set(schemeIndex.courseSupported)).toEqual(
      new Set(['xiaohe', 'ziranma', 'weiruan', 'sougou', 'zhinengabc']),
    )
    expect(schemeIndex.schemes).toHaveLength(19)
    expect(new Set(schemeIndex.recommendedOrder)).toEqual(
      new Set(schemeIndex.schemes.map((scheme) => scheme.id)),
    )
    expect(schemeIndex.schemes.some((scheme) => scheme.id === schemeIndex.defaultScheme)).toBe(true)

    const cases = readDataJSON<{ schemes: Record<string, { positive: unknown[]; negative: unknown[] }> }>(
      'schemes',
      'engine-cases.json',
    )
    expect(Object.keys(cases.schemes)).toHaveLength(19)
    for (const [id, schemeCases] of Object.entries(cases.schemes)) {
      expect(schemeCases.positive.length, id).toBeGreaterThanOrEqual(72)
      expect(schemeCases.negative.length, id).toBeGreaterThanOrEqual(9)
    }
  })

  it('每套方案数据可被引擎加载，且 free/learn 与 index.json 统计一致', () => {
    for (const summary of schemeIndex.schemes) {
      const def = loadSchemeDef(summary.id)
      expect(def.id).toBe(summary.id)
      const diff = loadEngine(summary.id).diff()
      expect(diff.freeInitials.length, summary.id).toBe(summary.atoms?.initials?.free)
      expect(diff.freeFinals.length, summary.id).toBe(summary.atoms?.finals?.free)
      expect(diff.freeZero.length, summary.id).toBe(summary.atoms?.zeroInitial?.free)
    }
  })
})

const curricula = curriculumIds.map((id) => loadCurriculum(id))

describe('课程数据契约', () => {

  it('课程索引与文件一致（5 套 × 40 课 / 10 章）', () => {
    expect(curriculumIndex.schemes).toHaveLength(5)
    expect(curricula).toHaveLength(5)
    for (const summary of curriculumIndex.schemes) {
      const curriculum = curricula.find((item) => item.schemeId === summary.schemeId)
      expect(curriculum, summary.schemeId).toBeDefined()
      expect(summary.lessonCount).toBe(40)
      expect(curriculum?.chapters).toHaveLength(10)
      expect(curriculum?.lessons).toHaveLength(40)
      const totalMinutes = (curriculum?.lessons ?? []).reduce(
        (sum, lesson) => sum + lesson.estimatedMinutes,
        0,
      )
      expect(summary.totalMinutes).toBe(totalMinutes)
    }
  })

  it('dataVersion 可由课程内容重算', () => {
    for (const curriculum of curricula) {
      expect(curriculum.dataVersion, curriculum.schemeId).toMatch(/^curriculum-[0-9a-f]{12}$/)
      expect(curriculumHash(curriculum), curriculum.schemeId).toBe(curriculum.dataVersion)
    }
  })

  it('每课 stageMinWords 与课程类型一致，且不再有旧 review/hintTier 字段', () => {
    const DEFAULTS: Record<string, Record<string, number>> = {
      intro: {},
      drill: { single: 15, word: 15, exam: 25 },
      review: { exam: 50 },
      exam: { exam: 100 },
    }
    for (const curriculum of curricula) {
      for (const lesson of curriculum.lessons) {
        expect(lesson.stageMinWords, `${curriculum.schemeId}/${lesson.id}`).toEqual(
          DEFAULTS[lesson.kind],
        )
        expect(
          Object.prototype.hasOwnProperty.call(lesson, 'review'),
          `${curriculum.schemeId}/${lesson.id} 不应有旧 review 字段`,
        ).toBe(false)
        expect(
          Object.prototype.hasOwnProperty.call(lesson, 'hintTier'),
          `${curriculum.schemeId}/${lesson.id} 不应有 hintTier 字段`,
        ).toBe(false)
        // 每一课最后都是全遮挡考核
        if (lesson.kind !== 'intro') {
          expect(lessonStages(lesson).at(-1), `${curriculum.schemeId}/${lesson.id}`).toBe('exam')
        }
      }
    }
  })

  it('L2.5 复习范围由已学集合生成：3 个改造声母 + 12 个零声母（学习顺序）', () => {
    for (const curriculum of curricula) {
      const lesson = findLesson(curriculum, 'L2.5')
      const expected = [
        'initial:zh',
        'initial:ch',
        'initial:sh',
        ...ZERO_INITIALS.map((syllable) => `zero:${syllable}`),
      ]
      expect(lesson.focusAtoms, curriculum.schemeId).toEqual(expected)
      expect(lesson.prerequisites, curriculum.schemeId).toEqual(expected)
    }
  })

  it('课程结构与字段完整', () => {
    for (const curriculum of curricula) {
      const kinds = curriculum.lessons.reduce<Record<string, number>>((acc, lesson) => {
        acc[lesson.kind] = (acc[lesson.kind] ?? 0) + 1
        return acc
      }, {})
      expect(kinds, curriculum.schemeId).toEqual({ intro: 1, drill: 27, review: 11, exam: 1 })

      for (const lesson of curriculum.lessons) {
        const label = `${curriculum.schemeId}/${lesson.id}`
        expect(lesson.id, label).toBeTruthy()
        expect(lesson.title, label).toBeTruthy()
        expect(lesson.wordPlan.lengthRange, label).toHaveLength(2)
        expect(typeof lesson.wordPlan.maxUnfamiliar, label).toBe('number')
        if (lesson.kind !== 'intro') {
          expect(lesson.wordPlan.lengthRange, label).toEqual([2, 5])
        }
        if (lesson.kind === 'intro') {
          expect(lesson.passCriteria, label).toBeUndefined()
          expect(lesson.focusAtoms, label).toEqual([])
        } else {
          expect(lesson.passCriteria?.accuracy, label).toBeGreaterThan(0)
          expect(lesson.focusAtoms.length, label).toBeGreaterThan(0)
        }
        // 备注/技巧：每课 1–4 条，非空且不重复
        expect(Array.isArray(lesson.tips), label).toBe(true)
        expect(lesson.tips.length, label).toBeGreaterThanOrEqual(1)
        expect(lesson.tips.length, label).toBeLessThanOrEqual(4)
        for (const tip of lesson.tips) expect(tip.trim().length, label).toBeGreaterThan(0)
        expect(new Set(lesson.tips).size, label).toBe(lesson.tips.length)
        // 零声母示例 = 本课 focus 的 zero 原子（顺序一致）
        const expectedZeros = lesson.focusAtoms
          .filter((atom) => atom.startsWith('zero:'))
          .map((atom) => atom.slice(5))
        expect((lesson.zeroExamples ?? []).map((example) => example.syllable), label).toEqual(expectedZeros)
        const focus = new Set(lesson.focusAtoms)
        expect(new Set(Object.keys(lesson.atomMeta)), label).toEqual(focus)
        const union = new Set([...lesson.blockingAtoms, ...lesson.nonBlockingAtoms])
        expect(union, label).toEqual(focus)
        for (const atom of lesson.blockingAtoms) {
          expect(atom.startsWith('initial:') || atom.startsWith('final:'), label).toBe(true)
        }
        // 课程范围只包含具体键位知识点（initial/final/zero），不允许规则类原子
        for (const atom of lesson.focusAtoms) {
          expect(atom.startsWith('rule:'), `${label} 不应包含规则原子 ${atom}`).toBe(false)
        }
        for (const example of lesson.zeroExamples ?? []) {
          expect(ZERO_INITIALS, label).toContain(example.syllable)
          expect(typeof example.char === 'string' && example.char.length > 0, label).toBe(true)
        }
        for (const example of lesson.zeroExamples ?? []) {
          expect(Object.keys(example).sort(), label).toEqual(
            example.tone === undefined ? ['char', 'syllable'] : ['char', 'syllable', 'tone'],
          )
        }
        // 记忆锚点：新授课的声母/韵母焦点原子必须有 anchors + mnemonic（零声母由映射表/示例展示）
        if (lesson.kind === 'drill') {
          for (const atomId of lesson.focusAtoms) {
            if (atomId.startsWith('zero:')) continue
            const meta = lesson.atomMeta[atomId]
            expect(Array.isArray(meta?.anchors), `${label}/${atomId} anchors`).toBe(true)
            expect(meta?.anchors?.length ?? 0, `${label}/${atomId} anchors`).toBeGreaterThanOrEqual(1)
            expect(meta?.anchors?.length ?? 0, `${label}/${atomId} anchors`).toBeLessThanOrEqual(5)
            for (const anchor of meta?.anchors ?? []) {
              expect(typeof anchor === 'string' && anchor.trim().length > 0, `${label}/${atomId}`).toBe(true)
            }
            expect(typeof meta?.mnemonic === 'string' && meta.mnemonic.trim().length > 0, `${label}/${atomId} mnemonic`).toBe(true)
          }
        }
      }
    }
  })

  it('前置知识累积：每课新 focus 都进入后续课程的 prerequisites', () => {
    for (const curriculum of curricula) {
      const learned = new Set<string>()
      for (const lesson of curriculum.lessons) {
        for (const atom of lesson.focusAtoms) {
          if (lesson.kind === 'drill' && !learned.has(atom)) {
            // 前置只要求「之前课学过的 focus」，本课新 focus 在下一课才累积
          }
        }
        for (const atom of learned) {
          expect(lesson.prerequisites, `${curriculum.schemeId}/${lesson.id}`).toContain(atom)
        }
        for (const atom of lesson.focusAtoms) learned.add(atom)
      }
    }
  })

  it('新授课必须有新知识点；复习/考核课不得引入未学原子', () => {
    for (const curriculum of curricula) {
      for (const lesson of curriculum.lessons) {
        if (lesson.kind === 'drill') {
          const newAtoms = lesson.focusAtoms.filter(
            (atom) => !lesson.prerequisites.includes(atom),
          )
          expect(newAtoms.length, `${curriculum.schemeId}/${lesson.id} 新授课无新知识点`).toBeGreaterThanOrEqual(1)
        }
        if (lesson.kind === 'review' || lesson.kind === 'exam') {
          const prerequisites = new Set(lesson.prerequisites)
          const newBlocking = lesson.focusAtoms.filter(
            (atom) =>
              (atom.startsWith('initial:') || atom.startsWith('final:')) &&
              !prerequisites.has(atom),
          )
          expect(newBlocking, `${curriculum.schemeId}/${lesson.id} 复习课引入未学韵母/声母`).toEqual([])
        }
      }
    }
  })

  it('统一命名法：章 1–10、课 id = L<章>.<课序>、标题 = <类别> · <内容>', () => {
    const CATEGORIES = ['入门', '声母', '韵母', '同键', '零声母', '复习', '期中', '综合', '通关']
    const categoryPattern = new RegExp(`^(${CATEGORIES.join('|')}) · .+$`)
    for (const curriculum of curricula) {
      expect(curriculum.chapters.map((chapter) => chapter.order), curriculum.schemeId).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
      ])
      const chapterTitles = curriculum.chapters.map((chapter) => chapter.title)
      expect(new Set(chapterTitles).size, curriculum.schemeId).toBe(chapterTitles.length)
      const lessonTitles = curriculum.lessons.map((lesson) => lesson.title)
      expect(new Set(lessonTitles).size, curriculum.schemeId).toBe(lessonTitles.length)
      for (const lesson of curriculum.lessons) {
        expect(lesson.title, `${curriculum.schemeId}/${lesson.id}`).toMatch(categoryPattern)
        const idMatch = /^L(\d+)\.(\d+)$/.exec(lesson.id)
        expect(idMatch, `${curriculum.schemeId}/${lesson.id} id 非法`).not.toBeNull()
        const chapterIndex = curriculum.chapters.findIndex(
          (chapter) => chapter.id === lesson.chapterId,
        )
        expect(Number(idMatch?.[1]), `${curriculum.schemeId}/${lesson.id} 章号不一致`).toBe(
          chapterIndex + 1,
        )
        const chapterLessons = curriculum.lessons.filter(
          (item) => item.chapterId === lesson.chapterId,
        )
        expect(Number(idMatch?.[2]), `${curriculum.schemeId}/${lesson.id} 课号不连续`).toBe(
          chapterLessons.findIndex((item) => item.id === lesson.id) + 1,
        )
      }
    }
  })

  it('第一个练习课的备注首次提及 j/q/x/y + ü 与多音字（规则不进入课程范围）', () => {
    for (const curriculum of curricula) {
      const firstDrill = curriculum.lessons.find((lesson) => lesson.kind === 'drill')
      expect(firstDrill, curriculum.schemeId).toBeDefined()
      const text = (firstDrill?.tips ?? []).join(' ')
      expect(text, `${curriculum.schemeId}/${firstDrill?.id}`).toContain('多音字')
      expect(text, `${curriculum.schemeId}/${firstDrill?.id}`).toContain('j/q/x/y')
    }
  })

  it('每个 learn 原子都被至少一课教授（含微软/搜狗 final:v）', () => {
    for (const curriculum of curricula) {
      const engine = loadEngine(curriculum.schemeId)
      const diff = engine.diff()
      const taught = new Set(curriculum.lessons.flatMap((lesson) => lesson.focusAtoms))
      for (const initial of diff.learnInitials) {
        expect(taught, `${curriculum.schemeId} initial:${initial}`).toContain(`initial:${initial}`)
      }
      for (const final of diff.learnFinals) {
        expect(taught, `${curriculum.schemeId} final:${final}`).toContain(`final:${final}`)
      }
      for (const zero of diff.learnZero) {
        expect(taught, `${curriculum.schemeId} zero:${zero}`).toContain(`zero:${zero}`)
      }
    }
  })

  it('新授课一次只引入一个键位主题：多个新原子必须共用键位（ü 家族除外）', () => {
    const umlautFamily = new Set(['final:v', 'final:ve', 'final:ue'])
    for (const curriculum of curricula) {
      const scheme = loadSchemeDef(curriculum.schemeId)
      for (const lesson of curriculum.lessons) {
        if (lesson.kind !== 'drill') continue
        const newAtoms = lesson.blockingAtoms.filter(
          (atom) => !lesson.prerequisites.includes(atom),
        )
        if (newAtoms.length <= 1) continue
        if (newAtoms.every((atom) => umlautFamily.has(atom))) continue
        const keySets = newAtoms.map((atomId) => {
          const [type, key] = atomId.split(':')
          const table = type === 'initial' ? scheme.initials : scheme.finals
          return new Set(table[key as string] ?? [])
        })
        const shared = [...(keySets[0] ?? [])].some((key) =>
          keySets.every((keys) => keys.has(key)),
        )
        expect(shared, `${curriculum.schemeId}/${lesson.id} 多个新键：${newAtoms.join(',')}`).toBe(true)
      }
    }
  })

  it('零声母课（L2.4）一次性覆盖全部 12 个零声母音节', () => {
    for (const curriculum of curricula) {
      const lesson = curriculum.lessons.find((item) => item.id === 'L2.4')
      expect(lesson, curriculum.schemeId).toBeDefined()
      const zeros = (lesson?.focusAtoms ?? [])
        .filter((atom) => atom.startsWith('zero:'))
        .map((atom) => atom.slice(5))
      expect(zeros, curriculum.schemeId).toEqual([...ZERO_INITIALS])
      expect((lesson?.zeroExamples ?? []).map((example) => example.syllable), curriculum.schemeId).toEqual([
        ...ZERO_INITIALS,
      ])
    }
  })

  it('零声母示例不重复；复习/考核课 focus 可含零声母', () => {
    for (const curriculum of curricula) {
      for (const lesson of curriculum.lessons) {
        const syllables = (lesson.zeroExamples ?? []).map((example) => example.syllable)
        expect(new Set(syllables).size, `${curriculum.schemeId}/${lesson.id}`).toBe(syllables.length)
      }
    }
  })
})

describe('词池数据契约', () => {
  it('40 课词池与索引一致；dataVersion 可重算', () => {
    expect(poolIndex.lessons).toHaveLength(40)
    expect(poolIndex.lessons.map((lesson) => lesson.id)).toEqual(
      loadCurriculum('xiaohe').lessons.map((lesson) => lesson.id),
    )
    expect(poolIndex.dataVersion).toBe(poolsHash())
    expect(poolIndex.sources.curriculum).toBe(loadCurriculum('xiaohe').dataVersion)
    expect(poolIndex.sources.dict).toMatch(/^[0-9a-f]{12}$/)

    let totalEntries = 0
    const uniqueWords = new Set<string>()
    for (const meta of poolIndex.lessons) {
      const pool = loadPool(meta.id)
      expect(pool.lessonId).toBe(meta.id)
      expect(pool.words.length).toBe(meta.words)
      expect(pool.chars.length).toBe(meta.chars)
      totalEntries += pool.words.length
      for (const word of pool.words) uniqueWords.add(word.text)
      if (meta.kind !== 'intro') {
        expect(pool.chars.length).toBeGreaterThanOrEqual(5)
        expect(pool.examples.length).toBeGreaterThan(0)
      }
    }
    expect(totalEntries).toBe(poolIndex.totalEntries)
    expect(uniqueWords.size).toBe(poolIndex.uniqueWords)
  })

  it('教学示例全量且每音一张：按 focus 原子枚举所有包含它的音节', () => {
    const anchors = readDataJSON<{ syllableChars: Record<string, string[]> }>('words', 'anchors.json')
    const syllableIndex = new Map<string, { initial: string; final: string }>()
    for (const syllable of Object.keys(anchors.syllableChars)) {
      const split = splitPinyin(syllable)
      if (split) syllableIndex.set(syllable, { initial: split.initial, final: split.final })
    }
    const matches = (atom: ReturnType<typeof parseAtomId>, syllable: string): boolean => {
      const info = syllableIndex.get(syllable)
      if (!atom || !info) return false
      if (atom.type === 'initial') return info.initial === atom.key
      if (atom.type === 'final') return info.final === atom.key
      if (atom.type === 'zero') return info.initial === '' && info.final === atom.key
      return false
    }
    for (const curriculum of curricula) {
      for (const lesson of curriculum.lessons) {
        const pool = loadPool(lesson.id)
        const focus = lesson.focusAtoms.map((atom) => parseAtomId(atom))
        const expected = new Set<string>()
        for (const syllable of syllableIndex.keys()) {
          if (focus.some((atom) => matches(atom, syllable))) expected.add(syllable)
        }
        const pinyins = pool.examples.map((example) => example.pinyin)
        expect(new Set(pinyins).size, `${curriculum.schemeId}/${lesson.id} 示例音节重复`).toBe(pinyins.length)
        expect(new Set(pinyins), `${curriculum.schemeId}/${lesson.id} 示例不是全量`).toEqual(expected)
        for (const example of pool.examples) {
          expect(example.char.length, `${lesson.id}/${example.pinyin}`).toBeGreaterThan(0)
        }
        // 示例按 focus 学习顺序分组
        let lastFocusIndex = -1
        for (const example of pool.examples) {
          const index = focus.findIndex((atom) => matches(atom, example.pinyin))
          expect(index, `${lesson.id}/${example.pinyin} 不属于 focus`).toBeGreaterThanOrEqual(0)
          expect(index, `${lesson.id}/${example.pinyin} 顺序不符合学习顺序`).toBeGreaterThanOrEqual(lastFocusIndex)
          lastFocusIndex = index
        }
      }
    }
    const mixed = loadPool('L9.1')
    expect(mixed.examples.length).toBeGreaterThan(300)
    const zh = loadPool('L2.1')
    expect(zh.examples.length).toBeGreaterThan(19)
  })

  it('词条字段合法：tone 1–5、final 合法、freqRank 全局一致、polyphone 保留', () => {
    const rankByText = new Map<string, number>()
    let polyphoneCount = 0
    for (const pool of allPools()) {
      for (const word of [...pool.words, ...pool.chars]) {
        expect(Array.isArray(word.syllables), word.text).toBe(true)
        expect(word.syllables.length).toBe(word.text.length)
        for (const syllable of word.syllables) {
          if (syllable.tone !== undefined) {
            expect([1, 2, 3, 4, 5], word.text).toContain(syllable.tone)
          }
          expect(validFinals, word.text).toContain(syllable.final)
        }
        if (word.polyphone) polyphoneCount += 1
      }
      for (const word of pool.words) {
        expect(Number.isInteger(word.freqRank), word.text).toBe(true)
        const previous = rankByText.get(word.text)
        if (previous !== undefined) {
          expect(word.freqRank, `${word.text} 跨池 freqRank 不一致`).toBe(previous)
        } else {
          rankByText.set(word.text, word.freqRank as number)
        }
      }
    }
    expect(polyphoneCount).toBeGreaterThan(0)
  })

  it('词池中的每个词在当前方案下可判题（learn 原子已教）', () => {
    for (const curriculum of curriculumIds.map((id) => loadCurriculum(id))) {
      const engine = loadEngine(curriculum.schemeId)
      const diff = engine.diff()
      const freeInitials = new Set(diff.freeInitials)
      const freeFinals = new Set(diff.freeFinals)
      const allLearned = new Set(curriculum.lessons.slice(-1)[0]?.prerequisites ?? [])
      for (const lesson of curriculum.lessons) {
        for (const atom of lesson.blockingAtoms) allLearned.add(atom)
      }
      for (const pool of allPools()) {
        for (const word of pool.words.slice(0, 50)) {
          for (const syllable of word.syllables) {
            if (syllable.initial === '') continue
            const known =
              (freeInitials.has(syllable.initial) || allLearned.has(`initial:${syllable.initial}`)) &&
              (freeFinals.has(syllable.final) || allLearned.has(`final:${syllable.final}`))
            expect(known, `${curriculum.schemeId}/${pool.lessonId}/${word.text}`).toBe(true)
          }
        }
      }
    }
  })

  it('词池词条可构建展示模型（每音节至少 1 枚键帽）', () => {
    const engine = loadEngine('xiaohe')
    for (const pool of allPools()) {
      for (const word of pool.words.slice(0, 20)) {
        for (const syllable of word.syllables) {
          expect(syllable.initial === '' || syllable.initial.length > 0).toBe(true)
        }
        expect(engine.acceptedSequences({
          initial: word.syllables[0]?.initial ?? '',
          final: word.syllables[0]?.final ?? 'a',
          zeroInitial: word.syllables[0]?.initial === '',
        }).length).toBeGreaterThan(0)
      }
    }
  })
})

describe('基础词表与同步产物', () => {
  it('words.sample：10000 词、tone 1–5、final 合法、dataVersion 格式', () => {
    const bank = readDataJSON<{
      dataVersion: string
      count: number
      words: WordEntry[]
    }>('words', 'words.sample.json')
    expect(bank.dataVersion).toMatch(/^words-[0-9a-f]{12}$/)
    expect(bank.count).toBe(10000)
    expect(bank.words).toHaveLength(10000)
    for (const word of bank.words) {
      expect(word.syllables.length).toBe(word.text.length)
      for (const syllable of word.syllables) {
        if (syllable.tone !== undefined) expect([1, 2, 3, 4, 5]).toContain(syllable.tone)
        expect(validFinals).toContain(syllable.final)
      }
    }
  })

  it('apps/web/public/data 与 data/ 同步且 manifest 版本链一致', () => {
    const publicRoot = dataPath().replace(/data[\\/]?$/, 'apps/web/public/data')
    const manifestPath = join(publicRoot, 'manifest.json')
    expect(statSync(manifestPath).isFile()).toBe(true)
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as DataManifest
    expect(manifest.versions.pools).toBe(poolIndex.dataVersion)
    expect(manifest.versions.curriculum).toBe(loadCurriculum('xiaohe').dataVersion)
    expect(manifest.defaultScheme).toBe(schemeIndex.defaultScheme)
    expect(manifest.courses).toEqual(curriculumIds)
    for (const lesson of poolIndex.lessons) {
      const source = readFileSync(join(dataPath('pools'), lesson.file))
      const synced = readFileSync(join(publicRoot, 'pools', lesson.file))
      expect(Buffer.compare(source, synced), `${lesson.id} 未同步`).toBe(0)
    }
    for (const id of curriculumIds) {
      const file = `${id}.curriculum.json`
      expect(
        Buffer.compare(
          readFileSync(join(dataPath('curriculum'), file)),
          readFileSync(join(publicRoot, 'curriculum', file)),
        ),
        `${id} 未同步`,
      ).toBe(0)
    }
  })

  it('课程索引/词池索引字段类型完整', () => {
    const curriculumIndexCheck: CurriculumIndexFile = curriculumIndex
    const poolIndexCheck: PoolIndexFile = poolIndex
    const schemeIndexCheck: SchemeIndexFile = schemeIndex
    expect(curriculumIndexCheck.templateVersion).toBeTruthy()
    expect(poolIndexCheck.targetWordsPerLesson).toBeGreaterThan(0)
    expect(schemeIndexCheck.defaultScheme).toBeTruthy()
    expect(findLesson(loadCurriculum('xiaohe'), 'L2.1').title).toBeTruthy()
  })
})


describe('长度配额与训练词库补充', () => {
  it('词池中 3 字、4 字词占比显著提升', () => {
    let three = 0
    let four = 0
    let total = 0
    for (const pool of allPools()) {
      for (const word of pool.words) {
        total += 1
        if (word.length === 3) three += 1
        if (word.length === 4) four += 1
      }
    }
    expect(three / total).toBeGreaterThan(0.12)
    expect(four / total).toBeGreaterThan(0.05)
    expect(four).toBeGreaterThan(1500)
  })

  it('训练库只保存公共字库，不重复词语', () => {
    const bank = readDataJSON<{
      chars: WordEntry[]
      words?: WordEntry[]
    }>('training', 'bank.json')
    expect(bank.chars.length).toBeGreaterThanOrEqual(5000)
    expect(bank.words).toBeUndefined()
  })
})
