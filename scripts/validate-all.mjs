#!/usr/bin/env node
/**
 * 一键数据校验（纯 Node + core TS 原生导入）。
 *
 * 覆盖：
 *  1) 方案数据：19 套方案 + 判题用例规模；
 *  2) 课程：5 套、schema 收敛、命名法、cumulative、learn 原子全覆盖（engine.diff 唯一来源）、
 *     dataVersion = curriculum-<hash>；
 *  3) 词表：8000 词、tone ∈ 1..5、pinyin = initial+final、content/dataVersion 重算；
 *  4) 词池：tone/freqRank/polyphone、索引 sources/版本重算、全局 freqRank 一致性；
 *  5) 版本链：curriculum → pools.sources；words/pools/curriculum 重算 hash；
 *  6) public/data 与 manifest：逐字节一致、版本一致；
 *  7) 文档结构：文档入口完整、README 导航覆盖 docs 下全部 Markdown、
 *     README 与 docs 下 Markdown 的图片/本地链接可解析、截图清单无未引用项。
 *
 * 用法：node scripts/validate-all.mjs   （退出码 0/1）
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  createSchemeEngine,
  FINALS,
  INITIALS,
  ZERO_INITIALS,
} from '../packages/core/src/index.ts'
import {
  CURRICULUM_INDEX_FILE,
  DATA_DIR,
  PUBLIC_DATA_DIR,
  ROOT,
  SCHEME_DIR,
  SCHEME_INDEX_FILE,
  TEMPLATE_VERSION,
  curriculumVersionOf,
  exists,
  readJSON,
  sha256,
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
    .readdirSync(SCHEME_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
  ok(schemeFiles.length === 19, `方案目录数 = ${schemeFiles.length}，期望 19`)
  ok((schemeIndex.courseSupported ?? []).length === 5, `courseSupported 数量 = ${(schemeIndex.courseSupported ?? []).length}，期望 5`)

  const engines = new Map()
  for (const name of schemeFiles) {
    const scheme = readDataJSON(`data/schemes/${name}/scheme.json`)
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
  const index = readDataJSON('data/schemes/curriculum-index.json')
  ok(!!index, '缺少 data/schemes/curriculum-index.json')
  if (!index) return null
  ok(index.templateVersion === TEMPLATE_VERSION, `curriculum index templateVersion = ${index.templateVersion}`)
  const supported = schemeIndex?.courseSupported ?? []
  ok((index.schemes ?? []).length === 5, `课程索引 = ${(index.schemes ?? []).length}，期望 5`)
  const curricula = new Map()

  for (const schemeId of supported) {
    const curriculum = readDataJSON(`data/schemes/${schemeId}/curriculum.json`)
    if (!curriculum) continue
    curricula.set(schemeId, curriculum)
    const fileMeta = (index.schemes ?? []).find((item) => item.schemeId === schemeId)
    ok(!!fileMeta, `课程索引缺 ${schemeId}`)
    if (fileMeta) ok(fileMeta.file === `data/schemes/${schemeId}/curriculum.json`, `${schemeId}: 索引 file 不一致`)
    ok(curriculum.templateVersion === TEMPLATE_VERSION, `${schemeId}: templateVersion = ${curriculum.templateVersion}`)
    ok(curriculum.dataVersion === curriculumVersionOf(curriculum.chapters, curriculum.lessons), `${schemeId}: dataVersion 与内容不匹配`)
    ok('nodes' in curriculum === false, `${schemeId}: 不应包含 nodes`)
    ok('warnings' in curriculum === false, `${schemeId}: 不应包含 warnings`)
    ok('evidence' in curriculum === false, `${schemeId}: 不应包含 evidence`)
    ok('validation' in curriculum === false, `${schemeId}: 不应包含 validation`)
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
            `${schemeId}/${lesson.id}: passCriteria 含不支持字段`,
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
          const scheme = readDataJSON(`data/schemes/${schemeId}/scheme.json`)
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
        if (lesson.kind !== 'intro') ok(stages[stages.length - 1] === 'exam', `${schemeId}/${lesson.id}: 最后阶段必须为 exam（无提示考核）`)
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
    }
    notes.push(`课程：${schemeId} ${curriculum.lessons.length} 课 / ${curriculum.dataVersion}`)
  }
  ok(curricula.size === 5, `课程 = ${curricula.size} 套，期望 5`)
  const xiaohe = curricula.get('xiaohe')
  return { curricula, xiaohe, index }
}

// ── 5. 版本链 / public 同步 / 文档入口 ──────────────────────
function validatePublicSync(versions) {
  const publicManifestFile = path.join(PUBLIC_DATA_DIR, 'manifest.json')
  ok(exists(publicManifestFile), '缺少 apps/web/public/data/manifest.json（请先运行 pnpm data:sync）')
  if (!exists(publicManifestFile)) return
  const manifest = JSON.parse(fs.readFileSync(publicManifestFile, 'utf8'))
  ok(manifest.versions?.curriculum === versions.curriculum, `manifest.versions.curriculum = ${manifest.versions?.curriculum}`)
  ok(manifest.versions?.lexicon === versions.lexicon, `manifest.versions.lexicon = ${manifest.versions?.lexicon}`)
  ok((manifest.courses ?? []).length === 5, `manifest.courses = ${(manifest.courses ?? []).length}，期望 5`)
  const schemeIndex = readDataJSON('data/schemes/index.json')
  ok(manifest.defaultScheme === schemeIndex?.defaultScheme, `manifest.defaultScheme = ${manifest.defaultScheme}`)

  const publicFiles = new Set(walkFiles(PUBLIC_DATA_DIR).filter((file) => file !== 'manifest.json'))
  const manifestFiles = new Set((manifest.files ?? []).map((file) => file.file))
  ok(publicFiles.size === manifestFiles.size, `public 文件数 = ${publicFiles.size}，manifest 记录 ${manifestFiles.size}`)
  for (const file of manifestFiles) {
    ok(publicFiles.has(file), `manifest 记录的文件不存在：${file}`)
    // packages 是 sync 时从 data/schemes/<id>/ 生成到 public 的产物，不要求在 data/ 有同名来源。
    if (file.startsWith('packages/')) continue
    const publicFile = path.join(PUBLIC_DATA_DIR, file)
    let sourceFile = path.join(DATA_DIR, file)
    if (file === 'curriculum/index.json') sourceFile = CURRICULUM_INDEX_FILE
    else if (file.startsWith('schemes/') && file !== 'schemes/index.json' && file.endsWith('.json')) {
      sourceFile = path.join(SCHEME_DIR, file.slice('schemes/'.length, -'.json'.length), 'scheme.json')
    } else if (file.startsWith('curriculum/') && file.endsWith('.curriculum.json')) {
      const id = file.slice('curriculum/'.length, -'.curriculum.json'.length)
      sourceFile = path.join(SCHEME_DIR, id, 'curriculum.json')
    }
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
  const packageRoot = path.join(PUBLIC_DATA_DIR, 'packages')
  const packageIndexFile = path.join(packageRoot, 'index.json')
  ok(exists(packageIndexFile), '缺少 public/data/packages/index.json')
  const packageIndex = exists(packageIndexFile) ? JSON.parse(fs.readFileSync(packageIndexFile, 'utf8')) : null
  if (packageIndex) {
    const manifests = packageIndex.packages ?? []
    ok(manifests.length === 19, `方案包数 = ${manifests.length}，期望 19`)
    ok((packageIndex.courseSupported ?? []).length === 5, `方案包课程能力数 = ${(packageIndex.courseSupported ?? []).length}，期望 5`)
    for (const item of manifests) {
      const dir = path.join(packageRoot, item.id)
      const packedScheme = path.join(dir, 'scheme.json')
      ok(fs.existsSync(packedScheme), `方案包缺 scheme：${item.id}`)
      ok(fs.existsSync(path.join(dir, 'manifest.json')), `方案包缺 manifest：${item.id}`)
      const flatScheme = path.join(SCHEME_DIR, `${item.id}`, 'scheme.json')
      if (fs.existsSync(packedScheme) && fs.existsSync(flatScheme)) {
        ok(
          fs.readFileSync(packedScheme).equals(fs.readFileSync(flatScheme)),
          `方案包与扁平 scheme 不一致：${item.id}`,
        )
      }
      if (item.capabilities?.course) {
        const packedCurriculum = path.join(dir, 'curriculum.json')
        ok(fs.existsSync(packedCurriculum), `课程方案包缺 curriculum：${item.id}`)
        const flatCurriculum = path.join(SCHEME_DIR, item.id, 'curriculum.json')
        if (fs.existsSync(packedCurriculum) && fs.existsSync(flatCurriculum)) {
          ok(
            fs.readFileSync(packedCurriculum).equals(fs.readFileSync(flatCurriculum)),
            `方案包与扁平 curriculum 不一致：${item.id}`,
          )
        }
      } else {
        ok(item.curriculum === null, `practice-only 包不应带 curriculum：${item.id}`)
      }
    }
  }
  const lexicon = readDataJSON('data/lexicon/lexicon.json')
  ok(!!lexicon, '缺少 data/lexicon/lexicon.json')
  if (lexicon) {
    ok(lexicon.dataVersion === versions.lexicon, `lexicon.dataVersion = ${lexicon.dataVersion}`)
    ok((lexicon.words ?? []).length >= 20000, `lexicon.words = ${(lexicon.words ?? []).length}，至少 20000 词`)
    ok((lexicon.chars ?? []).length >= 4000, `lexicon.chars = ${(lexicon.chars ?? []).length}，至少 4000 字`)
    ok(Object.keys(lexicon.syllableExamples ?? {}).length >= 390, 'lexicon.syllableExamples 少于 390 个音节')
    const seen = new Set()
    for (const word of lexicon.words ?? []) {
      if (seen.has(word.text)) failures.push(`lexicon 词重复：${word.text}`)
      seen.add(word.text)
      ok(word.length >= 2 && word.length <= 5, `lexicon 词长度异常：${word.text}`)
    }
  }
  ok((manifest.files ?? []).length >= 45, `manifest.files = ${(manifest.files ?? []).length}，至少应包含基础文件`)
  notes.push(`同步：public/data ${manifestFiles.size} 文件与 data/ 逐字节一致；versions=${JSON.stringify(manifest.versions)}`)
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
  'docs/SCHEMES.md',
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
  // 废弃数据目录不应存在，避免误用。
  for (const rel of ['data/pools', 'data/words', 'data/training']) {
    ok(!exists(path.join(ROOT, rel)), `不应存在的废弃数据目录：${rel}`)
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
  const versions = {
    curriculum: curriculum?.xiaohe?.dataVersion,
    lexicon: readDataJSON('data/lexicon/lexicon.json')?.dataVersion,
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
