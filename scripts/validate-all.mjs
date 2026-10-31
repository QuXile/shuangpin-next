#!/usr/bin/env node
/**
 * 一键数据校验（纯 Node + core TS 原生导入）。
 *
 * 覆盖：
 *  1) 方案数据：19 套方案 + 判题用例规模；
 *  2) 课程：5 套 × 40 课 / 10 章、schema 收敛、命名法、cumulative、learn 原子全覆盖（engine.diff 唯一来源）、
 *     dataVersion = curriculum-<hash>；
 *  3) 词表：8000 词、tone ∈ 1..5、pinyin = initial+final、content/dataVersion 重算；
 *  4) 词池：40 课、tone/freqRank/polyphone、索引 sources/版本重算、全局 freqRank 一致性；
 *  5) 版本链：curriculum → pools.sources；words/pools/curriculum 重算 hash；
 *  6) public/data 与 manifest：逐字节一致、版本一致；
 *  7) 文档结构：新文档必存在、旧文档已删除、README 导航覆盖 docs 下全部 Markdown、
 *     README 与 docs 下 Markdown 的图片/本地链接可解析、截图清单无未引用项。
 *
 * 用法：node scripts/validate-all.mjs   （退出码 0/1）
 */
import fs from 'node:fs'
import path from 'node:path'
import { enumerateExampleSyllables } from './lib/pool-examples.mjs'
import {
  createSchemeEngine,
  FINALS,
  INITIALS,
  ZERO_INITIALS,
} from '../packages/core/src/index.ts'
import {
  CURRICULUM_DIR,
  CURRICULUM_INDEX_FILE,
  DATA_DIR,
  PACKAGES_DIR,
  POOLS_DIR,
  POOLS_INDEX_FILE,
  PUBLIC_DATA_DIR,
  RAW_DICT_FILE,
  ROOT,
  SCHEME_DIR,
  SCHEME_INDEX_FILE,
  TEMPLATE_VERSION,
  TRAINING_BANK_FILE,
  TRAINING_SCHEMA_VERSION,
  WORDS_FILE,
  curriculumVersionOf,
  exists,
  poolFileNames,
  poolsVersionOf,
  readJSON,
  sha256,
  trainingVersionOf,
  wordsContentSha256,
  wordsVersionOf,
} from './lib/data-contract.mjs'

const failures = []
const notes = []
const ok = (condition, message) => {
  if (!condition) failures.push(message)
}

const FINAL_SET = new Set(FINALS)
const INITIAL_SET = new Set(INITIALS)
const ZERO_SET = new Set(ZERO_INITIALS)
const CANONICAL_ZERO = new Set(ZERO_INITIALS)

function readDataJSON(relPath) {
  const file = path.join(ROOT, relPath)
  if (!fs.existsSync(file)) {
    failures.push(`缺少文件：${relPath}`)
    return null
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    failures.push(`${relPath} 解析失败：${error.message}`)
    return null
  }
}

function walkFiles(dir, base = '') {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...walkFiles(path.join(dir, entry.name), rel))
    else out.push(rel)
  }
  return out
}

// ── 1. 方案 ──────────────────────────────────────────────────
function validateSchemes() {
  const schemeIndex = readDataJSON('data/schemes/index.json')
  ok(!!schemeIndex, '缺少 data/schemes/index.json')
  if (!schemeIndex) return
  const schemeFiles = fs
    .readdirSync(SCHEME_DIR)
    .filter((name) => name.endsWith('.json') && !['index.json', 'engine-cases.json'].includes(name))
  ok(schemeFiles.length === 19, `方案文件数 = ${schemeFiles.length}，期望 19`)
  ok((schemeIndex.courseSupported ?? []).length === 5, `courseSupported 数量 = ${(schemeIndex.courseSupported ?? []).length}，期望 5`)

  const engines = new Map()
  for (const name of schemeFiles) {
    const scheme = readDataJSON(`data/schemes/${name}`)
    if (!scheme) continue
    try {
      const engine = createSchemeEngine(scheme)
      const diff = engine.diff()
      engines.set(scheme.id, { engine, diff })
      ok(Array.isArray(diff.learnInitials) && Array.isArray(diff.learnFinals), `${scheme.id}: diff() 缺 learn 列表`)
    } catch (error) {
      failures.push(`${scheme.id}: createSchemeEngine 失败：${error.message}`)
    }
  }
  ok(engines.size === 19, `可加载方案 = ${engines.size}，期望 19`)

  const engineCases = readDataJSON('data/schemes/engine-cases.json')
  if (engineCases) {
    const cases = Object.values(engineCases.schemes ?? {})
    const positive = cases.reduce((sum, item) => sum + (item.positive?.length ?? 0), 0)
    const negative = cases.reduce((sum, item) => sum + (item.negative?.length ?? 0), 0)
    ok(cases.length === 19, `判题用例覆盖方案 = ${cases.length}，期望 19`)
    ok(positive >= 1500 && negative >= 150, `判题用例不足：正例 ${positive} / 反例 ${negative}`)
    notes.push(`方案：19 套；判题用例正例 ${positive} / 反例 ${negative}`)
  }
  return { schemeIndex, engines }
}

// ── 2. 课程 ──────────────────────────────────────────────────
const LESSON_FORBIDDEN = [
  'sameKeyNotes', 'maxHintRate', 'maxAvgKeyMs', 'noGate', 'evidence',
  'targetCount', 'minFreeRatio', 'zeroRulePractice', 'focusRule', 'review', 'hintTier',
]

