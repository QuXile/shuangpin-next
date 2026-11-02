/**
 * 课程校验。
 *
 *  - simplified（14 套自动生成课程）：用生成器重新生成（回填 generatedAt 保证确定性）
 *    → 与磁盘 JSON 深相等；另保留少量独立结构不变式，避免校验退化为「生成器自证」。
 *  - full（5 套定制路线）：独立数据、无法重新生成，保留严格 schema / 累计前置 / 原子覆盖校验。
 *
 * 课程清单由 data/schemes/index.json 的 courseSupported 派生，不存在独立课程索引文件。
 */
import fs from 'node:fs'
import path from 'node:path'
import { PRACTICE_STAGES, analyzeSchemeCodes } from '../../packages/core/src/index.ts'
import { SCHEME_DIR, curriculumVersionOf, firstJSONDifference } from '../lib/data-contract.mjs'
import { buildUniversalCurriculum } from '../generate-universal-curriculum.mjs'
import {
  CODE_TIP_PREFIXES,
  SIMPLIFIED_TIPS_MAX,
  STAGE_MIN_BY_KIND,
  TEMPLATE_VERSION,
  freeAtomIdsOf,
} from '../lib/curriculum-template.mjs'

const LESSON_FORBIDDEN = [
  'sameKeyNotes', 'maxHintRate', 'maxAvgKeyMs', 'noGate', 'evidence',
  'targetCount', 'minFreeRatio', 'zeroRulePractice', 'focusRule', 'review', 'hintTier',
]
/** 课程标题「类别 · 内容」的合法类别；定制 full 课程额外允许「同键」。 */
const FULL_LESSON_CATEGORIES = ['入门', '声母', '零声母', '韵母', '同键', '复习', '期中', '综合', '通关']
const lessonTitlePattern = (categories) => new RegExp(`^(${categories.join('|')}) · (.+)$`)
const LESSON_TITLE_RE = lessonTitlePattern(FULL_LESSON_CATEGORIES.filter((category) => category !== '同键'))
const FULL_LESSON_TITLE_RE = lessonTitlePattern(FULL_LESSON_CATEGORIES)
/** 有定制课程路线的方案：通用生成器必须原样跳过。 */
const FULL_COURSE_IDS = ['xiaohe', 'weiruan', 'ziranma', 'pinyinjiajia', 'sougou']

