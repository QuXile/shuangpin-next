#!/usr/bin/env node
/**
 * 通用课程生成器。
 *
 * 只为「没有定制课程路线」的方案生成通用 curriculum；已有定制路线的方案
 * （curriculum.supportLevel === 'full'）一律跳过、原样保留。
 *
 *  - 第一章：通用入门；
 *  - 内容章顺序见 scripts/lib/curriculum-template.mjs 的 MODULES；
 *  - 内容章只给 learn 原子单独设课（每原子一课、不合并），章末生成复习课；
 *    free 原子（与全拼一致）直接作为已会内容，不单独排课；
 *  - 期中：按「左右新课数差最小 → 章数差最小 → 更早边界」选章间边界插入，
 *    独立成章、只有复习课；
 *  - 最终章：综合练习 → 速度练习 → 最终考核（考核必须是最后一课）；
 *  - 推荐码例外（recommended != 主键组合）与兼容编码不单独设课，按
 *    「目标音节最后学到的 learn 原子」归组写入对应原子课 tips；两端都是 free
 *    原子的归到「综合 · 混合练习」tips。
 *
 * 生成结果只写 data/schemes/<id>/curriculum.json 与 data/schemes/index.json 的课程能力字段
 * （课程清单由 index.json.courseSupported 派生，不再有独立课程索引文件）。
 * 生成后还需运行 `pnpm data:sync`。
 *
 * 本文件只导出 buildUniversalCurriculum 供 validate 直接 import（generateAll 由主入口调用）；
 * 只有在命令行直接运行（node scripts/generate-universal-curriculum.mjs）时才执行生成。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyzeSchemeCodes, atomId, createSchemeEngine, parseAtomId } from '../packages/core/src/index.ts'
import {
  LEXICON_FILE,
  SCHEME_DIR,
  SCHEME_INDEX_FILE,
  curriculumVersionOf,
  readJSON,
  writeJSON,
} from './lib/data-contract.mjs'
import { resolveLexicon } from './lib/pinyin-resolve.mjs'
import {
  CODE_TIP_COMPAT_PREFIX,
  CODE_TIP_RECOMMENDED_PREFIX,
  CURRICULUM_VERSION,
  PASS_ACCURACY,
  PASS_EXAM,
  PASS_REVIEW,
  PASS_SPEED,
  STAGE_MIN_BY_KIND,
  TEMPLATE_VERSION,
  WORD_PLAN_DEFAULT,
  WORD_PLAN_INTRO,
  buildContentModules,
  chooseMidBoundary,
  freeAtomIdsOf,
  groupCodeEntries,
  isFreeAtom,
  keysOfAtom,
} from './lib/curriculum-template.mjs'

const SELF_OWNED_SUPPORT = 'full'
const GENERATED_SUPPORT = 'simplified'
/** 一条 tips 里最多压缩几个编码条目（C 双拼这类例外多的方案会分多条 tip）。 */
const CODE_TIPS_CHUNK = 5

// ── 课程内容 ──────────────────────────────────────────────────

function upperKeys(keys) {
  return keys.map((key) => key.toUpperCase()).join(' / ')
}

function buildAtomMeta(scheme, engine, freeSets, atom, lexicon) {
  const ref = parseAtomId(atom)
  const { type, key } = ref
  const keys = engine.keysForAtom(atom)
  const free = isFreeAtom(atom, freeSets)
  const meta = {
    atomId: atom,
    type,
    pinyin: key,
    keys: [...keys],
    free,
  }
  const keyText = upperKeys(keys)
  const primaryKey = keys[0]
  const anchors = []
  if (primaryKey && (type === 'initial' || type === 'final')) {
    // 只取和主键「同键」的另一侧原子：声母课找同键韵母，韵母课找同键声母。
    const otherType = type === 'initial' ? 'final' : 'initial'
    const otherTable = otherType === 'initial' ? scheme.initials : scheme.finals
    const otherKeys = Object.keys(otherTable ?? {}).filter((other) =>
      keysOfAtom(scheme, atomId(otherType, other)).includes(primaryKey),
    )
    if (otherKeys.length > 0) {
      const wanted = new Set(otherKeys)
      const entries = Array.isArray(lexicon?.chars) ? lexicon.chars : []
      const matched = entries
        .filter((entry) =>
          entry.syllables?.some((syllable) =>
            type === 'initial'
              ? syllable.initial === key && wanted.has(syllable.final)
              : syllable.final === key && wanted.has(syllable.initial),
          ),
        )
        .sort((a, b) => (a.freqRank ?? Number.MAX_SAFE_INTEGER) - (b.freqRank ?? Number.MAX_SAFE_INTEGER))
      anchors.push(...[...new Set(matched.map((entry) => entry.text))].slice(0, 5))
    }
  }
  if (anchors.length > 0) {
    meta.anchors = anchors
    meta.mnemonic = type === 'initial'
      ? `同键韵母字：${anchors.join('、')}`
      : `同键声母字：${anchors.join('、')}`
  } else if (type === 'zero') {
    meta.mnemonic = `零声母 ${key} = ${keyText}，整段输入`
  }
  return meta
}