function validateCurriculum(schemeIndex, engines) {
  const index = readDataJSON('data/curriculum/index.json')
  ok(!!index, '缺少 data/curriculum/index.json')
  if (!index) return null
  ok(index.templateVersion === TEMPLATE_VERSION, `curriculum index templateVersion = ${index.templateVersion}`)
  const supported = schemeIndex?.courseSupported ?? []
  ok((index.schemes ?? []).length === 5, `课程索引 = ${(index.schemes ?? []).length}，期望 5`)
  const curricula = new Map()
  const totalMinutesByFile = new Map()

  for (const schemeId of supported) {
    const curriculum = readDataJSON(`data/curriculum/${schemeId}.curriculum.json`)
    if (!curriculum) continue
    curricula.set(schemeId, curriculum)
    const fileMeta = (index.schemes ?? []).find((item) => item.schemeId === schemeId)
    ok(!!fileMeta, `课程索引缺 ${schemeId}`)
    if (fileMeta) {
      ok(fileMeta.lessonCount === curriculum.lessons.length, `${schemeId}: 索引 lessonCount 不一致`)
      ok(fileMeta.file === `${schemeId}.curriculum.json`, `${schemeId}: 索引 file 不一致`)
    }
    ok(curriculum.templateVersion === TEMPLATE_VERSION, `${schemeId}: templateVersion = ${curriculum.templateVersion}`)
    ok(curriculum.dataVersion === curriculumVersionOf(curriculum.chapters, curriculum.lessons), `${schemeId}: dataVersion 与内容不匹配`)
    ok('nodes' in curriculum === false, `${schemeId}: 不应包含 nodes`)
    ok('warnings' in curriculum === false, `${schemeId}: 不应包含 warnings`)
    ok('evidence' in curriculum === false, `${schemeId}: 不应包含 evidence`)
    ok('validation' in curriculum === false, `${schemeId}: 不应包含 validation`)
    ok(curriculum.lessons.length === 40, `${schemeId}: 课程节点 = ${curriculum.lessons.length}，期望 40`)
    ok(curriculum.chapters.length === 10, `${schemeId}: 章节数 = ${curriculum.chapters.length}，期望 10`)
    const kinds = curriculum.lessons.reduce((acc, lesson) => {
      acc[lesson.kind] = (acc[lesson.kind] ?? 0) + 1
      return acc
    }, {})
    ok(
      kinds.intro === 1 && kinds.drill === 27 && kinds.review === 11 && kinds.exam === 1,
      `${schemeId}: 课程类型计数 = ${JSON.stringify(kinds)}，期望 intro1/drill27/review11/exam1`,
    )
    const orderedChapters = [...curriculum.chapters].sort((a, b) => a.order - b.order)
    orderedChapters.forEach((chapter, index) => {
      ok(chapter.order === index + 1, `${schemeId}/${chapter.id}: 章 order = ${chapter.order}，期望 ${index + 1}`)
      ok(Boolean(chapter.title && chapter.subtitle), `${schemeId}/${chapter.id}: 缺标题/副标题`)
    })
    const orderById = new Map(curriculum.chapters.map((chapter) => [chapter.id, chapter.order]))
    const titleSeen = new Set()
    const chapterLessonCounts = new Map()

    const chapterIds = new Set(curriculum.chapters.map((chapter) => chapter.id))
    const ids = new Set()
    let learnedAtoms = new Set()
    const focusUnion = new Set()
    for (const lesson of curriculum.lessons) {
      const idMatch = /^L(\d+)\.(\d+)$/.exec(lesson.id)
      ok(Boolean(idMatch), `${schemeId}/${lesson.id}: 课 id 不符合 L<章>.<课序>`)
      if (idMatch) {
        ok(Number(idMatch[1]) === orderById.get(lesson.chapterId), `${schemeId}/${lesson.id}: id 章号与 chapterId 不一致`)
        const expectedSeq = (chapterLessonCounts.get(lesson.chapterId) ?? 0) + 1
        ok(Number(idMatch[2]) === expectedSeq, `${schemeId}/${lesson.id}: 章内课号不连续`)
      }
      chapterLessonCounts.set(lesson.chapterId, (chapterLessonCounts.get(lesson.chapterId) ?? 0) + 1)
      const titleMatch = /^(入门|声母|零声母|韵母|同键|复习|期中|综合|通关) · (.+)$/.exec(lesson.title ?? '')
      ok(Boolean(titleMatch), `${schemeId}/${lesson.id}: 标题不符合「类别 · 内容」`)
      ok(!titleSeen.has(lesson.title), `${schemeId}/${lesson.id}: 标题重复`)
      titleSeen.add(lesson.title)
      ok(!ids.has(lesson.id), `${schemeId}/${lesson.id}: 课程 id 重复`)
      ids.add(lesson.id)
      ok(chapterIds.has(lesson.chapterId), `${schemeId}/${lesson.id}: 未知章节`)
      for (const field of LESSON_FORBIDDEN) {
        ok(!(field in lesson), `${schemeId}/${lesson.id}: 不应包含字段 ${field}`)
      }
      for (const atomId of lesson.focusAtoms) {
        focusUnion.add(atomId)
        ok(!atomId.startsWith('rule:'), `${schemeId}/${lesson.id}: 不允许的 rule 原子 ${atomId}`)
        ok(Boolean(lesson.atomMeta?.[atomId]), `${schemeId}/${lesson.id}: 原子 ${atomId} 缺 atomMeta`)
      }
      const blocking = lesson.focusAtoms.filter((atom) => atom.startsWith('initial:') || atom.startsWith('final:'))
      const nonBlocking = lesson.focusAtoms.filter((atom) => atom.startsWith('zero:'))
      ok(
        JSON.stringify(blocking) === JSON.stringify(lesson.blockingAtoms),
        `${schemeId}/${lesson.id}: blockingAtoms 与 focusAtoms 不一致`,
      )
      ok(
        JSON.stringify(nonBlocking) === JSON.stringify(lesson.nonBlockingAtoms),
        `${schemeId}/${lesson.id}: nonBlockingAtoms 与 focusAtoms 不一致`,
      )
      ok(
        lesson.prerequisites.length === learnedAtoms.size &&
          lesson.prerequisites.every((atom) => learnedAtoms.has(atom)),
        `${schemeId}/${lesson.id}: prerequisites 不是此前 focus 的累计集合`,
      )
      if (lesson.kind === 'intro') {
        ok(lesson.passCriteria === undefined, `${schemeId}/${lesson.id}: 入门课不应写 passCriteria`)
      } else {
        const criteria = lesson.passCriteria
        ok(!!criteria, `${schemeId}/${lesson.id}: 缺 passCriteria`)
        if (criteria) {
          ok(criteria.accuracy > 0 && criteria.accuracy <= 1, `${schemeId}/${lesson.id}: accuracy 非法`)
          ok(
            criteria.maxHintRate === undefined && criteria.maxAvgKeyMs === undefined && criteria.noGate === undefined,
            `${schemeId}/${lesson.id}: passCriteria 含已删除字段`,
          )
          if (criteria.starCpm) {
            const [one, two, three] = criteria.starCpm
            ok(one === criteria.minCpm && one < two && two < three, `${schemeId}/${lesson.id}: starCpm 非法`)
          }
          if (criteria.mode === 'speed' || criteria.mode === 'accuracy-speed') {
            ok(criteria.minCpm !== undefined, `${schemeId}/${lesson.id}: 速度模式缺 minCpm`)
          }
        }
      }
      ok(
        JSON.stringify(Object.keys(lesson.wordPlan ?? {}).sort()) === JSON.stringify(['lengthRange', 'maxUnfamiliar']),
        `${schemeId}/${lesson.id}: wordPlan 字段非法`,
      )
      ok(Array.isArray(lesson.tips) && lesson.tips.length >= 1 && lesson.tips.length <= 4, `${schemeId}/${lesson.id}: tips 数量非法`)
      if (Array.isArray(lesson.tips)) {
        ok(new Set(lesson.tips).size === lesson.tips.length, `${schemeId}/${lesson.id}: tips 有重复`)
        ok(lesson.tips.every((tip) => typeof tip === 'string' && tip.trim().length > 0), `${schemeId}/${lesson.id}: tips 含空值`)
      }
      const expectedZeros = lesson.focusAtoms.filter((atom) => atom.startsWith('zero:')).map((atom) => atom.slice(5))
      ok(
        JSON.stringify((lesson.zeroExamples ?? []).map((example) => example.syllable)) === JSON.stringify(expectedZeros),
        `${schemeId}/${lesson.id}: zeroExamples 与 focus zero 原子不一致`,
      )
      ok(
        (lesson.zeroExamples ?? []).every((example) => typeof example.char === 'string' && example.char.trim().length > 0),
        `${schemeId}/${lesson.id}: zeroExamples.char 为空`,
      )
      ok(
        (lesson.zeroExamples ?? []).every((example) => !('keys' in example) && !('rule' in example)),
        `${schemeId}/${lesson.id}: zeroExamples 不应包含 keys/rule 字段`,
      )
      // 提示档位只由阶段决定（single/word/exam），课程数据不得再有 hintTier
      ok(!('hintTier' in lesson), `${schemeId}/${lesson.id}: 不应再有 hintTier 字段`)
      const titleCategory = titleMatch?.[1] ?? ''
      if (['期中', '综合', '通关'].includes(titleCategory)) {
        const expectedFocus = [...lesson.prerequisites]
        ok(
          JSON.stringify(expectedFocus) === JSON.stringify(lesson.focusAtoms),
          `${schemeId}/${lesson.id}: cumulative focus 应等于此前已学知识点`,
        )
        ok(
          !lesson.blockingAtoms.some((atom) => !lesson.prerequisites.includes(atom)),
          `${schemeId}/${lesson.id}: cumulative 不应引入新阻塞原子`,
        )
      }
      for (const atomId of lesson.focusAtoms) {
        const meta = lesson.atomMeta?.[atomId]
        if (meta?.anchors !== undefined) {
          ok(Array.isArray(meta.anchors) && meta.anchors.length >= 1 && meta.anchors.length <= 5, `${schemeId}/${lesson.id}/${atomId}: anchors 非法`)
          if (Array.isArray(meta.anchors)) ok(meta.anchors.every((item) => typeof item === 'string' && item.trim()), `${schemeId}/${lesson.id}/${atomId}: anchors 含空值`)
        }
        if (meta?.mnemonic !== undefined) ok(typeof meta.mnemonic === 'string' && meta.mnemonic.trim().length > 0, `${schemeId}/${lesson.id}/${atomId}: mnemonic 为空`)
        // 锚点区块只展示 initial/final 原子；zero 由 L2.4 全表/示例/tips 表达。
        if (lesson.kind === 'drill' && (atomId.startsWith('initial:') || atomId.startsWith('final:'))) {
          ok(Array.isArray(meta?.anchors) && meta.anchors.length > 0, `${schemeId}/${lesson.id}/${atomId}: drill 缺 anchors`)
          ok(typeof meta?.mnemonic === 'string' && meta.mnemonic.trim().length > 0, `${schemeId}/${lesson.id}/${atomId}: drill 缺 mnemonic`)
        }
      }
      if (lesson.kind === 'drill') {
        const prior = new Set(lesson.prerequisites)
        const newAtoms = lesson.blockingAtoms.filter((atom) => !prior.has(atom))
        if (newAtoms.length > 1) {
          const umlautFamily = new Set(['final:v', 'final:ve', 'final:ue'])
          const allUmlaut = newAtoms.every((atom) => umlautFamily.has(atom))
          const scheme = readDataJSON(`data/schemes/${schemeId}.json`)
          const keySets = newAtoms.map((atomId) => {
            const [type, key] = atomId.split(':')
            const table = type === 'initial' ? scheme?.initials : scheme?.finals
            return new Set((table?.[key] ?? []).map((item) => String(item).toLowerCase()))
          })
          const shared = keySets.length > 0 && [...keySets[0]].some((key) => keySets.every((set) => set.has(key)))
          ok(allUmlaut || shared, `${schemeId}/${lesson.id}: 多个新键 ${newAtoms.join(',')} 不共用键位且不属 ü 家族`)
        }
      }
      // stageMinWords：drill 三段；review/exam 单段；每课最后阶段必须 exam
      const expectedMinWords = (() => {
        if (lesson.kind === 'intro') return {}
        if (lesson.kind === 'exam') return { exam: 100 }
        if (lesson.kind === 'review') return { exam: 50 }
        return { single: 15, word: 15, exam: 25 }
      })()
      ok(
        JSON.stringify(lesson.stageMinWords) === JSON.stringify(expectedMinWords),
        `${schemeId}/${lesson.id}: stageMinWords = ${JSON.stringify(lesson.stageMinWords)}，期望 ${JSON.stringify(expectedMinWords)}`,
      )
      if (lesson.stageMinWords) {
        const stages = Object.keys(lesson.stageMinWords)
        if (lesson.kind !== 'intro') ok(stages[stages.length - 1] === 'exam', `${schemeId}/${lesson.id}: 最后阶段必须为 exam（全遮挡考核）`)
        if (lesson.kind === 'drill') ok(JSON.stringify(stages) === JSON.stringify(['single', 'word', 'exam']), `${schemeId}/${lesson.id}: drill 阶段应为 single → word → exam`)
        if (lesson.kind === 'review' || lesson.kind === 'exam') ok(JSON.stringify(stages) === JSON.stringify(['exam']), `${schemeId}/${lesson.id}: ${lesson.kind} 阶段应只有 exam`)
        for (const [stage, value] of Object.entries(lesson.stageMinWords)) {
          ok(['single', 'word', 'exam'].includes(stage), `${schemeId}/${lesson.id}: stageMinWords 未知阶段 ${stage}`)
          ok(Number.isInteger(value) && value > 0, `${schemeId}/${lesson.id}: stageMinWords.${stage} 非法`)
        }
      }
      for (const atom of lesson.focusAtoms) learnedAtoms.add(atom)
    }

    // learn 原子全覆盖（engine.diff 为唯一来源）
    const engineInfo = engines.get(schemeId)
    if (engineInfo) {
      const { diff } = engineInfo
      const learnAtoms = [
        ...diff.learnInitials.map((initial) => `initial:${initial}`),
        ...diff.learnFinals.map((final) => `final:${final}`),
        ...diff.learnZero.map((zero) => `zero:${zero}`),
      ]
      for (const atomId of learnAtoms) {
        ok(focusUnion.has(atomId), `${schemeId}: learn 原子 ${atomId} 未出现在任何课程 focusAtoms 中`)
        const firstIndex = curriculum.lessons.findIndex((lesson) => lesson.focusAtoms.includes(atomId))
        if (firstIndex >= 0) {
          for (let index = firstIndex + 1; index < curriculum.lessons.length; index += 1) {
            ok(
              curriculum.lessons[index].prerequisites.includes(atomId),
              `${schemeId}: ${atomId} 未进入 ${curriculum.lessons[index].id} 的 prerequisites`,
            )
          }
        }
      }
      // 专项课程：firstPractice / u-ü 复习 / üe·ve 同键课 / rule 范围
      const zhLesson = curriculum.lessons.find((lesson) => lesson.title === '声母 · zh')
      ok(
        Boolean(zhLesson && zhLesson.tips.some((tip) => tip.includes('多音字') && tip.includes('j/q/x/y'))),
        `${schemeId}: 首课（声母 · zh）tips 必须含「多音字」与「j/q/x/y」`,
      )
      // 零声母累计复习（按数据特征定位）：复习课 && focus==prerequisites && 覆盖 12 zero
      const zeroReview = curriculum.lessons.find(
        (lesson) =>
          lesson.kind === 'review' &&
          (lesson.title ?? '').startsWith('复习 ·') &&
          JSON.stringify(lesson.focusAtoms) === JSON.stringify(lesson.prerequisites) &&
          lesson.focusAtoms.filter((atom) => atom.startsWith('zero:')).length === ZERO_INITIALS.length,
      )
      ok(Boolean(zeroReview), `${schemeId}: 缺少覆盖 12 零声母的累计复习课`)
      if (zeroReview) {
        const zeroAtoms = zeroReview.focusAtoms.filter((atom) => atom.startsWith('zero:'))
        const expectedZeros = zeroReview.prerequisites.filter((atom) => atom.startsWith('zero:'))
        ok(
          JSON.stringify(zeroAtoms) === JSON.stringify(expectedZeros),
          `${schemeId}: 零声母累计复习顺序应等于 prerequisites 的学习顺序`,
        )
      }
      const uUmlautLesson = curriculum.lessons.find((lesson) => lesson.reviewFamily === 'u-ü')
      ok(Boolean(uUmlautLesson), `${schemeId}: 缺少 reviewFamily=u-ü 的复习课`)
      if (uUmlautLesson) {
        for (const atom of ['final:ui', 'final:un', 'final:ue', 'final:ve']) {
          ok(uUmlautLesson.focusAtoms.includes(atom), `${schemeId}: u-ü 复习缺 ${atom}`)
        }
      }
      const umlautLesson = curriculum.lessons.find(
        (lesson) => lesson.focusAtoms.includes('final:ue') && lesson.focusAtoms.includes('final:ve'),
      )
      ok(Boolean(umlautLesson), `${schemeId}: 缺少 üe/ve 同键课`)
      if (umlautLesson) {
        ok(umlautLesson.title === '韵母 · ü / üe / ve', `${schemeId}: ü 家族课标题应为「韵母 · ü / üe / ve」`)
        if (diff.learnFinals.includes('v')) {
          ok(umlautLesson.focusAtoms.includes('final:v'), `${schemeId}: üe/ve 同键课未覆盖 final:v`)
        }
      }
      // 零声母全表课（按数据特征定位）：focus 恰为 12 个 zero 原子且集合 = ZERO_INITIALS
      const ruleAtoms = curriculum.lessons.flatMap((lesson) =>
        lesson.focusAtoms.filter((atom) => atom.startsWith('rule:')),
      )
      ok(ruleAtoms.length === 0, `${schemeId}: focus 中不得出现 rule 原子：${ruleAtoms.join(',')}`)
      const zeroTableLesson = curriculum.lessons.find(
        (lesson) =>
          lesson.focusAtoms.length === ZERO_INITIALS.length &&
          lesson.focusAtoms.every((atom) => atom.startsWith('zero:')),
      )
      ok(Boolean(zeroTableLesson), `${schemeId}: 缺少零声母全表课（focus 恰为 12 个 zero）`)
      if (zeroTableLesson) {
        const zeroAtoms = zeroTableLesson.focusAtoms
        ok(zeroTableLesson.title === '零声母 · 12 个音节', `${schemeId}: 零声母全表课标题应为「零声母 · 12 个音节」`)
        ok(
          new Set(zeroAtoms.map((atom) => atom.slice(5))).size === ZERO_INITIALS.length &&
            ZERO_INITIALS.every((zero) => zeroAtoms.includes(`zero:${zero}`)),
          `${schemeId}: 零声母全表课 zero 集合应等于 ZERO_INITIALS`,
        )
        ok(zeroTableLesson.blockingAtoms.length === 0, `${schemeId}: 零声母全表课不应有阻塞原子`)
        ok(zeroTableLesson.zeroExamples.length === ZERO_INITIALS.length, `${schemeId}: 零声母全表课 zeroExamples 应为 12 条`)
      }
      const reviewNodes = curriculum.lessons.filter(
        (lesson) => lesson.kind === 'review' || lesson.kind === 'exam',
      ).length
      ok(reviewNodes === 12, `${schemeId}: 复习/考核节点 = ${reviewNodes}，期望 12`)
    }
    const totalMinutes = curriculum.lessons.reduce((sum, lesson) => sum + (lesson.estimatedMinutes ?? 0), 0)
    ok(totalMinutes === 326, `${schemeId}: 总时长 = ${totalMinutes} 分钟，期望 326`)
    if (fileMeta) ok(fileMeta.totalMinutes === totalMinutes, `${schemeId}: 索引 totalMinutes 与课程不一致`)
    totalMinutesByFile.set(schemeId, totalMinutes)
    notes.push(`课程：${schemeId} 40 课 / ${totalMinutes} 分钟 / ${curriculum.dataVersion}`)
  }
  ok(curricula.size === 5, `课程 = ${curricula.size} 套，期望 5`)
  const xiaohe = curricula.get('xiaohe')
  return { curricula, xiaohe, index, totalMinutesByFile }
}