export function validateCurriculum(ctx) {
  const schemeIndex = ctx.schemeIndex
  if (!schemeIndex) return
  const supported = schemeIndex.courseSupported ?? []
  const supportedSet = new Set(supported)
  const summaries = new Map((schemeIndex.schemes ?? []).map((summary) => [summary.id, summary]))
  const curricula = new Map()

  // curriculum.json 存在性必须与 courseSupported 完全一致（多余/缺失都是索引漂移）。
  for (const summary of schemeIndex.schemes ?? []) {
    const file = path.join(SCHEME_DIR, summary.id, 'curriculum.json')
    ctx.ok(
      fs.existsSync(file) === supportedSet.has(summary.id),
      `${summary.id}: curriculum.json 存在性与 courseSupported 不一致`,
    )
  }

  for (const schemeId of supported) {
    const curriculum = ctx.readDataJSON(`data/schemes/${schemeId}/curriculum.json`)
    if (!curriculum) continue
    curricula.set(schemeId, curriculum)
    const engineInfo = ctx.engines.get(schemeId)
    const isGenerated = curriculum.supportLevel === 'simplified'
    ctx.ok(curriculum.templateVersion === TEMPLATE_VERSION, `${schemeId}: templateVersion = ${curriculum.templateVersion}`)
    ctx.ok(
      curriculum.dataVersion === curriculumVersionOf(curriculum.chapters, curriculum.lessons),
      `${schemeId}: dataVersion 与内容不匹配`,
    )
    ctx.ok(curriculum.schemeId === schemeId, `${schemeId}: schemeId 不一致`)
    ctx.ok(
      isGenerated ? curriculum.origin === 'generated' : curriculum.origin === undefined,
      `${schemeId}: origin = ${curriculum.origin}，${isGenerated ? '生成课程应标记 generated' : '定制课程不应写 origin'}`,
    )
    for (const field of ['nodes', 'warnings', 'evidence', 'validation']) {
      ctx.ok(!(field in curriculum), `${schemeId}: 不应包含 ${field}`)
    }
    const summary = summaries.get(schemeId)
    ctx.ok(Boolean(summary?.course?.supportsGuidedCourse), `${schemeId}: 索引缺 course.supportsGuidedCourse`)
    ctx.ok(
      summary?.course?.courseTier === (isGenerated ? 'simplified' : 'full'),
      `${schemeId}: 索引 courseTier 与课程 supportLevel 不一致`,
    )
    // 编码音节必须可解析、兼容编码必须出现在课程 tips（独立于生成器的数据完整性断言）。
    if (engineInfo?.scheme) {
      const codeAnalysis = analyzeSchemeCodes(engineInfo.scheme)
      ctx.ok(
        codeAnalysis.unresolved.length === 0,
        `${schemeId}: 编码音节无法解析：${codeAnalysis.unresolved.join(', ')}`,
      )
      const allTips = curriculum.lessons.flatMap((lesson) => lesson.tips ?? []).join('\n').toUpperCase()
      for (const [syllable, codes] of Object.entries(engineInfo.scheme.compatCodes ?? {})) {
        for (const code of codes) {
          ctx.ok(
            allTips.includes(String(code).toUpperCase()),
            `${schemeId}: ${syllable} 缺少兼容码 ${code} 的课程技巧`,
          )
        }
      }
    }
    if (curriculum.supportLevel === 'full') {
      validateFullCurriculum(ctx, schemeId, curriculum, engineInfo)
    } else if (isGenerated) {
      validateSimplifiedCurriculum(ctx, schemeId, curriculum, engineInfo, summary)
    } else {
      ctx.ok(false, `${schemeId}: 未知 supportLevel = ${curriculum.supportLevel}`)
    }
    ctx.note(`课程：${schemeId} ${curriculum.lessons.length} 课（${curriculum.supportLevel}） / ${curriculum.dataVersion}`)
  }

  ctx.ok(curricula.size === supported.length, `课程 = ${curricula.size} 套，期望 ${supported.length}`)
  const fullIds = [...curricula.values()]
    .filter((curriculum) => curriculum.supportLevel === 'full')
    .map((curriculum) => curriculum.schemeId)
    .sort()
  ctx.ok(
    JSON.stringify(fullIds) === JSON.stringify([...FULL_COURSE_IDS].sort()),
    `定制课程应恰为 ${FULL_COURSE_IDS.length} 套（${FULL_COURSE_IDS.join(', ')}），实际：${fullIds.join(', ')}`,
  )
  const simplifiedCount = [...curricula.values()].filter(
    (curriculum) => curriculum.supportLevel === 'simplified',
  ).length
  ctx.ok(
    simplifiedCount === supported.length - FULL_COURSE_IDS.length,
    `通用生成课程 = ${simplifiedCount} 套，期望 ${supported.length - FULL_COURSE_IDS.length}`,
  )
}

/**
 * 14 套通用生成课程：重新生成 + JSON 深相等（主判定），再校验少量独立结构不变式。
 */