function zeroExamplesOf(focusAtoms, lexicon) {
  const examples = []
  for (const atom of focusAtoms) {
    if (!atom.startsWith('zero:')) continue
    const syllable = atom.slice('zero:'.length)
    const example = lexicon?.syllableExamples?.[syllable]
    if (!example) {
      throw new Error(`Lexicon 缺少零声母音节示例：${syllable}`)
    }
    const item = { syllable, char: example.char }
    if (typeof example.tone === 'number') item.tone = example.tone
    examples.push(item)
  }
  return examples
}

// ── 推荐码 / 兼容编码 tips ──────────────────────────────────

function formatCodeEntry(entry) {
  const upper = (value) => value.toUpperCase()
  const parts = []
  if (entry.recommended) {
    parts.push(`${CODE_TIP_RECOMMENDED_PREFIX}${entry.syllable} 所推荐的键位组合为特别的 ${upper(entry.recommended)}`)
  }
  if (entry.compat.length > 0) {
    parts.push(`${CODE_TIP_COMPAT_PREFIX}${entry.syllable} 兼容的特别键位组合还包括 ${entry.compat.map((value) => upper(value)).join(' / ')}`)
  }
  return parts.join('；')
}

/** 编码条目压缩为 tips：每 CODE_TIPS_CHUNK 条一组，避免 C 双拼单个课 tips 过长。 */
function codeTipsFor(entries) {
  if (!entries || entries.length === 0) return []
  const tips = []
  for (let index = 0; index < entries.length; index += CODE_TIPS_CHUNK) {
    const chunk = entries.slice(index, index + CODE_TIPS_CHUNK)
    tips.push(chunk.map(formatCodeEntry).join('；'))
  }
  return tips
}

// ── 章节 / 课程装配 ───────────────────────────────────────────

function moduleSubtitle(module) {
  if (module.atoms.length > 6) {
    return `${module.atoms.length} 个${module.type === 'zero' ? '音节' : '键位'} · 逐个教学`
  }
  return module.atoms.join(' · ')
}

function emptyChapter(id, title, subtitle) {
  return { id, title, subtitle, lessons: [] }
}

/**
 * 生成一套通用课程。
 * @param {{ scheme: object, schemeName?: string, generatedAt?: string, lexicon: { syllableExamples: Record<string, {char: string, tone?: number}> } }} input
 * @returns {import('../packages/core/src/types.ts').Curriculum}
 */