// ── 3. 词表 ──────────────────────────────────────────────────
function validateWords() {
  const wordsDoc = readDataJSON('data/words/words.sample.json')
  const policy = readDataJSON('data/words/word-policy.json')
  const expectedWordCount = policy?.wordBank?.wordCount ?? 10000
  ok(!!wordsDoc, '缺少 data/words/words.sample.json')
  ok(!exists(path.join(DATA_DIR, 'words/stats.json')), 'data/words/stats.json 应已删除')
  ok(!exists(path.join(DATA_DIR, 'words/build-report.json')), 'data/words/build-report.json 应已删除')
  if (!wordsDoc) return null
  ok(wordsDoc.count === expectedWordCount, `词表 count = ${wordsDoc.count}，期望 ${expectedWordCount}`)
  ok(wordsDoc.words?.length === expectedWordCount, `词表 words = ${wordsDoc.words?.length}，期望 ${expectedWordCount}`)
  const contentSha256 = wordsContentSha256(wordsDoc.words ?? [])
  ok(wordsDoc.contentSha256 === contentSha256, 'words contentSha256 与内容不匹配')
  const expectedVersion = wordsVersionOf({
    sourceSha: wordsDoc.source?.sha256,
    pinyinVersion: wordsDoc.source?.pinyin?.version,
    filters: wordsDoc.filters,
    count: wordsDoc.words?.length,
    contentSha256,
  })
  ok(wordsDoc.dataVersion === expectedVersion, `words dataVersion = ${wordsDoc.dataVersion}，期望 ${expectedVersion}`)
  if (fs.existsSync(RAW_DICT_FILE)) {
    const rawSha = sha256(fs.readFileSync(RAW_DICT_FILE))
    ok(rawSha === wordsDoc.source?.sha256, 'words.source.sha256 与 data/raw/jieba-dict.txt 不一致')
  } else {
    notes.push('注意：data/raw/jieba-dict.txt 不存在，跳过 source sha 校验')
  }

  let tone0 = 0
  let badSyllable = 0
  let erCount = 0
  for (const word of wordsDoc.words) {
    ok(Array.isArray(word.syllables) && word.syllables.length === word.length, `${word.text}: 音节数/词长不一致`)
    ok(Array.isArray(word.chars) && word.chars.join('') === word.text, `${word.text}: chars 与 text 不一致`)
    for (const syllable of word.syllables) {
      if (syllable.tone === 0 || !(syllable.tone >= 1 && syllable.tone <= 5)) tone0 += 1
      if (syllable.pinyin !== `${syllable.initial}${syllable.final}`) badSyllable += 1
      if (syllable.initial === '') {
        if (!CANONICAL_ZERO.has(syllable.final)) badSyllable += 1
      } else if (!INITIAL_SET.has(syllable.initial)) badSyllable += 1
      if (!FINAL_SET.has(syllable.final) && syllable.final !== 'er') badSyllable += 1
      if (syllable.final === 'er') erCount += 1
      if (syllable.initial !== '' && syllable.final === 'er') badSyllable += 1
    }
    ok(word.polyphone === undefined || typeof word.polyphone === 'boolean', `${word.text}: polyphone 非布尔`)
  }
  ok(tone0 === 0, `词表 tone 非法音节 = ${tone0}，期望 0`)
  ok(badSyllable === 0, `词表音节字段异常 = ${badSyllable}`)
  ok(erCount > 0, '词表缺少 er 零声母音节')
  ok(wordFreqRankMonotonic(wordsDoc.words), '词表 freqRank 不单调')
  notes.push(`词表：${wordsDoc.count} 词 / ${wordsDoc.dataVersion} / content=${wordsDoc.contentSha256.slice(0, 12)}`)
  return wordsDoc
}