function validateSimplifiedCurriculum(ctx, schemeId, curriculum, engineInfo, summary) {
  if (!engineInfo) {
    ctx.ok(false, `${schemeId}: 通用课程缺少可构造的方案引擎`)
    return
  }
  if (!ctx.lexicon) {
    ctx.ok(false, `${schemeId}: 缺少 Lexicon，无法重新生成课程`)
    return
  }
  const { engine } = engineInfo
  const scheme = engine.def
  ctx.ok(
    typeof curriculum.generatedAt === 'string' && !Number.isNaN(Date.parse(curriculum.generatedAt)),
    `${schemeId}: generatedAt 非法`,
  )
  ctx.ok(curriculum.schemeName === (scheme.name ?? summary?.name), `${schemeId}: schemeName = ${curriculum.schemeName}`)
  ctx.ok(curriculum.schemeType === scheme.type, `${schemeId}: schemeType = ${curriculum.schemeType}`)
  const expected = buildUniversalCurriculum({
    scheme,
    schemeName: scheme.name ?? summary?.name,
    generatedAt: curriculum.generatedAt,
    lexicon: ctx.lexicon,
  })
  const difference = firstJSONDifference(expected, curriculum)
  ctx.ok(!difference, `${schemeId}: 重新生成的课程与磁盘不一致：${difference}`)

  // ── 独立结构不变式（不依赖生成器实现） ──
  ctx.ok(Array.isArray(curriculum.chapters) && curriculum.chapters.length > 0, `${schemeId}: 缺少章节`)
  ctx.ok(Array.isArray(curriculum.lessons) && curriculum.lessons.length > 0, `${schemeId}: 缺少课程`)
  if (!Array.isArray(curriculum.chapters) || !Array.isArray(curriculum.lessons)) return
  ctx.ok(curriculum.lessons[0]?.kind === 'intro', `${schemeId}: 首课应为入门`)
  ctx.ok(
    curriculum.lessons[curriculum.lessons.length - 1]?.kind === 'exam',
    `${schemeId}: 最后一课应为最终考核`,
  )
  const drills = curriculum.lessons.filter((lesson) => lesson.kind === 'drill')
  for (const lesson of drills) {
    ctx.ok(
      lesson.focusAtoms.length === 1,
      `${schemeId}/${lesson.id}: 新课应每原子一节（当前 ${lesson.focusAtoms.length} 个）`,
    )
  }
  // 原子覆盖：learn 原子恰好一节课、free 原子不单独设课（engine.diff 为唯一来源）。
  const freeAtoms = new Set(freeAtomIdsOf(scheme, engine.freeSets()))
  const drillAtoms = drills.flatMap((lesson) => lesson.focusAtoms)
  const allAtomIds = [
    ...Object.keys(scheme.initials ?? {}).map((key) => `initial:${key}`),
    ...Object.keys(scheme.finals ?? {}).map((key) => `final:${key}`),
    ...Object.keys(scheme.zeroInitial ?? {}).map((key) => `zero:${key}`),
  ]
  for (const atom of allAtomIds) {
    const count = drillAtoms.filter((item) => item === atom).length
    if (freeAtoms.has(atom)) ctx.ok(count === 0, `${schemeId}: free 原子 ${atom} 不应单独设课`)
    else ctx.ok(count === 1, `${schemeId}: learn 原子 ${atom} 应恰好一节课，实际 ${count} 节`)
  }
  // 章末复习（标题「复习 · …」）只能覆盖本章 drill 原子；期中 / 综合 / 期末走累计规则。
  const drillAtomsByChapter = new Map()
  for (const lesson of curriculum.lessons) {
    if (lesson.kind !== 'drill') continue
    const atoms = drillAtomsByChapter.get(lesson.chapterId) ?? new Set()
    for (const atom of lesson.focusAtoms) atoms.add(atom)
    drillAtomsByChapter.set(lesson.chapterId, atoms)
  }
  for (const lesson of curriculum.lessons) {
    if (lesson.kind !== 'review' || !String(lesson.title).startsWith('复习 ·')) continue
    const allowed = drillAtomsByChapter.get(lesson.chapterId) ?? new Set()
    ctx.ok(lesson.focusAtoms.length > 0, `${schemeId}/${lesson.id}: 章末复习范围不能为空`)
    ctx.ok(
      lesson.focusAtoms.every((atom) => allowed.has(atom)),
      `${schemeId}/${lesson.id}: 章末复习只能包含本章内容`,
    )
  }
  // 标题格式 / tips 只允许可验证的编码类提示（且不超过上限）。
  for (const lesson of curriculum.lessons) {
    ctx.ok(LESSON_TITLE_RE.test(lesson.title ?? ''), `${schemeId}/${lesson.id}: 标题不符合「类别 · 内容」`)
    const tips = lesson.tips ?? []
    ctx.ok(
      Array.isArray(lesson.tips) && tips.length <= SIMPLIFIED_TIPS_MAX,
      `${schemeId}/${lesson.id}: tips 数量应在 0–${SIMPLIFIED_TIPS_MAX}`,
    )
    ctx.ok(
      tips.every((tip) => CODE_TIP_PREFIXES.some((prefix) => tip.startsWith(prefix))),
      `${schemeId}/${lesson.id}: 生成课程的 tips 只允许推荐码/兼容映射`,
    )
  }
}

