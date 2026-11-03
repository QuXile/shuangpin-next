/**
 * 课程校验：
 * - 定制方案读取 curriculum/<id>.json，校验课程源数据；
 * - 其余方案调用 core buildUniversalCurriculum 生成通用课程并校验基本结构；
 * - 课程源数据只含章节、课程结构与人工文案。
 */
import fs from 'node:fs'
import path from 'node:path'
import { buildUniversalCurriculum, hydrateCurriculum } from '../../packages/core/src/index.ts'
import { SCHEME_DIR } from '../lib/data-contract.mjs'

const TITLE_RE = /^(入门|声母|零声母|韵母|同键|复习|期中|综合|通关) · (.+)$/
const LESSON_FIELDS = new Set(['id', 'chapterId', 'kind', 'title', 'desc', 'focusAtoms', 'passCriteria', 'tips'])
const CODE_TIP_RE = /^(推荐码：|兼容映射：)/

function validateChapters(ctx, schemeId, chapters) {
  ctx.ok(Array.isArray(chapters) && chapters.length > 0, `${schemeId}: chapters 为空`)
  const ids = new Set()
  ;(chapters ?? []).forEach((chapter, index) => {
    ctx.ok(Boolean(chapter.id && chapter.title && chapter.subtitle), `${schemeId}: 章节字段缺失`)
    ctx.ok(!ids.has(chapter.id), `${schemeId}: 章节 id 重复：${chapter.id}`)
    ids.add(chapter.id)
    ctx.ok(chapter.order === index + 1, `${schemeId}/${chapter.id}: order 应为 ${index + 1}`)
  })
  return ids
}

function validateLessons(ctx, schemeId, lessonList, chapterIds, allowDerived = false) {
  ctx.ok(Array.isArray(lessonList) && lessonList.length > 0, `${schemeId}: lessons 为空`)
  const ids = new Set()
  const chapterCounts = new Map()
  for (const lesson of lessonList ?? []) {
    const label = `${schemeId}/${lesson.id ?? '?'}`
    for (const key of Object.keys(lesson)) {
      const derived = ['blockingAtoms', 'nonBlockingAtoms', 'prerequisites', 'wordPlan'].includes(key)
      ctx.ok(LESSON_FIELDS.has(key) || (allowDerived && derived), `${label}: 不允许的课程字段 ${key}`)
    }
    ctx.ok(!ids.has(lesson.id), `${label}: 课程 id 重复`)
    ids.add(lesson.id)
    ctx.ok(/^L(\d+)\.(\d+)$/.test(lesson.id ?? ''), `${label}: 课程 id 应为 L<章>.<课序>`)
    ctx.ok(chapterIds.has(lesson.chapterId), `${label}: 未知章节 ${lesson.chapterId}`)
    const seq = (chapterCounts.get(lesson.chapterId) ?? 0) + 1
    chapterCounts.set(lesson.chapterId, seq)
    ctx.ok(Number(lesson.id?.split('.')[1]) === seq, `${label}: 章内课序不连续`)
    ctx.ok(['intro', 'drill', 'review', 'exam'].includes(lesson.kind), `${label}: 非法课型 ${lesson.kind}`)
    ctx.ok(TITLE_RE.test(lesson.title ?? ''), `${label}: 标题应为「类别 · 内容」`)
    ctx.ok(typeof lesson.desc === 'string' && lesson.desc.length > 0, `${label}: desc 为空`)
    ctx.ok(Array.isArray(lesson.focusAtoms), `${label}: focusAtoms 非法`)
    for (const atom of lesson.focusAtoms ?? []) {
      ctx.ok(/^(initial|final|zero):/.test(atom), `${label}: 非法原子 ${atom}`)
    }
    if (lesson.kind === 'intro') {
      ctx.ok(lesson.passCriteria === undefined, `${label}: 入门课不应写 passCriteria`)
    } else {
      ctx.ok(Boolean(lesson.passCriteria), `${label}: 缺 passCriteria`)
    }
    const tips = lesson.tips ?? []
    ctx.ok(tips.length <= 4, `${label}: tips 超过 4 条`)
    ctx.ok(
      tips.every((tip) => typeof tip === 'string' && tip.trim().length > 0 && !CODE_TIP_RE.test(tip)),
      `${label}: tips 非法`,
    )
  }
}

function validateGenerated(ctx, schemeId, scheme) {
  let curriculum
  try {
    curriculum = buildUniversalCurriculum(scheme)
  } catch (error) {
    ctx.ok(false, `${schemeId}: 通用课程生成失败：${error.message}`)
    return
  }
  const chapterIds = validateChapters(ctx, schemeId, curriculum.chapters)
  validateLessons(ctx, schemeId, curriculum.lessons, chapterIds, true)
  ctx.ok(curriculum.schemeId === schemeId, `${schemeId}: 通用课程 schemeId 不一致`)
  ctx.ok(curriculum.lessons.at(-1)?.kind === 'exam', `${schemeId}: 最后一课应为通关考核`)
}

export function validateCurriculum(ctx) {
  const index = ctx.schemeIndex
  if (!index) return
  const ids = (index.schemes ?? []).map((item) => item.id)
  const custom = new Set(index.customCourses ?? [])

  for (const schemeId of ids) {
    const file = path.join(SCHEME_DIR, schemeId, 'curriculum.json')
    ctx.ok(
      fs.existsSync(file) === custom.has(schemeId),
      `${schemeId}: curriculum.json 存在性应与 customCourses 一致`,
    )
  }

  for (const schemeId of ids) {
    const engineInfo = ctx.engines.get(schemeId)
    if (!engineInfo) continue
    if (!custom.has(schemeId)) {
      validateGenerated(ctx, schemeId, engineInfo.scheme)
      ctx.note(`课程：${schemeId} 运行时生成通用课程`)
      continue
    }
    const source = ctx.readDataJSON(`data/schemes/${schemeId}/curriculum.json`)
    if (!source) continue
    ctx.ok(
      JSON.stringify(Object.keys(source).sort()) === JSON.stringify(['chapters', 'lessons']),
      `${schemeId}: curriculum.json 只应包含 chapters / lessons`,
    )
    const chapterIds = validateChapters(ctx, schemeId, source.chapters)
    validateLessons(ctx, schemeId, source.lessons, chapterIds)
    let hydrated
    try {
      hydrated = hydrateCurriculum(schemeId, source)
    } catch (error) {
      ctx.ok(false, `${schemeId}: 课程源数据无法补齐：${error.message}`)
      continue
    }
    ctx.ok(hydrated.lessons.at(-1)?.kind === 'exam', `${schemeId}: 最后一课应为通关考核`)
    ctx.note(`课程：${schemeId} 定制课程 ${source.lessons.length} 课`)
  }
}