function wordFreqRankMonotonic(words) {
  let previous = 0
  for (const word of words) {
    if (!Number.isInteger(word.freqRank) || word.freqRank <= previous) return false
    previous = word.freqRank
  }
  return true
}

// ── 4. 词池 ──────────────────────────────────────────────────
/** 读取 jieba 原始词性 / 单字排名（只读，用于词池质量校验）。 */
function loadJiebaFacts() {
  const posByWord = new Map()
  const charRank = new Map()
  if (!fs.existsSync(RAW_DICT_FILE)) return { posByWord, charRank }
  const lines = fs.readFileSync(RAW_DICT_FILE, 'utf8').split('\n')
  const singles = []
  for (const line of lines) {
    const parts = line.split(' ')
    if (parts.length !== 3) continue
    const [text, freq, pos] = parts
    if (/^[\u4e00-\u9fff]{2,4}$/.test(text)) posByWord.set(text, pos)
    if (/^[\u4e00-\u9fff]$/.test(text)) singles.push({ text, freq: Number(freq) })
  }
  singles.sort((a, b) => b.freq - a.freq)
  singles.forEach((item, index) => charRank.set(item.text, index + 1))
  return { posByWord, charRank }
}

/**
 * 由 lesson.focusAtoms 推导期望的示例音节序列：
 * 统一使用 scripts/lib/pool-examples.mjs，与 build-pools 共用同一规则。
 */