/** 5 套定制路线课程：保留 v1 模板的严格校验（独立数据，无法重新生成）。 */
function validateFullCurriculum(ctx, schemeId, curriculum, engineInfo) {
  const orderedChapters = [...curriculum.chapters].sort((a, b) => a.order - b.order)
  orderedChapters.forEach((chapter, index) => {
    ctx.ok(chapter.order === index + 1, `${schemeId}/${chapter.id}: 章 order = ${chapter.order}，期望 ${index + 1}`)
    ctx.ok(Boolean(chapter.title && chapter.subtitle), `${schemeId}/${chapter.id}: 缺标题/副标题`)
  })
  const orderById = new Map(curriculum.chapters.map((chapter) => [chapter.id, chapter.order]))
  const titleSeen = new Set()
  const chapterLessonCounts = new Map()

  const chapterIds = new Set(curriculum.chapters.map((chapter) => chapter.id))
  // 章末复习只允许本章 drill 原子（期中 / 综合 / 通关 走累计规则）。
  const drillAtomsByChapter = new Map()
  for (const lesson of curriculum.lessons) {
    if (lesson.kind !== 'drill') continue
    const atoms = drillAtomsByChapter.get(lesson.chapterId) ?? new Set()
    for (const atom of lesson.focusAtoms) atoms.add(atom)
    drillAtomsByChapter.set(lesson.chapterId, atoms)
  }
  const ids = new Set()
  let learnedAtoms = new Set()
  const focusUnion = new Set()
  for (const lesson of curriculum.lessons) {
    const idMatch = /^L(\d+)\.(\d+)$/.exec(lesson.id)
    ctx.ok(Boolean(idMatch), `${schemeId}/${lesson.id}: 课 id 不符合 L<章>.<课序>`)
    if (idMatch) {
      ctx.ok(Number(idMatch[1]) === orderById.get(lesson.chapterId), `${schemeId}/${lesson.id}: id 章号与 chapterId 不一致`)
      const expectedSeq = (chapterLessonCounts.get(lesson.chapterId) ?? 0) + 1
      ctx.ok(Number(idMatch[2]) === expectedSeq, `${schemeId}/${lesson.id}: 章内课号不连续`)
    }
    chapterLessonCounts.set(lesson.chapterId, (chapterLessonCounts.get(lesson.chapterId) ?? 0) + 1)
    const titleMatch = FULL_LESSON_TITLE_RE.exec(lesson.title ?? '')
    ctx.ok(Boolean(titleMatch), `${schemeId}/${lesson.id}: 标题不符合「类别 · 内容」`)
    ctx.ok(!titleSeen.has(lesson.title), `${schemeId}/${lesson.id}: 标题重复`)
    titleSeen.add(lesson.title)
    ctx.ok(!ids.has(lesson.id), `${schemeId}/${lesson.id}: 课程 id 重复`)
    ids.add(lesson.id)
    ctx.ok(chapterIds.has(lesson.chapterId), `${schemeId}/${lesson.id}: 未知章节`)
    for (const field of LESSON_FORBIDDEN) {
      ctx.ok(!(field in lesson), `${schemeId}/${lesson.id}: 不应包含字段 ${field}`)
    }
    for (const atom of lesson.focusAtoms) {
      focusUnion.add(atom)
      ctx.ok(!atom.startsWith('rule:'), `${schemeId}/${lesson.id}: 不允许的 rule 原子 ${atom}`)
      ctx.ok(Boolean(lesson.atomMeta?.[atom]), `${schemeId}/${lesson.id}: 原子 ${atom} 缺 atomMeta`)
    }
    const blocking = lesson.focusAtoms.filter((atom) => atom.startsWith('initial:') || atom.startsWith('final:'))
    const nonBlocking = lesson.focusAtoms.filter((atom) => atom.startsWith('zero:'))
    ctx.ok(
      JSON.stringify(blocking) === JSON.stringify(lesson.blockingAtoms),
      `${schemeId}/${lesson.id}: blockingAtoms 与 focusAtoms 不一致`,
    )
    ctx.ok(
      JSON.stringify(nonBlocking) === JSON.stringify(lesson.nonBlockingAtoms),
      `${schemeId}/${lesson.id}: nonBlockingAtoms 与 focusAtoms 不一致`,
    )
    ctx.ok(
      lesson.prerequisites.length === learnedAtoms.size &&
        lesson.prerequisites.every((atom) => learnedAtoms.has(atom)),
      `${schemeId}/${lesson.id}: prerequisites 不是此前 focus 的累计集合`,
    )
    if (lesson.kind === 'intro') {
      ctx.ok(lesson.passCriteria === undefined, `${schemeId}/${lesson.id}: 入门课不应写 passCriteria`)
    } else {
      const criteria = lesson.passCriteria
      ctx.ok(Boolean(criteria), `${schemeId}/${lesson.id}: 缺 passCriteria`)
      if (criteria) {
        ctx.ok(criteria.accuracy > 0 && criteria.accuracy <= 1, `${schemeId}/${lesson.id}: accuracy 非法`)
        ctx.ok(
          criteria.maxHintRate === undefined && criteria.maxAvgKeyMs === undefined && criteria.noGate === undefined,
          `${schemeId}/${lesson.id}: passCriteria 含不支持字段`,
        )
        if (criteria.starCpm) {
          const [one, two, three] = criteria.starCpm
          ctx.ok(one === criteria.minCpm && one < two && two < three, `${schemeId}/${lesson.id}: starCpm 非法`)
        }
        if (criteria.mode === 'speed' || criteria.mode === 'accuracy-speed') {
          ctx.ok(criteria.minCpm !== undefined, `${schemeId}/${lesson.id}: 速度模式缺 minCpm`)
        }
      }
    }
    ctx.ok(
      JSON.stringify(Object.keys(lesson.wordPlan ?? {}).sort()) === JSON.stringify(['lengthRange', 'maxUnfamiliar']),
      `${schemeId}/${lesson.id}: wordPlan 字段非法`,
    )
    ctx.ok(Array.isArray(lesson.tips) && lesson.tips.length <= 4, `${schemeId}/${lesson.id}: tips 数量非法`)
    if (Array.isArray(lesson.tips)) {
      ctx.ok(new Set(lesson.tips).size === lesson.tips.length, `${schemeId}/${lesson.id}: tips 有重复`)
      ctx.ok(lesson.tips.every((tip) => typeof tip === 'string' && tip.trim().length > 0), `${schemeId}/${lesson.id}: tips 含空值`)
    }
    const expectedZeros = lesson.focusAtoms.filter((atom) => atom.startsWith('zero:')).map((atom) => atom.slice(5))
    ctx.ok(
      JSON.stringify((lesson.zeroExamples ?? []).map((example) => example.syllable)) === JSON.stringify(expectedZeros),
      `${schemeId}/${lesson.id}: zeroExamples 与 focus zero 原子不一致`,
    )
    ctx.ok(
      (lesson.zeroExamples ?? []).every((example) => typeof example.char === 'string' && example.char.trim().length > 0),
      `${schemeId}/${lesson.id}: zeroExamples.char 为空`,
    )
    ctx.ok(
      (lesson.zeroExamples ?? []).every((example) => !('keys' in example) && !('rule' in example)),
      `${schemeId}/${lesson.id}: zeroExamples 不应包含 keys/rule 字段`,
    )
    // 提示档位只由阶段决定（single/word/exam），课程数据不得再有 hintTier
    ctx.ok(!('hintTier' in lesson), `${schemeId}/${lesson.id}: 不应再有 hintTier 字段`)
    const titleCategory = titleMatch?.[1] ?? ''
    if (titleCategory === '复习') {
      const allowed = drillAtomsByChapter.get(lesson.chapterId) ?? new Set()
      ctx.ok(lesson.focusAtoms.length > 0, `${schemeId}/${lesson.id}: 章末复习范围不能为空`)
      ctx.ok(
        lesson.focusAtoms.every((atom) => allowed.has(atom)),
        `${schemeId}/${lesson.id}: 章末复习只能包含本章内容`,
      )
    }
    if (['期中', '综合', '通关'].includes(titleCategory)) {
      const expectedFocus = [...lesson.prerequisites]
      ctx.ok(
        JSON.stringify(expectedFocus) === JSON.stringify(lesson.focusAtoms),
        `${schemeId}/${lesson.id}: cumulative focus 应等于此前已学知识点`,
      )
      ctx.ok(
        !lesson.blockingAtoms.some((atom) => !lesson.prerequisites.includes(atom)),
        `${schemeId}/${lesson.id}: cumulative 不应引入新阻塞原子`,
      )
    }
    for (const atom of lesson.focusAtoms) {
      const meta = lesson.atomMeta?.[atom]
      if (meta?.anchors !== undefined) {
        ctx.ok(Array.isArray(meta.anchors) && meta.anchors.length >= 1 && meta.anchors.length <= 5, `${schemeId}/${lesson.id}/${atom}: anchors 非法`)
        if (Array.isArray(meta.anchors)) ctx.ok(meta.anchors.every((item) => typeof item === 'string' && item.trim()), `${schemeId}/${lesson.id}/${atom}: anchors 含空值`)
      }
      if (meta?.mnemonic !== undefined) ctx.ok(typeof meta.mnemonic === 'string' && meta.mnemonic.trim().length > 0, `${schemeId}/${lesson.id}/${atom}: mnemonic 为空`)
      // 锚点区块只展示 initial/final 原子；zero 由 L2.4 全表/示例/tips 表达。
      if (lesson.kind === 'drill' && (atom.startsWith('initial:') || atom.startsWith('final:'))) {
        ctx.ok(Array.isArray(meta?.anchors) && meta.anchors.length > 0, `${schemeId}/${lesson.id}/${atom}: drill 缺 anchors`)
        ctx.ok(typeof meta?.mnemonic === 'string' && meta.mnemonic.trim().length > 0, `${schemeId}/${lesson.id}/${atom}: drill 缺 mnemonic`)
      }
    }
    if (lesson.kind === 'drill') {
      const prior = new Set(lesson.prerequisites)
      const newAtoms = lesson.blockingAtoms.filter((atom) => !prior.has(atom))
      if (newAtoms.length > 1 && engineInfo?.scheme) {
        const umlautFamily = new Set(['final:v', 'final:ve', 'final:ue'])
        const allUmlaut = newAtoms.every((atom) => umlautFamily.has(atom))
        const scheme = engineInfo.scheme
        const keySets = newAtoms.map((atom) => {
          const [type, key] = atom.split(':')
          const table = type === 'initial' ? scheme?.initials : scheme?.finals
          return new Set((table?.[key] ?? []).map((item) => String(item).toLowerCase()))
        })
        const shared = keySets.length > 0 && [...keySets[0]].some((key) => keySets.every((set) => set.has(key)))
        ctx.ok(allUmlaut || shared, `${schemeId}/${lesson.id}: 多个新键 ${newAtoms.join(',')} 不共用键位且不属 ü 家族`)
      }
    }
    // stageMinWords / 阶段顺序：drill 三段；review/exam 单段；每课最后阶段必须 exam
    ctx.ok(
      JSON.stringify(lesson.stageMinWords) === JSON.stringify(STAGE_MIN_BY_KIND[lesson.kind] ?? null),
      `${schemeId}/${lesson.id}: stageMinWords = ${JSON.stringify(lesson.stageMinWords)}，期望 ${JSON.stringify(STAGE_MIN_BY_KIND[lesson.kind])}`,
    )
    if (lesson.stageMinWords) {
      const stages = Object.keys(lesson.stageMinWords)
      if (lesson.kind !== 'intro') ctx.ok(stages[stages.length - 1] === 'exam', `${schemeId}/${lesson.id}: 最后阶段必须为 exam（无提示考核）`)
      if (lesson.kind === 'drill') ctx.ok(JSON.stringify(stages) === JSON.stringify(PRACTICE_STAGES), `${schemeId}/${lesson.id}: drill 阶段应为 ${PRACTICE_STAGES.join(' → ')}`)
      if (lesson.kind === 'review' || lesson.kind === 'exam') ctx.ok(JSON.stringify(stages) === JSON.stringify(['exam']), `${schemeId}/${lesson.id}: ${lesson.kind} 阶段应只有 exam`)
      for (const [stage, value] of Object.entries(lesson.stageMinWords)) {
        ctx.ok(PRACTICE_STAGES.includes(stage), `${schemeId}/${lesson.id}: stageMinWords 未知阶段 ${stage}`)
        ctx.ok(Number.isInteger(value) && value > 0, `${schemeId}/${lesson.id}: stageMinWords.${stage} 非法`)
      }
    }
    for (const atom of lesson.focusAtoms) learnedAtoms.add(atom)
  }

  // learn 原子全覆盖（engine.diff 为唯一来源）
  if (engineInfo) {
    const { diff } = engineInfo
    const learnZeros = [...diff.learnZero]
    const learnZerosCount = learnZeros.length
    const learnAtoms = [
      ...diff.learnInitials.map((initial) => `initial:${initial}`),
      ...diff.learnFinals.map((final) => `final:${final}`),
      ...learnZeros.map((zero) => `zero:${zero}`),
    ]
    for (const atom of learnAtoms) {
      ctx.ok(focusUnion.has(atom), `${schemeId}: learn 原子 ${atom} 未出现在任何课程 focusAtoms 中`)
      const firstIndex = curriculum.lessons.findIndex((lesson) => lesson.focusAtoms.includes(atom))
      if (firstIndex >= 0) {
        for (let index = firstIndex + 1; index < curriculum.lessons.length; index += 1) {
          ctx.ok(
            curriculum.lessons[index].prerequisites.includes(atom),
            `${schemeId}: ${atom} 未进入 ${curriculum.lessons[index].id} 的 prerequisites`,
          )
        }
      }
    }
    // 专项课程：firstPractice / u-ü 复习 / üe·ve 同键课 / rule 范围
    const zhLesson = curriculum.lessons.find((lesson) => lesson.title === '声母 · zh')
    ctx.ok(
      Boolean(zhLesson && zhLesson.tips.some((tip) => tip.includes('多音字') && tip.includes('j/q/x/y'))),
      `${schemeId}: 首课（声母 · zh）tips 必须含「多音字」与「j/q/x/y」`,
    )
    // 零声母累计复习（按数据特征定位）：复习课 && focus==prerequisites && 覆盖全部 learn zero
    const zeroReview = curriculum.lessons.find(
      (lesson) =>
        lesson.kind === 'review' &&
        (lesson.title ?? '').startsWith('复习 ·') &&
        JSON.stringify(lesson.focusAtoms) === JSON.stringify(lesson.prerequisites) &&
        lesson.focusAtoms.filter((atom) => atom.startsWith('zero:')).length === learnZerosCount,
    )
    ctx.ok(Boolean(zeroReview), `${schemeId}: 缺少覆盖 ${learnZerosCount} 个 learn 零声母的累计复习课`)
    if (zeroReview) {
      const zeroAtoms = zeroReview.focusAtoms.filter((atom) => atom.startsWith('zero:'))
      const expectedZeros = zeroReview.prerequisites.filter((atom) => atom.startsWith('zero:'))
      ctx.ok(
        JSON.stringify(zeroAtoms) === JSON.stringify(expectedZeros),
        `${schemeId}: 零声母累计复习顺序应等于 prerequisites 的学习顺序`,
      )
    }
    const uUmlautLesson = curriculum.lessons.find((lesson) => lesson.reviewFamily === 'u-ü')
    ctx.ok(Boolean(uUmlautLesson), `${schemeId}: 缺少 reviewFamily=u-ü 的复习课`)
    if (uUmlautLesson) {
      for (const atom of ['final:ui', 'final:un', 'final:ue', 'final:ve']) {
        ctx.ok(uUmlautLesson.focusAtoms.includes(atom), `${schemeId}: u-ü 复习缺 ${atom}`)
      }
    }
    const umlautLesson = curriculum.lessons.find(
      (lesson) => lesson.focusAtoms.includes('final:ue') && lesson.focusAtoms.includes('final:ve'),
    )
    ctx.ok(Boolean(umlautLesson), `${schemeId}: 缺少 üe/ve 同键课`)
    if (umlautLesson) {
      ctx.ok(umlautLesson.title === '韵母 · ü / üe / ve', `${schemeId}: ü 家族课标题应为「韵母 · ü / üe / ve」`)
      if (diff.learnFinals.includes('v')) {
        ctx.ok(umlautLesson.focusAtoms.includes('final:v'), `${schemeId}: üe/ve 同键课未覆盖 final:v`)
      }
    }
    // 零声母全表课（按数据特征定位）：focus 恰为全部 learn zero 原子
    const ruleAtoms = curriculum.lessons.flatMap((lesson) =>
      lesson.focusAtoms.filter((atom) => atom.startsWith('rule:')),
    )
    ctx.ok(ruleAtoms.length === 0, `${schemeId}: focus 中不得出现 rule 原子：${ruleAtoms.join(',')}`)
    const zeroTableLesson = curriculum.lessons.find(
      (lesson) =>
        lesson.focusAtoms.length === learnZerosCount &&
        lesson.focusAtoms.every((atom) => atom.startsWith('zero:')),
    )
    ctx.ok(Boolean(zeroTableLesson), `${schemeId}: 缺少零声母全表课（focus 恰为 ${learnZerosCount} 个 learn zero）`)
    if (zeroTableLesson) {
      const zeroAtoms = zeroTableLesson.focusAtoms
      const expectedTitle = `零声母 · ${learnZerosCount} 个音节`
      ctx.ok(zeroTableLesson.title === expectedTitle, `${schemeId}: 零声母全表课标题应为「${expectedTitle}」`)
      ctx.ok(
        new Set(zeroAtoms.map((atom) => atom.slice(5))).size === learnZerosCount &&
          learnZeros.every((zero) => zeroAtoms.includes(`zero:${zero}`)),
        `${schemeId}: 零声母全表课 zero 集合应等于 learn zero`,
      )
      ctx.ok(zeroTableLesson.blockingAtoms.length === 0, `${schemeId}: 零声母全表课不应有阻塞原子`)
      ctx.ok(
        zeroTableLesson.zeroExamples.length === learnZerosCount,
        `${schemeId}: 零声母全表课 zeroExamples 应为 ${learnZerosCount} 条`,
      )
    }
  }
}