export function buildUniversalCurriculum({ scheme, schemeName, generatedAt, lexicon }) {
  const engine = createSchemeEngine(scheme)
  const freeSets = engine.freeSets()
  const freeAtoms = freeAtomIdsOf(scheme, freeSets)
  const modules = buildContentModules(scheme, freeSets)
  const boundary = chooseMidBoundary(modules)
  const codeAnalysis = groupCodeEntries(analyzeSchemeCodes(scheme), modules, freeSets)
  const learned = []
  const chapterEntries = []

  const addChapter = (id, title, subtitle) => {
    const chapter = emptyChapter(id, title, subtitle)
    chapterEntries.push(chapter)
    return chapter
  }

  const makeLesson = (kind, title, desc, focusAtoms, options = {}) => {
    const focus = [...focusAtoms]
    const lesson = {
      id: '',
      chapterId: '',
      kind,
      title,
      desc,
      focusAtoms: focus,
      blockingAtoms: focus.filter((atom) => atom.startsWith('initial:') || atom.startsWith('final:')),
      nonBlockingAtoms: focus.filter((atom) => atom.startsWith('zero:')),
      prerequisites: [...learned],
      wordPlan: options.wordPlan
        ? { ...options.wordPlan }
        : kind === 'intro'
          ? { ...WORD_PLAN_INTRO }
          : { ...WORD_PLAN_DEFAULT },
      atomMeta: {},
      zeroExamples: zeroExamplesOf(focus, lexicon),
      tips: [],
      stageMinWords: kind === 'intro' ? {} : { ...STAGE_MIN_BY_KIND[kind] },
    }
    for (const atom of focus) lesson.atomMeta[atom] = buildAtomMeta(scheme, engine, freeSets, atom, lexicon)
    if (kind !== 'intro') {
      lesson.passCriteria = { ...(options.passCriteria ?? PASS_REVIEW) }
    }
    return lesson
  }

  const addLesson = (chapter, lesson) => {
    chapter.lessons.push(lesson)
    return lesson
  }

  // ── 第一章：入门 ──
  const introChapter = addChapter('ch-intro', '入门', '认识双拼')
  addLesson(
    introChapter,
    makeLesson('intro', '入门 · 认识双拼', '一声母一韵母两键；先看提示打对，再逐步撤掉提示。', []),
  )
  // free 原子已经会，直接进入 prerequisites，不再单独生成「全拼沿用」复习课。
  learned.push(...freeAtoms)

  // ── 内容章（含期中插入） ──
  const addMidChapter = () => {
    const chapter = addChapter(
      'ch-mid',
      '期中',
      `前 ${boundary.index} 个内容章混合检验 · 先准确后速度`,
    )
    addLesson(
      chapter,
      makeLesson('review', '期中 · 混合练习', '期中：前半程内容混合检验，先准确后速度。', [...learned], {
        passCriteria: PASS_REVIEW,
      }),
    )
    addLesson(
      chapter,
      makeLesson('review', '期中 · 速度练习', '期中速度练习：目标 45 WPM 起。', [...learned], {
        passCriteria: PASS_SPEED,
      }),
    )
  }

  modules.forEach((module, moduleIndex) => {
    if (boundary && boundary.index === moduleIndex) addMidChapter()
    const chapter = addChapter(`ch-${module.key}`, module.title, moduleSubtitle(module))
    for (const key of module.atoms) {
      const atom = atomId(module.type, key)
      const keys = keysOfAtom(scheme, atom)
      const keyText = upperKeys(keys)
      const title =
        module.type === 'initial'
          ? `声母 · ${key}`
          : module.type === 'final'
            ? `韵母 · ${key}`
            : `零声母 · ${key}`
      const desc =
        module.type === 'zero'
          ? `零声母 ${key}：整段输入 ${keyText}。先练单字，再练词语。`
          : `新键：${key}。先练单字，再练词语。`
      const lesson = makeLesson('drill', title, desc, [atom], {
        passCriteria: PASS_ACCURACY,
      })
      lesson.tips = codeTipsFor(codeAnalysis.groups.get(atom))
      addLesson(chapter, lesson)
      learned.push(atom)
    }
    // 章末复习只覆盖本章原子；只有期中 / 综合 / 期末做累计复习。
    const chapterAtoms = module.atoms.map((key) => atomId(module.type, key))
    addLesson(
      chapter,
      makeLesson('review', `复习 · ${module.title}`, `复习：${module.title}刚学的键位；先准确后速度。`, chapterAtoms, {
        passCriteria: PASS_REVIEW,
      }),
    )
  })

  // ── 最终章 ──
  const finalChapter = addChapter('ch-final', '最终章', '综合 · 速度 · 最终考核')
  addLesson(
    finalChapter,
    makeLesson('review', '综合 · 混合练习', '综合：全部内容混合练习。', [...learned], {
      passCriteria: PASS_REVIEW,
    }),
  )
  addLesson(
    finalChapter,
    makeLesson('review', '综合 · 速度练习', '速度：全部内容速度冲刺，目标 45 WPM 起。', [...learned], {
      passCriteria: PASS_SPEED,
    }),
  )
  addLesson(
    finalChapter,
    makeLesson('exam', '通关 · 最终考核', '无提示 + 限时：正确率与速度同时达标才能通关。', [...learned], {
      passCriteria: PASS_EXAM,
    }),
  )

  // ── 章节序号与课程 id ──
  const chapters = chapterEntries.map((chapter, index) => ({
    id: chapter.id,
    order: index + 1,
    title: chapter.title,
    subtitle: chapter.subtitle,
  }))
  const lessons = []
  chapterEntries.forEach((chapter, chapterIndex) => {
    chapter.lessons.forEach((lesson, lessonIndex) => {
      lessons.push({
        ...lesson,
        id: `L${chapterIndex + 1}.${lessonIndex + 1}`,
        chapterId: chapter.id,
      })
    })
  })

  // 两边都是 free 原子的编码没有合适的原子课，统一放到第一个非入门课。
  const freeCodeTips = codeTipsFor(codeAnalysis.groups.get('free') ?? [])
  if (freeCodeTips.length > 0) {
    const firstDrill = lessons.find((lesson) => lesson.kind === 'drill')
    if (firstDrill) firstDrill.tips.push(...freeCodeTips)
  }

  return {
    schemeId: scheme.id,
    schemeName: schemeName ?? scheme.name ?? scheme.id,
    schemeType: scheme.type,
    version: CURRICULUM_VERSION,
    templateVersion: TEMPLATE_VERSION,
    generatedAt,
    supportLevel: GENERATED_SUPPORT,
    origin: 'generated',
    dataVersion: curriculumVersionOf(chapters, lessons),
    chapters,
    lessons,
  }
}