function expectedExampleSyllables(lesson, anchors) {
  return enumerateExampleSyllables(lesson, anchors?.syllableChars ?? {}).map((item) => item.syllable)
}

function validatePools(xiaoheCurriculum, wordsDoc, engines, anchors) {
  const poolsIndex = readDataJSON('data/pools/index.json')
  ok(!!poolsIndex, '缺少 data/pools/index.json')
  if (!poolsIndex) return null
  ok((poolsIndex.lessons ?? []).length === 40, `词池课程数 = ${(poolsIndex.lessons ?? []).length}，期望 40`)
  const files = poolFileNames()
  ok(files.length === 40, `词池文件数 = ${files.length}，期望 40`)
  const expectedVersion = poolsVersionOf(POOLS_DIR, files)
  ok(poolsIndex.dataVersion === expectedVersion, `pools dataVersion = ${poolsIndex.dataVersion}，期望 ${expectedVersion}`)
  ok(
    poolsIndex.sources?.curriculum === xiaoheCurriculum?.dataVersion,
    `pools sources.curriculum = ${poolsIndex.sources?.curriculum}，期望 ${xiaoheCurriculum?.dataVersion}`,
  )
  if (fs.existsSync(RAW_DICT_FILE)) {
    const dictSha = sha256(fs.readFileSync(RAW_DICT_FILE)).slice(0, 12)
    ok(poolsIndex.sources?.dict === dictSha, `pools sources.dict = ${poolsIndex.sources?.dict}，期望 ${dictSha}`)
  }
  const policy = readDataJSON('data/words/word-policy.json')
  ok(!!policy, '缺少 data/words/word-policy.json')
  const poolPolicy = policy?.pools ?? {}
  const examplePolicy = policy?.examples ?? {}
  ok(Number.isInteger(poolPolicy.targetWordsPerLesson), 'word-policy.pools.targetWordsPerLesson 缺失')
  ok(Number.isInteger(poolPolicy.minWordsPerLesson), 'word-policy.pools.minWordsPerLesson 缺失')
  ok(Array.isArray(poolPolicy.blockedPosTags) && poolPolicy.blockedPosTags.length > 0, 'word-policy.pools.blockedPosTags 缺失')
  ok(Number.isInteger(examplePolicy.maxRepresentativeCharRank), 'word-policy.examples.maxRepresentativeCharRank 缺失')
  ok(Number.isInteger(examplePolicy.rareCharRank), 'word-policy.examples.rareCharRank 缺失')
  ok(typeof examplePolicy.maxRareRatio === 'number', 'word-policy.examples.maxRareRatio 缺失')
  ok(
    poolsIndex.targetWordsPerLesson === poolPolicy.targetWordsPerLesson,
    `targetWordsPerLesson = ${poolsIndex.targetWordsPerLesson}，policy=${poolPolicy.targetWordsPerLesson}`,
  )
  ok(
    poolsIndex.minWordsPerLesson === poolPolicy.minWordsPerLesson,
    `minWordsPerLesson = ${poolsIndex.minWordsPerLesson}，policy=${poolPolicy.minWordsPerLesson}`,
  )
  if (wordsDoc) ok(wordsDoc.count === policy?.wordBank?.wordCount, `词表 count 与 word-policy.wordCount 不一致`)
  const { posByWord, charRank } = loadJiebaFacts()
  const blockedPos = new Set(poolPolicy.blockedPosTags ?? [])
  const charReadings = new Map()
  for (const word of wordsDoc?.words ?? []) {
    for (const syllable of word.syllables ?? []) {
      const readings = charReadings.get(syllable.text) ?? new Set()
      readings.add(syllable.pinyin)
      charReadings.set(syllable.text, readings)
    }
  }
  let exampleTotal = 0
  let exampleRare = 0
  let exampleMissing = 0
  let exampleRareAvoidable = 0
  let poolCharTotal = 0
  let poolCharPolyphone = 0
  let blockedPosHits = 0

  const sampleRank = new Map()
  if (wordsDoc) {
    wordsDoc.words.forEach((word) => sampleRank.set(word.text, { rank: word.freqRank, word }))
  }
  let totalEntries = 0
  let tone0 = 0
  let badEntries = 0
  let badRank = 0
  const uniqueTexts = new Set()
  const learnedAtomPoolHits = new Map()

  const curriculumLessons = xiaoheCurriculum?.lessons ?? []
  for (const lesson of poolsIndex.lessons ?? []) {
    const indexLesson = curriculumLessons.find((item) => item.id === lesson.id)
    ok(!!indexLesson, `词池课程 ${lesson.id} 不在课程中`)
    if (indexLesson) {
      ok(indexLesson.kind === lesson.kind, `${lesson.id}: 词池 kind 与课程不一致`)
      ok(indexLesson.title === lesson.title, `${lesson.id}: 词池 title 与课程不一致`)
    }
    const pool = readDataJSON(`data/pools/${lesson.file}`)
    if (!pool) continue
    ok(pool.lessonId === lesson.id, `${lesson.id}: 池 lessonId 与索引不一致`)
    ok(Array.isArray(pool.words) && pool.words.length === lesson.words, `${lesson.id}: 索引词数与文件不一致`)
    ok((pool.words?.length ?? 0) >= (poolPolicy?.minWordsPerLesson ?? 300), `${lesson.id}: 词池低于 policy 最小值`)
    if (lesson.kind !== 'intro') ok((pool.chars?.length ?? 0) >= (poolPolicy?.singleChar?.minPerLesson ?? 5), `${lesson.id}: 单字池低于 policy 最小值`)
    ok(Array.isArray(pool.examples), `${lesson.id}: examples 非数组`)
    if (Array.isArray(pool.examples) && indexLesson) {
      const expectedExamples = expectedExampleSyllables(indexLesson, anchors)
      const actualPinyins = pool.examples.map((example) => example.pinyin)
      ok(
        JSON.stringify(expectedExamples) === JSON.stringify(actualPinyins),
        `${lesson.id}: examples 与 focus 推导的音节序列不一致（${pool.examples.length} / 期望 ${expectedExamples.length}）`,
      )
      ok(new Set(actualPinyins).size === actualPinyins.length, `${lesson.id}: examples pinyin 有重复`)
      ok(pool.examples.every((example) => typeof example.char === 'string' && example.char.trim().length > 0), `${lesson.id}: examples.char 为空`)
      ok(pool.examples.every((example) => typeof example.pinyinTone === 'string' && example.pinyinTone.length > 0), `${lesson.id}: examples.pinyinTone 为空`)
      if (/^(综合|通关)/.test(indexLesson.title ?? '')) {
        ok(pool.examples.length > 300, `${lesson.id}: 综合/通关课 examples = ${pool.examples.length}，期望 >300`)
      }
      for (const example of pool.examples) {
        exampleTotal += 1
        const rank = charRank.get(example.char)
        const rareRank = examplePolicy.rareCharRank ?? 4000
        const candidates = anchors?.syllableChars?.[example.pinyin] ?? []
        const hasCommonCandidate = candidates.some((char) => (charRank.get(char) ?? Infinity) <= rareRank)
        if (rank === undefined) {
          exampleMissing += 1
          if (hasCommonCandidate) exampleRareAvoidable += 1
        } else if (rank > rareRank) {
          exampleRare += 1
          if (hasCommonCandidate) exampleRareAvoidable += 1
        }
      }
    }
    ok((lesson.chars ?? 0) === (pool.chars?.length ?? 0), `${lesson.id}: 索引 chars 数不一致`)
    for (const char of pool.chars ?? []) {
      poolCharTotal += 1
      if ((charReadings.get(char.text)?.size ?? 0) > 1) poolCharPolyphone += 1
    }

    const seen = new Set()
    for (const word of pool.words ?? []) {
      totalEntries += 1
      uniqueTexts.add(word.text)
      ok(!seen.has(word.text), `${lesson.id}: 词池内重复词 ${word.text}`)
      seen.add(word.text)
      if (word.length !== word.text.length || word.chars?.join('') !== word.text) badEntries += 1
      if (!Number.isInteger(word.freqRank) || word.freqRank < 1) badRank += 1
      for (const syllable of word.syllables ?? []) {
        if (!(syllable.tone >= 1 && syllable.tone <= 5)) tone0 += 1
        if (syllable.pinyin !== `${syllable.initial}${syllable.final}`) badEntries += 1
        if (syllable.initial === '') {
          if (!CANONICAL_ZERO.has(syllable.final)) badEntries += 1
        } else if (!INITIAL_SET.has(syllable.initial)) badEntries += 1
        if (!FINAL_SET.has(syllable.final) && syllable.final !== 'er') badEntries += 1
        const atomId =
          syllable.initial === ''
            ? `zero:${syllable.final}`
            : `final:${syllable.final}`
        learnedAtomPoolHits.set(atomId, (learnedAtomPoolHits.get(atomId) ?? 0) + 1)
        if (syllable.initial !== '') {
          const initialAtom = `initial:${syllable.initial}`
          learnedAtomPoolHits.set(initialAtom, (learnedAtomPoolHits.get(initialAtom) ?? 0) + 1)
        }
      }
      ok(word.polyphone === undefined || typeof word.polyphone === 'boolean', `${lesson.id}/${word.text}: polyphone 非布尔`)
      const pos = posByWord.get(word.text)
      if (lesson.kind !== 'intro' && pos && blockedPos.has(pos)) blockedPosHits += 1
      // 全局 freqRank 一致性（top8000 内可直接核对）
      const sampled = sampleRank.get(word.text)
      if (sampled) {
        ok(sampled.rank === word.freqRank, `${lesson.id}/${word.text}: freqRank ${word.freqRank} 与词表 ${sampled.rank} 不一致`)
      }
    }
  }
  ok(totalEntries === poolsIndex.totalEntries, `pools totalEntries = ${poolsIndex.totalEntries}，实际 ${totalEntries}`)
  ok(uniqueTexts.size === poolsIndex.uniqueWords, `pools uniqueWords = ${poolsIndex.uniqueWords}，实际 ${uniqueTexts.size}`)
  ok(tone0 === 0, `词池 tone 非法音节 = ${tone0}，期望 0`)
  ok(badEntries === 0, `词池异常词条 = ${badEntries}`)
  ok(badRank === 0, `词池 freqRank 非法 = ${badRank}`)
  // 词库质量指标
  const duplicateRate = totalEntries > 0 ? (totalEntries - uniqueTexts.size) / totalEntries : 0
  ok(
    duplicateRate <= (poolPolicy.maxCrossPoolDuplicateRate ?? 0.2),
    `跨课词池重复率 = ${(duplicateRate * 100).toFixed(1)}%，期望 ≤ ${((poolPolicy.maxCrossPoolDuplicateRate ?? 0.2) * 100).toFixed(0)}%`,
  )
  const polyphoneRatio = poolCharTotal > 0 ? poolCharPolyphone / poolCharTotal : 0
  ok(
    polyphoneRatio <= (poolPolicy.singleChar?.maxPolyphoneRatio ?? 0.1),
    `单字池多音字占比 = ${(polyphoneRatio * 100).toFixed(1)}%，期望 ≤ ${((poolPolicy.singleChar?.maxPolyphoneRatio ?? 0.1) * 100).toFixed(0)}%`,
  )
  const rareExampleRatio = exampleTotal > 0 ? (exampleRare + exampleMissing) / exampleTotal : 0
  ok(
    rareExampleRatio <= (examplePolicy.maxRareRatio ?? 0.03),
    `生僻示例代表字占比 = ${(rareExampleRatio * 100).toFixed(2)}%（rare=${exampleRare}, missing=${exampleMissing}），期望 ≤ ${((examplePolicy.maxRareRatio ?? 0.03) * 100).toFixed(0)}%`,
  )
  ok(
    exampleRareAvoidable === 0,
    `可避免的生僻示例 = ${exampleRareAvoidable}，期望 0（有常用候选时必须选常用字）`,
  )
  ok(blockedPosHits === 0, `词池含被屏蔽词性（${[...blockedPos].join('/')}）的条目 = ${blockedPosHits}，期望 0`)
  const introLesson = curriculumLessons.find((lesson) => lesson.kind === 'intro')
  const introPool = (poolsIndex.lessons ?? []).find((lesson) => lesson.id === introLesson?.id)
  if (introPool) {
    const introDoc = readDataJSON(`data/pools/${introPool.file}`)
    const introTexts = new Set((introDoc?.words ?? []).map((word) => word.text))
    for (const seed of policy?.intro?.seedWords ?? []) {
      ok(introTexts.has(seed), `入门课试打词 ${seed} 不在词池中`)
    }
  }
  notes.push(
    `词池：40 课 / ${totalEntries} 条 / ${uniqueTexts.size} 唯一词 / 跨课重复 ${(duplicateRate * 100).toFixed(1)}% / 单字多音 ${(polyphoneRatio * 100).toFixed(1)}% / 生僻示例 ${(rareExampleRatio * 100).toFixed(2)}%（可避免 ${exampleRareAvoidable}） / ${poolsIndex.dataVersion}`,
  )
  // 每个 learn 原子至少在一份词池中有可用词（否则该键无法练到）
  for (const [schemeId, engineInfo] of engines ?? []) {
    if (!xiaoheCurriculum) break
    const { diff } = engineInfo
    // 只有 initial/final 必须能在词池中练到；零声母由规则课 zeroExamples/单字覆盖，
    // 稀有零声母音节（o/eng）不要求出现在整词池中。
    const blockingLearnAtoms = [
      ...diff.learnInitials.map((initial) => `initial:${initial}`),
      ...diff.learnFinals.map((final) => `final:${final}`),
    ]
    for (const atomId of blockingLearnAtoms) {
      ok((learnedAtomPoolHits.get(atomId) ?? 0) > 0, `${schemeId}: learn 原子 ${atomId} 在所有词池中无可用词`)
    }
  }

  return { poolsIndex, uniqueTexts, atomHits: learnedAtomPoolHits }
}

// ── 5. 版本链 / public 同步 / 文档入口 ──────────────────────
function validatePublicSync(versions) {
  const publicManifestFile = path.join(PUBLIC_DATA_DIR, 'manifest.json')
  ok(exists(publicManifestFile), '缺少 apps/web/public/data/manifest.json（请先运行 pnpm data:sync）')
  if (!exists(publicManifestFile)) return
  const manifest = JSON.parse(fs.readFileSync(publicManifestFile, 'utf8'))
  ok(manifest.versions?.curriculum === versions.curriculum, `manifest.versions.curriculum = ${manifest.versions?.curriculum}`)
  ok(manifest.versions?.pools === versions.pools, `manifest.versions.pools = ${manifest.versions?.pools}`)
  ok(manifest.versions?.words === versions.words, `manifest.versions.words = ${manifest.versions?.words}`)
  ok(manifest.versions?.training === versions.training, `manifest.versions.training = ${manifest.versions?.training}`)
  ok((manifest.courses ?? []).length === 5, `manifest.courses = ${(manifest.courses ?? []).length}，期望 5`)
  const schemeIndex = readDataJSON('data/schemes/index.json')
  ok(manifest.defaultScheme === schemeIndex?.defaultScheme, `manifest.defaultScheme = ${manifest.defaultScheme}`)

  const publicFiles = new Set(walkFiles(PUBLIC_DATA_DIR).filter((file) => file !== 'manifest.json'))
  const manifestFiles = new Set((manifest.files ?? []).map((file) => file.file))
  ok(publicFiles.size === manifestFiles.size, `public 文件数 = ${publicFiles.size}，manifest 记录 ${manifestFiles.size}`)
  for (const file of manifestFiles) {
    ok(publicFiles.has(file), `manifest 记录的文件不存在：${file}`)
    const publicFile = path.join(PUBLIC_DATA_DIR, file)
    const sourceFile = path.join(DATA_DIR, file)
    if (!fs.existsSync(sourceFile)) {
      failures.push(`public 文件在 data/ 中无来源：${file}`)
      continue
    }
    if (fs.existsSync(publicFile)) {
      const same = fs.readFileSync(publicFile).equals(fs.readFileSync(sourceFile))
      ok(same, `public 与 data 不一致：${file}`)
    }
  }
  for (const file of publicFiles) {
    if (!manifestFiles.has(file)) failures.push(`public 存在未登记文件：${file}`)
  }
  const packageIndex = readDataJSON('data/packages/index.json')
  ok(!!packageIndex, '缺少 data/packages/index.json')
  if (packageIndex) {
    const manifests = packageIndex.packages ?? []
    ok(manifests.length === 19, `方案包数 = ${manifests.length}，期望 19`)
    ok((packageIndex.courseSupported ?? []).length === 5, `方案包课程能力数 = ${(packageIndex.courseSupported ?? []).length}，期望 5`)
    for (const item of manifests) {
      const dir = path.join(PACKAGES_DIR, item.id)
      ok(fs.existsSync(path.join(dir, 'scheme.json')), `方案包缺 scheme：${item.id}`)
      ok(fs.existsSync(path.join(dir, 'manifest.json')), `方案包缺 manifest：${item.id}`)
      if (item.capabilities?.course) {
        ok(fs.existsSync(path.join(dir, 'curriculum.json')), `课程方案包缺 curriculum：${item.id}`)
        ok(item.curriculum?.profile === 'standard-40', `课程方案 profile 异常：${item.id}`)
      } else {
        ok(item.curriculum === null, `practice-only 包不应带 curriculum：${item.id}`)
      }
    }
  }
  ok((manifest.files ?? []).length >= 55, `manifest.files = ${(manifest.files ?? []).length}，至少应包含基础 55 个文件`)
  notes.push(`同步：public/data ${manifestFiles.size} 文件与 data/ 逐字节一致；versions=${JSON.stringify(manifest.versions)}`)
}