// ── 索引更新 ──────────────────────────────────────────────────

const GENERATED_COURSE = Object.freeze({
  supportsGuidedCourse: true,
  courseTier: 'simplified',
  reason: '没有定制课程路线：使用自动生成的通用课程，learn 原子逐课 + 期中 / 最终章。',
  courseNotes: '通用课程由 scripts/generate-universal-curriculum.mjs 生成；推荐码 / 兼容编码信息写在对应原子课 tips。',
})

function updateSchemeIndex(schemeIndex, courseIds) {
  const schemeIds = new Set(courseIds)
  schemeIndex.courseSupported = [...courseIds]
  for (const summary of schemeIndex.schemes ?? []) {
    const curriculumFile = path.join(SCHEME_DIR, summary.id, 'curriculum.json')
    const existing = fs.existsSync(curriculumFile) ? readJSON(curriculumFile) : null
    if (existing?.supportLevel === SELF_OWNED_SUPPORT) continue
    if (!schemeIds.has(summary.id)) continue
    summary.course = { ...GENERATED_COURSE }
  }
  return schemeIndex
}

/** 读取方案源数据并生成全部「无定制路线」的通用课程 + 索引。返回生成统计。 */
function generateAll() {
  const schemeIndex = readJSON(SCHEME_INDEX_FILE)
  const lexicon = resolveLexicon(readJSON(LEXICON_FILE))
  const generated = []
  const skipped = []
  for (const summary of schemeIndex.schemes ?? []) {
    const schemeFile = path.join(SCHEME_DIR, summary.id, 'scheme.json')
    if (!fs.existsSync(schemeFile)) continue
    const scheme = readJSON(schemeFile)
    const curriculumFile = path.join(SCHEME_DIR, summary.id, 'curriculum.json')
    const existing = fs.existsSync(curriculumFile) ? readJSON(curriculumFile) : null
    if (existing?.supportLevel === SELF_OWNED_SUPPORT) {
      skipped.push(summary.id)
      continue
    }
    const curriculum = buildUniversalCurriculum({
      scheme,
      schemeName: scheme.name ?? summary.name,
      generatedAt: existing?.generatedAt ?? new Date().toISOString(),
      lexicon,
    })
    writeJSON(curriculumFile, curriculum)
    generated.push({ id: summary.id, curriculum })
  }

  const courseIds = [...generated, ...skipped.map((id) => ({ id }))]
    .map((item) => item.id)
    .sort((a, b) => {
      const order = schemeIndex.recommendedOrder ?? []
      return order.indexOf(a) - order.indexOf(b)
    })
  updateSchemeIndex(schemeIndex, courseIds)
  writeJSON(SCHEME_INDEX_FILE, schemeIndex)

  const stats = generated.map(({ id, curriculum }) => ({
    id,
    chapters: curriculum.chapters.length,
    lessons: curriculum.lessons.length,
    drills: curriculum.lessons.filter((lesson) => lesson.kind === 'drill').length,
    reviews: curriculum.lessons.filter((lesson) => lesson.kind === 'review').length,
    dataVersion: curriculum.dataVersion,
  }))
  for (const item of stats) {
    console.log(`[curriculum] ${item.id}: ${item.chapters} 章 / ${item.lessons} 课（${item.drills} 新课、${item.reviews} 复习） ${item.dataVersion}`)
  }
  console.log(`[curriculum] 生成 ${generated.length} 套通用课程；保留定制路线 ${skipped.length} 套（${skipped.join(', ')}）`)
  console.log(`[curriculum] courseSupported = ${courseIds.length} 套`)
  return { generated: stats, skipped, courseIds }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    generateAll()
  } catch (error) {
    console.error('❌ 通用课程生成失败：', error)
    process.exitCode = 1
  }
}