function validateAnchors() {
  const anchors = readDataJSON('data/words/anchors.json')
  ok(!!anchors, '缺少 data/words/anchors.json（请先运行 pnpm data:words）')
  if (!anchors) return
  for (const field of ['syllableChars', 'finalChars', 'initialChars']) {
    ok(anchors[field] && typeof anchors[field] === 'object', `anchors.${field} 缺失`)
  }
  const checkMap = (name, map, expectedKeys) => {
    if (!map) return
    ok(Object.keys(map).length > 0, `anchors.${name} 为空`)
    if (expectedKeys !== undefined) {
      ok(Object.keys(map).length === expectedKeys, `anchors.${name} 键数 = ${Object.keys(map).length}，期望 ${expectedKeys}`)
    }
    for (const [key, list] of Object.entries(map)) {
      ok(Array.isArray(list) && list.length > 0 && list.length <= (readDataJSON('data/words/word-policy.json')?.wordBank?.anchorsCharsLimit ?? 8), `anchors.${name}.${key} 非法`)
      if (Array.isArray(list)) ok(list.every((item) => typeof item === 'string' && item.trim()), `anchors.${name}.${key} 含空值`)
    }
  }
  checkMap('syllableChars', anchors.syllableChars)
  checkMap('finalChars', anchors.finalChars, 34)
  checkMap('initialChars', anchors.initialChars, 23)
  ok(!('atomWords' in anchors), 'anchors.json 不应包含已删除的 atomWords 字段')
  // 音节补丁文件（显式数据，替代 build.mjs 里 zhei/eng 之类逻辑特判）
  const patchesDoc = readDataJSON('data/words/syllable-patches.json')
  ok(!!patchesDoc, '缺少 data/words/syllable-patches.json')
  ok(Array.isArray(patchesDoc?.patches), 'syllable-patches.json 缺 patches 数组')
  if (Array.isArray(patchesDoc?.patches)) {
    for (const patch of patchesDoc.patches) {
      ok(typeof patch.syllable === 'string' && patch.syllable.length > 0, '音节补丁缺 syllable')
      ok(typeof patch.char === 'string' && patch.char.trim().length > 0, `音节补丁 ${patch.syllable} 缺 char`)
      ok(typeof patch.reason === 'string' && patch.reason.trim().length > 0, `音节补丁 ${patch.syllable} 缺 reason`)
      const chars = anchors.syllableChars?.[patch.syllable] ?? []
      ok(chars.includes(patch.char), `anchors.syllableChars.${patch.syllable} 未包含补丁字 ${patch.char}`)
    }
  }
  notes.push(`anchors：字段 3 项 / 音节 ${Object.keys(anchors.syllableChars ?? {}).length} / 韵母 34 / 声母 23 / 音节补丁 ${patchesDoc?.patches?.length ?? 0}`)
}

// ── 训练库 ───────────────────────────────────────────────
function validateTrainingBank(anchors) {
  const trainingPolicy = readDataJSON('data/words/word-policy.json')
  const trainingCommonRank = trainingPolicy?.training?.commonCharRank ?? 5000
  const { charRank } = loadJiebaFacts()
  const bank = readDataJSON('data/training/bank.json')
  ok(!!bank, '缺少 data/training/bank.json（请运行 node scripts/training/build-training-bank.mjs）')
  if (!bank) return null
  ok(bank.schemaVersion === TRAINING_SCHEMA_VERSION, `training.schemaVersion = ${bank.schemaVersion}，期望 ${TRAINING_SCHEMA_VERSION}`)
  ok(/^training-[0-9a-f]{12}$/.test(bank.dataVersion ?? ''), `training.dataVersion = ${bank.dataVersion}`)
  ok(bank.dataVersion === trainingVersionOf(bank), `training.dataVersion 不可重算：${bank.dataVersion}`)
  ok(typeof bank.generatedAt === 'string' && !Number.isNaN(Date.parse(bank.generatedAt)), 'training.generatedAt 非法')
  ok(typeof bank.description === 'string' && bank.description.trim().length > 0, 'training.description 为空')

  ok(Array.isArray(bank.chars), 'training.chars 非数组')
  ok(bank.chars.length >= 1000 && bank.chars.length <= 6000, `training.chars = ${bank.chars.length}，期望 1000–6000`)
  const charSeen = new Set()
  const syllableCoverage = new Set()
  let fallbackChars = 0
  for (const entry of bank.chars ?? []) {
    ok(typeof entry.text === 'string' && entry.text.length === 1, `训练字 ${entry.text}: 应为单字`)
    ok(!charSeen.has(entry.text), `训练字重复：${entry.text}`)
    charSeen.add(entry.text)
    if (entry.length !== 1) failures.push(`训练字 ${entry.text}: length 应为 1`)
    if (JSON.stringify(entry.chars) !== JSON.stringify([entry.text])) failures.push(`训练字 ${entry.text}: chars 字段非法`)
    if (!Number.isInteger(entry.freq) || entry.freq < 0) failures.push(`训练字 ${entry.text}: freq 非法`)
    if (!Number.isInteger(entry.minCharRank) || entry.minCharRank < 1) failures.push(`训练字 ${entry.text}: minCharRank 非法`)
    if (!Number.isInteger(entry.freqRank) || entry.freqRank < 1) failures.push(`训练字 ${entry.text}: freqRank 非法`)
    ok(Array.isArray(entry.syllables) && entry.syllables.length === 1, `训练字 ${entry.text}: syllables 应为 1 项`)
    const syllable = entry.syllables?.[0]
    if (!syllable) continue
    if (syllable.text !== entry.text) failures.push(`训练字 ${entry.text}: syllable.text 不一致`)
    if (syllable.pinyin !== `${syllable.initial}${syllable.final}`) failures.push(`训练字 ${entry.text}: pinyin 与 initial+final 不一致`)
    if (syllable.initial !== '' && !INITIAL_SET.has(syllable.initial)) failures.push(`训练字 ${entry.text}: initial 非法 ${syllable.initial}`)
    if (!FINAL_SET.has(syllable.final) && syllable.final !== 'er') failures.push(`训练字 ${entry.text}: final 非法 ${syllable.final}`)
    if (!(syllable.tone >= 1 && syllable.tone <= 5)) failures.push(`训练字 ${entry.text}: tone 非法 ${syllable.tone}`)
    syllableCoverage.add(`${syllable.initial}|${syllable.final}`)
    if ((charRank.get(entry.text) ?? Infinity) > trainingCommonRank) fallbackChars += 1
  }
  const expectedCoverage = Object.keys(anchors?.syllableChars ?? {}).length
  ok(syllableCoverage.size >= 400, `训练字音节覆盖 = ${syllableCoverage.size}，期望 ≥400（共 ${expectedCoverage} 合法音节）`)
  ok(fallbackChars <= bank.chars.length * 0.1, `训练字保底生僻字 = ${fallbackChars}，期望 ≤10%`)

  ok(bank.words === undefined, 'training.bank 不应再保存 words（词语统一从公共词库加载）')
  ok((bank.chars ?? []).length >= 5000, `training.chars = ${bank.chars?.length}，期望 ≥5000`)
  const bytes = fs.statSync(TRAINING_BANK_FILE).size
  notes.push(
    `训练库：chars ${bank.chars.length}（音节覆盖 ${syllableCoverage.size}/${expectedCoverage}，保底补字 ${fallbackChars}） / ${(bytes / 1024 / 1024).toFixed(2)} MB / ${bank.dataVersion}`,
  )
  return bank
}

const REQUIRED_DOCS = [
  'docs/CONTRIBUTING.md',
  'docs/USAGE.md',
  'docs/LEARNING.md',
  'docs/TRAINING.md',
  'docs/SHORTCUTS.md',
  'docs/UI.md',
  'docs/SCREENSHOTS.md',
  'docs/ARCHITECTURE.md',
  'docs/DATA.md',
  'docs/RELEASE.md',
]

/** 文档与截图引用的唯一来源：README 与 docs 下全部 Markdown。 */
function documentationFiles() {
  const docs = walkFiles(path.join(ROOT, 'docs'), '')
    .filter((rel) => rel.endsWith('.md'))
    .map((rel) => `docs/${rel}`)
  return ['README.md', ...docs]
}

function validateDocsAndEntries() {
  for (const rel of ['README.md', 'apps/web/src/main.ts', 'packages/core/src/index.ts', 'LICENSE']) {
    ok(exists(path.join(ROOT, rel)), `缺少入口/文档：${rel}`)
  }
  for (const rel of REQUIRED_DOCS) ok(exists(path.join(ROOT, rel)), `缺少文档：${rel}`)
  // 旧文档 / 旧脚本应已删除，避免与新版文档重复。
  for (const rel of [
    'docs/WORDS.md',
    'scripts/word-pipeline/README.md',
    'scripts/word-pipeline/selector.mjs',
    'scripts/schemes/extract.mjs',
  ]) {
    ok(!exists(path.join(ROOT, rel)), `应已删除：${rel}`)
  }

  const docFiles = documentationFiles()
  const referencedScreenshots = new Set()
  for (const rel of docFiles) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8')
    // 文档内的 assets/impl 图片引用统一指向 docs/assets/impl/。
    for (const match of text.matchAll(/assets\/impl\/([\w.-]+\.png)/g)) {
      referencedScreenshots.add(match[1])
    }
    // 本地 Markdown 链接必须可解析（外链、纯锚点除外）。
    for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const link = match[1]
      if (/^(?:https?:|mailto:|#)/.test(link)) continue
      const target = link.split('#')[0]
      if (!target) continue
      const resolved = path.resolve(path.dirname(path.join(ROOT, rel)), target)
      ok(exists(resolved), `${rel} 的链接目标不存在：${link}`)
    }
  }
  for (const name of referencedScreenshots) {
    ok(exists(path.join(ROOT, 'docs/assets/impl', name)), `缺少截图 docs/assets/impl/${name}`)
  }
  // 截图清单单一来源：目录中的每张截图都必须被文档引用。
  const screenshotDir = path.join(ROOT, 'docs/assets/impl')
  ok(exists(screenshotDir), '缺少截图目录 docs/assets/impl')
  if (exists(screenshotDir)) {
    for (const name of fs.readdirSync(screenshotDir)) {
      if (name.endsWith('.png')) {
        ok(referencedScreenshots.has(name), `截图未被文档引用：docs/assets/impl/${name}`)
      }
    }
  }
  // README 是文档导航的唯一入口：必须链接全部 docs/**/*.md。
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8')
  for (const rel of docFiles.filter((file) => file !== 'README.md')) {
    ok(readme.includes(`](${rel})`), `README 导航缺少文档链接：${rel}`)
  }
  notes.push(
    `文档：${REQUIRED_DOCS.length + 1} 个 Markdown 入口、${referencedScreenshots.size} 张截图引用；README 导航覆盖 docs/**/*.md`,
  )
}

// ── 入口 ────────────────────────────────────────────────────
function main() {
  const schemes = validateSchemes()
  const curriculum = validateCurriculum(schemes?.schemeIndex, schemes?.engines)
  const wordsDoc = validateWords()
  validateAnchors()
  const anchorsDoc = readDataJSON('data/words/anchors.json')
  const pools = validatePools(curriculum?.xiaohe, wordsDoc, schemes?.engines, anchorsDoc)
  const training = validateTrainingBank(anchorsDoc)
  const versions = {
    curriculum: curriculum?.xiaohe?.dataVersion,
    pools: pools?.poolsIndex?.dataVersion,
    words: wordsDoc?.dataVersion,
    training: training?.dataVersion,
  }
  validatePublicSync(versions)
  validateDocsAndEntries()

  console.log('=== 数据管线校验 ===')
  for (const note of notes) console.log(`· ${note}`)
  if (failures.length === 0) {
    console.log('\n✅ 全部通过')
    process.exitCode = 0
    return
  }
  console.error(`\n❌ ${failures.length} 项失败：`)
  for (const failure of failures.slice(0, 60)) console.error(`  - ${failure}`)
  process.exitCode = 1
}

try {
  main()
} catch (error) {
  console.error('❌ 校验异常：', error)
  process.exitCode = 1
}
