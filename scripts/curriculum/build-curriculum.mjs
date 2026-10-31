#!/usr/bin/env node
/**
 * 课程生成器：把固定课程模板实例化为 5 套方案的可执行课程 JSON。
 *
 * 生成规则：
 *   - 40 课 / 10 章；intro 1 / drill 27 / review 11 / exam 1；326 分钟；
 *   - 同键双韵合并；期中章（L5.1/L5.2）与综合章（L9.1/L9.2）为 cumulative 混合/速度；
 *   - 课程范围只包含具体知识点（initial/final/zero），不再有 rule 原子；
 *   - L2.4「零声母 · 12 个音节」一次性覆盖全部 12 个 zero 原子（zeroTable）；
 *   - L8.4「复习 · u 与 ü 家族」reviewFamily='u-ü'，无 inheritZero；
 *   - L2.1 firstPractice：tips 合并 jqxy ü + 多音字提示；
 *   - tips 由 scripts/curriculum/content.mjs 的 buildLessonTips 生成；
 *   - atomMeta 写入 anchors / mnemonic（data/words/anchors.json + 方案键位）；
 *   - dataVersion = curriculum-<12hex>（sha256(JSON.stringify({chapters,lessons}))）。
 *
 * 用法：node scripts/curriculum/build-curriculum.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  createSchemeEngine,
  FINALS,
  ZERO_INITIALS,
  toToneMarks,
} from '../../packages/core/src/index.ts'
import {
  ANCHORS_FILE,
  CURRICULUM_DIR,
  CURRICULUM_INDEX_FILE,
  SCHEME_DIR,
  SCHEME_INDEX_FILE,
  TEMPLATE_VERSION,
  CURRICULUM_VERSION,
  WORDS_FILE,
  SYLLABLE_PATCH_FILE,
  curriculumVersionOf,
  exists,
  readJSON,
  writeJSON,
} from '../lib/data-contract.mjs'
import { buildLessonTips } from './content.mjs'
import { charTone } from '../word-pipeline/lib/wordbank.mjs'

// ── 课程结构：10 章 / 40 课（章 order 1..10；课 id = L<章>.<课序>） ──

const CHAPTERS = [
  { id: 'ch-intro', order: 1, title: '认识双拼', subtitle: '原理与键位图 · 建立两键直觉' },
  { id: 'ch-basic', order: 2, title: '声母与零声母', subtitle: '改造声母 + 零声母 · 打牢基础' },
  { id: 'ch-a', order: 3, title: 'a 家族', subtitle: '开口组 → 介音组 → 同键双韵' },
  { id: 'ch-o', order: 4, title: 'o 家族', subtitle: 'o 家族 · 同键对照' },
  { id: 'ch-mid', order: 5, title: '期中检验', subtitle: '前四章混合检验 · 先准确后速度' },
  { id: 'ch-e', order: 6, title: 'e 家族', subtitle: '前后鼻音对比 · 家族复习' },
  { id: 'ch-i', order: 7, title: 'i 家族', subtitle: 'i 介音家族 · 家族复习' },
  { id: 'ch-u', order: 8, title: 'u 与 ü 家族', subtitle: 'ui/un 与 ü 组 · 家族复习' },
  { id: 'ch-sprint', order: 9, title: '综合冲刺', subtitle: '全量混合 · 速度冲刺' },
  { id: 'ch-exam', order: 10, title: '通关考核', subtitle: '全遮挡考核 · 与入门呼应' },
]

/** 12 个零声母音节（core ZERO_INITIALS 为唯一顺序）。 */
const ALL_ZERO = [...ZERO_INITIALS]

const TEMPLATE = [
  // ── 1 认识双拼 ───────────────────────────────────────────
  { id: 'L1.1', chapterId: 'ch-intro', kind: 'intro', title: '入门 · 认识双拼', estimatedMinutes: 4,
    focus: [], desc: '一声母一韵母两键；键位图；三行卡；先看单字、再练词语' },

  // ── 2 声母与零声母 ───────────────────────────────────────
  { id: 'L2.1', chapterId: 'ch-basic', kind: 'drill', title: '声母 · zh', estimatedMinutes: 6,
    focusInitial: ['zh'], firstPractice: true, desc: '新键：zh。先练单字，再练词语' },
  { id: 'L2.2', chapterId: 'ch-basic', kind: 'drill', title: '声母 · ch', estimatedMinutes: 6,
    focusInitial: ['ch'], desc: '新键：ch。注意 i/u/v 键的双重身份' },
  { id: 'L2.3', chapterId: 'ch-basic', kind: 'drill', title: '声母 · sh', estimatedMinutes: 6,
    focusInitial: ['sh'], desc: '新键：sh。声母部分完成，先单字后词语' },
  { id: 'L2.4', chapterId: 'ch-basic', kind: 'drill', title: '零声母 · 12 个音节', estimatedMinutes: 8,
    zero: ALL_ZERO, zeroTable: true,
    desc: '逐个列出 12 个零声母音节的两键映射（字母式 / o+ 式由方案决定）' },
  { id: 'L2.5', chapterId: 'ch-basic', kind: 'review', title: '复习 · 声母与零声母', estimatedMinutes: 12,
    cumulative: true,
    desc: '范围：声母改造 + 零声母全表（按学习顺序累计复习）' },

  // ── 3 a 家族 ─────────────────────────────────────────────
  { id: 'L3.1', chapterId: 'ch-a', kind: 'drill', title: '韵母 · ai', estimatedMinutes: 6, focusFinal: ['ai'], desc: '新键：韵母 ai' },
  { id: 'L3.2', chapterId: 'ch-a', kind: 'drill', title: '韵母 · ao', estimatedMinutes: 6, focusFinal: ['ao'], desc: '新键：韵母 ao' },
  { id: 'L3.3', chapterId: 'ch-a', kind: 'drill', title: '韵母 · an', estimatedMinutes: 6, focusFinal: ['an'], desc: '新键：韵母 an（前鼻音）' },
  { id: 'L3.4', chapterId: 'ch-a', kind: 'drill', title: '韵母 · ang', estimatedMinutes: 6, focusFinal: ['ang'], desc: '新键：韵母 ang（后鼻音）' },
  { id: 'L3.5', chapterId: 'ch-a', kind: 'review', title: '复习 · a 家族开口组', estimatedMinutes: 12,
    reviewFamily: 'a-open', inheritZero: true,
    desc: '范围：ai/ao/an/ang + 本组零声母' },
  { id: 'L3.6', chapterId: 'ch-a', kind: 'drill', title: '同键 · ia / ua', estimatedMinutes: 8,
    focusFinal: ['ia', 'ua'], desc: '新键：ia / ua（同键双韵）' },
  { id: 'L3.7', chapterId: 'ch-a', kind: 'drill', title: '韵母 · iao', estimatedMinutes: 6, focusFinal: ['iao'], desc: '新键：韵母 iao' },
  { id: 'L3.8', chapterId: 'ch-a', kind: 'drill', title: '韵母 · ian', estimatedMinutes: 6, focusFinal: ['ian'], desc: '新键：韵母 ian' },
  { id: 'L3.9', chapterId: 'ch-a', kind: 'drill', title: '同键 · iang / uang', estimatedMinutes: 8,
    focusFinal: ['iang', 'uang'], desc: '新键：iang / uang（同键双韵）' },
  { id: 'L3.10', chapterId: 'ch-a', kind: 'drill', title: '韵母 · uai', estimatedMinutes: 6, focusFinal: ['uai'], desc: '新键：韵母 uai' },
  { id: 'L3.11', chapterId: 'ch-a', kind: 'drill', title: '韵母 · uan', estimatedMinutes: 6, focusFinal: ['uan'], desc: '新键：韵母 uan' },
  { id: 'L3.12', chapterId: 'ch-a', kind: 'review', title: '复习 · a 家族', estimatedMinutes: 13,
    reviewFamily: 'a', inheritZero: true, desc: '范围：a 家族全部韵母 + 本家族零声母' },

  // ── 4 o 家族 ─────────────────────────────────────────────
  { id: 'L4.1', chapterId: 'ch-o', kind: 'drill', title: '韵母 · uo', estimatedMinutes: 6, focusFinal: ['uo'], desc: '新键：韵母 uo' },
  { id: 'L4.2', chapterId: 'ch-o', kind: 'drill', title: '韵母 · ou', estimatedMinutes: 6, focusFinal: ['ou'], desc: '新键：韵母 ou' },
  { id: 'L4.3', chapterId: 'ch-o', kind: 'drill', title: '同键 · ong / iong', estimatedMinutes: 8,
    focusFinal: ['ong', 'iong'], desc: '新键：ong / iong（同键双韵）' },
  { id: 'L4.4', chapterId: 'ch-o', kind: 'review', title: '复习 · o 家族', estimatedMinutes: 12,
    reviewFamily: 'o', inheritZero: true, desc: '范围：o 家族 + 本家族零声母' },

  // ── 5 期中检验（cumulative） ──────────────────────────────
  { id: 'L5.1', chapterId: 'ch-mid', kind: 'review', title: '期中 · 混合练习', estimatedMinutes: 12,
    cumulative: true, checkpoint: true,
    desc: '检验：前四章混合练习，准确率优先' },
  { id: 'L5.2', chapterId: 'ch-mid', kind: 'review', title: '期中 · 速度练习', estimatedMinutes: 14,
    cumulative: true, checkpoint: true, speed: 'mid',
    desc: '检验：前四章速度练习，与综合速度同标准，目标 ≥30 WPM' },

  // ── 6 e 家族 ─────────────────────────────────────────────
  { id: 'L6.1', chapterId: 'ch-e', kind: 'drill', title: '韵母 · ei', estimatedMinutes: 6, focusFinal: ['ei'], desc: '新键：韵母 ei' },
  { id: 'L6.2', chapterId: 'ch-e', kind: 'drill', title: '韵母 · en', estimatedMinutes: 6, focusFinal: ['en'], desc: '新键：韵母 en' },
  { id: 'L6.3', chapterId: 'ch-e', kind: 'drill', title: '韵母 · eng', estimatedMinutes: 6, focusFinal: ['eng'], desc: '新键：韵母 eng（与 en 对比）' },
  { id: 'L6.4', chapterId: 'ch-e', kind: 'review', title: '复习 · e 家族', estimatedMinutes: 13,
    reviewFamily: 'e', inheritZero: true, desc: '范围：e 家族 + 零声母 er' },

  // ── 7 i 家族 ─────────────────────────────────────────────
  { id: 'L7.1', chapterId: 'ch-i', kind: 'drill', title: '韵母 · in', estimatedMinutes: 6, focusFinal: ['in'], desc: '新键：韵母 in' },
  { id: 'L7.2', chapterId: 'ch-i', kind: 'drill', title: '韵母 · ing', estimatedMinutes: 6, focusFinal: ['ing'], desc: '新键：韵母 ing（与 in 对比）' },
  { id: 'L7.3', chapterId: 'ch-i', kind: 'drill', title: '韵母 · ie', estimatedMinutes: 6, focusFinal: ['ie'], desc: '新键：韵母 ie' },
  { id: 'L7.4', chapterId: 'ch-i', kind: 'drill', title: '韵母 · iu', estimatedMinutes: 6, focusFinal: ['iu'], desc: '新键：韵母 iu' },
  { id: 'L7.5', chapterId: 'ch-i', kind: 'review', title: '复习 · i 家族', estimatedMinutes: 13,
    reviewFamily: 'i', inheritZero: true, desc: '范围：i 家族' },

  // ── 8 u 与 ü 家族 ────────────────────────────────────────
  { id: 'L8.1', chapterId: 'ch-u', kind: 'drill', title: '韵母 · ui', estimatedMinutes: 6, focusFinal: ['ui'], desc: '新键：韵母 ui' },
  { id: 'L8.2', chapterId: 'ch-u', kind: 'drill', title: '韵母 · un', estimatedMinutes: 6, focusFinal: ['un'], desc: '新键：韵母 un' },
  { id: 'L8.3', chapterId: 'ch-u', kind: 'drill', title: '韵母 · ü / üe / ve', estimatedMinutes: 8,
    focusFinal: ['ue', 've'], umlaut: true, desc: '新键：üe 的 ue / ve 两种拼写' },
  { id: 'L8.4', chapterId: 'ch-u', kind: 'review', title: '复习 · u 与 ü 家族', estimatedMinutes: 12,
    reviewFamily: 'u-ü', desc: '范围：u 与 ü 家族（ui/un/ue/ve）' },

  // ── 9 综合冲刺（cumulative） ──────────────────────────────
  { id: 'L9.1', chapterId: 'ch-sprint', kind: 'review', title: '综合 · 混合练习', estimatedMinutes: 11,
    cumulative: true, checkpoint: true, desc: '综合：全量混合练习' },
  { id: 'L9.2', chapterId: 'ch-sprint', kind: 'review', title: '综合 · 速度练习', estimatedMinutes: 12,
    cumulative: true, checkpoint: true, speed: 'full', desc: '速度：全量速度冲刺，目标 ≥30 WPM' },

  // ── 10 通关考核 ───────────────────────────────────────────
  { id: 'L10.1', chapterId: 'ch-exam', kind: 'exam', title: '通关 · 最终考核', estimatedMinutes: 14,
    cumulative: true, checkpoint: true, desc: '全遮挡 + 限时；通过后课程完成' },
]

/** 家族成员（课程设计常量，与方案无关） */
const FAMILIES = {
  'a-open': ['ai', 'ao', 'an', 'ang'],
  a: ['ai', 'ao', 'an', 'ang', 'ia', 'iao', 'ian', 'iang', 'ua', 'uai', 'uan', 'uang'],
  o: ['uo', 'ou', 'ong', 'iong'],
  e: ['ei', 'en', 'eng'],
  i: ['in', 'ing', 'ie', 'iu'],
  'u-ü': ['ui', 'un', 'ue', 've'],
}
const ZERO_BY_FAMILY = {
  'a-open': ['ai', 'an', 'ang', 'ao'],
  a: ['ai', 'an', 'ang', 'ao'],
  o: ['o', 'ou'],
  e: ['ei', 'en', 'eng', 'er'],
  i: [],
  'u-ü': [],
}
const UMLAUT_FAMILY = new Set(['final:v', 'final:ve', 'final:ue'])
const TITLE_CATEGORIES = ['入门', '声母', '零声母', '韵母', '同键', '复习', '期中', '综合', '通关']
const CUMULATIVE_CATEGORIES = new Set(['期中', '综合', '通关'])

// ── atomMeta / 记忆锚点 ──────────────────────────────────────

/** 生成原子的 anchors/mnemonic（数据驱动）。 */
function memoryFor(type, key, atomMeta, scheme, anchors) {
  const keys = atomMeta.keys.map((item) => String(item).toLowerCase())
  const primaryKey = keys[0] ?? ''
  const syllableChars = anchors.syllableChars ?? {}
  if (type === 'final') {
    const syllable = `${primaryKey}${key}`
    const fallbackAnchors = anchors.finalChars?.[key]?.slice(0, 5) ?? []
    const anchorList = syllableChars[syllable]?.slice(0, 5) ?? fallbackAnchors
    const mnemonic = syllableChars[syllable]
      ? `${primaryKey.toUpperCase()} + ${key.toUpperCase()} = ${syllable.toUpperCase()}`
      : `${key.toUpperCase()} 在 ${primaryKey.toUpperCase()} 键` +
        (fallbackAnchors.length > 0 ? `：${fallbackAnchors.slice(0, 3).join('、')}` : '')
    return { anchors: anchorList, mnemonic }
  }
  if (type === 'initial') {
    let partner = null
    for (const final of FINALS) {
      const tableKeys = (scheme.finals?.[final] ?? []).map((item) => String(item).toLowerCase())
      if (!tableKeys.includes(primaryKey)) continue
      if ((syllableChars[`${key}${final}`] ?? []).length > 0) {
        partner = final
        break
      }
    }
    if (partner) {
      const syllable = `${key}${partner}`
      return {
        anchors: syllableChars[syllable].slice(0, 5),
        mnemonic: `${key.toUpperCase()} + ${partner.toUpperCase()} = ${syllable.toUpperCase()}（同在 ${primaryKey.toUpperCase()} 键）`,
      }
    }
    const fallbackAnchors = anchors.initialChars?.[key]?.slice(0, 5) ?? []
    return {
      anchors: fallbackAnchors,
      mnemonic: `${key.toUpperCase()} 在 ${primaryKey.toUpperCase()} 键` +
        (fallbackAnchors.length > 0 ? `：${fallbackAnchors.slice(0, 3).join('、')}` : ''),
    }
  }
  // zero：映射由 L2.4 全表 focus 标签 / 12 张示例 / tips 清单展示，不生成锚点，避免 12 行冗余。
  return null
}

function buildAtomMeta(scheme, diff, atomId, anchors) {
  const [type, key] = atomId.split(':')
  if (type === 'initial') {
    const keys = scheme.initials?.[key]
    if (!keys) return null
    const meta = { atomId, type, pinyin: key, keys, free: diff.freeInitials.includes(key) }
    const memory = memoryFor(type, key, meta, scheme, anchors)
    if (memory?.anchors?.length) meta.anchors = memory.anchors
    if (memory?.mnemonic) meta.mnemonic = memory.mnemonic
    return meta
  }
  if (type === 'final') {
    const keys = scheme.finals?.[key]
    if (!keys) return null
    const meta = { atomId, type, pinyin: key, keys, free: diff.freeFinals.includes(key) }
    const memory = memoryFor(type, key, meta, scheme, anchors)
    if (memory?.anchors?.length) meta.anchors = memory.anchors
    if (memory?.mnemonic) meta.mnemonic = memory.mnemonic
    return meta
  }
  if (type === 'zero') {
    const keys = scheme.zeroInitial?.[key]
    if (!keys) return null
    return { atomId, type, pinyin: key, keys, free: diff.freeZero.includes(key) }
  }
  return null
}

// ── 课程字段 ─────────────────────────────────────────────────

function wordPlanFor(t) {
  if (t.kind === 'intro') return { maxUnfamiliar: 0, lengthRange: [2, 3] }
  // 所有正式练习允许 2–4 字词；零声母课也允许含零声母的 4 字成语进入练习。
  return { maxUnfamiliar: 0, lengthRange: [2, 5] }
}

function passCriteriaFor(t) {
  if (t.kind === 'intro') return undefined
  // 期中/综合速度使用相同速度专题标准；通关考核另用准确率+速度双门槛
  if (t.speed === 'mid') return { accuracy: 0.85, mode: 'speed', minCpm: 45, starCpm: [45, 60, 75] }
  if (t.speed === 'full') return { accuracy: 0.85, mode: 'speed', minCpm: 45, starCpm: [45, 60, 75] }
  if (t.kind === 'exam') return { accuracy: 0.85, mode: 'accuracy-speed', minCpm: 30, starCpm: [30, 40, 50] }
  // 普通复习课：正确率之外，速度至少 45 WPM
  if (t.kind === 'review') return { accuracy: 0.85, mode: 'accuracy', minCpm: 45 }
  return { accuracy: 0.85, mode: 'accuracy' }
}

/**
 * 阶段最低完成词数：统一「字 → 半遮挡词 → 全遮挡考核」。
 *   intro {}；drill {single:15, word:15, exam:25}；review {exam:50}；exam {exam:100}。
 */
function stageMinWordsFor(t) {
  if (t.kind === 'intro') return {}
  if (t.kind === 'exam') return { exam: 100 }
  if (t.kind === 'review') return { exam: 50 }
  return { single: 15, word: 15, exam: 25 }
}

/**
 * 同键双韵例词（手写逻辑审计：删除原先硬编码的 PAIR_EXAMPLES，改为从
 * data/words/words.sample.json 按韵母取最高频词中的代表字 + 声调程序生成）。
 * 结果经 ctx.pairExamples 传给 content.mjs 的 pairTip。
 */
let pairExamplesCache = null
function buildPairExamples() {
  if (pairExamplesCache) return pairExamplesCache
  const words = readJSON(WORDS_FILE).words ?? []
  const firstByFinal = new Map()
  for (const word of words) {
    for (const syllable of word.syllables ?? []) {
      if (firstByFinal.has(syllable.final)) continue
      firstByFinal.set(syllable.final, { word, syllable })
    }
  }
  const format = (entry) => {
    const toneText = toToneMarks(entry.syllable.pinyin, entry.syllable.tone)
    return `${entry.syllable.text} ${toneText}`
  }
  const examples = {}
  for (const [left, right] of [['ia', 'ua'], ['iang', 'uang'], ['ong', 'iong'], ['ue', 've']]) {
    const a = firstByFinal.get(left)
    const b = firstByFinal.get(right)
    if (!a || !b) continue
    examples[`${left}/${right}`] = `${format(a)} / ${format(b)}`
  }
  pairExamplesCache = examples
  return examples
}

function zeroExamplesFor(focusAtoms, anchors, patchBySyllable) {
  // 零声母示例不再硬编码 char/tone：代表字取 anchors.syllableChars[音节] 的高频字，
  // 声调由 pinyin-pro 读取；词表确实无常用字时回退显式数据补丁（syllable-patches.json）。
  return focusAtoms
    .filter((atom) => atom.startsWith('zero:'))
    .map((atom) => atom.slice(5))
    .map((syllable) => {
      const patch = patchBySyllable.get(syllable)
      const char = anchors.syllableChars?.[syllable]?.[0] ?? patch?.char
      if (!char) return null
      const tone = charTone(char) ?? patch?.tone
      return tone === undefined ? { syllable, char } : { syllable, char, tone }
    })
    .filter(Boolean)
}

function supportLevelOf(scheme) {
  if (scheme.type === 'syllable-code' || scheme.type === 'hybrid') return 'free-only'
  const finals = Object.keys(scheme.finals ?? {}).length
  const zeros = Object.keys(scheme.zeroInitial ?? {}).length
  return finals >= 30 && zeros >= 10 ? 'full' : 'simplified'
}

function zeroStyleOf(scheme) {
  const first = scheme.zeroInitial?.a?.[0] ?? ''
  return String(first).toLowerCase().startsWith('o') ? 'o-prefix' : 'letter'
}

// ── 实例化 ───────────────────────────────────────────────────

/** 把模板实例化为某方案课程（tips/anchors 在全部 lesson 构建后统一生成）。 */
export function buildCurriculum(scheme, template = TEMPLATE) {
  const engine = createSchemeEngine(scheme)
  const diff = engine.diff()
  const anchors = readJSON(ANCHORS_FILE)
  const patchBySyllable = new Map(
    (exists(SYLLABLE_PATCH_FILE) ? readJSON(SYLLABLE_PATCH_FILE).patches ?? [] : []).map((patch) => [
      patch.syllable,
      patch,
    ]),
  )
  const lessons = []
  const prerequisites = []
  const learnFinalHasV = diff.learnFinals.includes('v')

  for (const t of template) {
    const focus = []
    const push = (atomId) => {
      const meta = buildAtomMeta(scheme, diff, atomId, anchors)
      if (meta && !focus.includes(atomId)) focus.push(atomId)
    }
    if (t.cumulative) {
      // cumulative：覆盖此前已学全部知识点，不引入新键。
      for (const atomId of prerequisites) push(atomId)
    } else {
      if (t.focus) t.focus.forEach(push)
      if (t.focusInitial) t.focusInitial.forEach((initial) => push(`initial:${initial}`))
      if (t.focusFinal) t.focusFinal.forEach((final) => push(`final:${final}`))
      if (t.zero) t.zero.forEach((zero) => push(`zero:${zero}`))
      if (t.reviewFamily) {
        const family = t.reviewFamily
        if (FAMILIES[family]) FAMILIES[family].forEach((final) => push(`final:${final}`))
      }
      if (t.inheritZero && FAMILIES[t.reviewFamily]) {
        for (const zero of ZERO_BY_FAMILY[t.reviewFamily] ?? []) push(`zero:${zero}`)
      }
    }
    // ü 组同键课：统一覆盖 ü（final:v）与 üe/ve，保证 5 套方案课程 focus 一致、
    // 共享词池的全量示例可同时满足各方案的期望集合。
    const hasV = t.umlaut === true
    if (hasV) push('final:v')

    const blockingAtoms = focus.filter(
      (atomId) => atomId.startsWith('initial:') || atomId.startsWith('final:'),
    )
    const nonBlockingAtoms = focus.filter((atomId) => atomId.startsWith('zero:'))
    const desc = hasV && learnFinalHasV
      ? '新键：n/l 后的 ü、üe 的 ue/ve 两种拼写'
      : t.desc
    const lesson = {
      id: t.id,
      chapterId: t.chapterId,
      kind: t.kind,
      title: t.title,
      desc,
      estimatedMinutes: t.estimatedMinutes,
      focusAtoms: focus,
      blockingAtoms,
      nonBlockingAtoms,
      prerequisites: [...prerequisites],
      wordPlan: wordPlanFor(t),
      atomMeta: Object.fromEntries(
        focus.map((atomId) => [atomId, buildAtomMeta(scheme, diff, atomId, anchors)]),
      ),
      zeroExamples: zeroExamplesFor(focus, anchors, patchBySyllable),
      tips: [],
    }
    const passCriteria = passCriteriaFor(t)
    if (passCriteria) lesson.passCriteria = passCriteria
    lesson.stageMinWords = stageMinWordsFor(t)
    if (t.reviewFamily) lesson.reviewFamily = t.reviewFamily
    lessons.push(lesson)
    for (const atomId of focus) {
      if (!prerequisites.includes(atomId)) prerequisites.push(atomId)
    }
  }

  // tips：先建立原子 → 首次出现课程，再统一生成（tips 参与 curriculum hash）。
  const atomLessonIds = new Map()
  for (const lesson of lessons) {
    for (const atomId of lesson.focusAtoms) {
      if (!atomLessonIds.has(atomId)) atomLessonIds.set(atomId, lesson.id)
    }
  }
  const zeroStyle = zeroStyleOf(scheme)
  const templateById = new Map(template.map((item) => [item.id, item]))
  for (const lesson of lessons) {
    const t = templateById.get(lesson.id) ?? {}
    const focusFinals = lesson.focusAtoms
      .filter((atom) => atom.startsWith('final:'))
      .map((atom) => atom.slice(6))
    const focusInitials = lesson.focusAtoms
      .filter((atom) => atom.startsWith('initial:'))
      .map((atom) => atom.slice(8))
    const focusZeros = lesson.focusAtoms
      .filter((atom) => atom.startsWith('zero:'))
      .map((atom) => atom.slice(5))
    const newBlockingAtoms = lesson.blockingAtoms.filter(
      (atom) => !lesson.prerequisites.includes(atom),
    )
    lesson.tips = buildLessonTips({
      lesson,
      scheme,
      diff,
      zeroStyle,
      atomLessonIds,
      focusFinals,
      focusInitials,
      focusZeros,
      newBlockingAtoms,
      zeroTable: t.zeroTable === true,
      cumulative: t.cumulative === true,
      firstPractice: t.firstPractice === true,
      pairExamples: buildPairExamples(),
    })
  }

  const chapters = CHAPTERS.map((chapter) => ({ ...chapter }))
  return {
    schemeId: scheme.id,
    schemeName: scheme.name,
    schemeType: scheme.type,
    version: CURRICULUM_VERSION,
    templateVersion: TEMPLATE_VERSION,
    generatedAt: new Date().toISOString(),
    supportLevel: supportLevelOf(scheme),
    dataVersion: curriculumVersionOf(chapters, lessons),
    chapters,
    lessons,
  }
}

// ── 校验（生成期硬失败；运行期数据契约深检在 core vitest） ─────

const FORBIDDEN_LESSON_FIELDS = [
  'sameKeyNotes', 'maxHintRate', 'maxAvgKeyMs', 'noGate', 'evidence',
  'targetCount', 'minFreeRatio', 'zeroRulePractice', 'focusRule', 'review', 'hintTier',
]
const FORBIDDEN_CURRICULUM_FIELDS = ['nodes', 'warnings', 'evidence', 'validation']
const FAMILY_REVIEW_SETS = new Set(['a-open', 'a', 'o', 'e', 'i', 'u-ü'])

export function validateCurriculum(curriculum, scheme) {
  const errors = []
  const engine = createSchemeEngine(scheme)
  const diff = engine.diff()
  const lessons = curriculum.lessons
  const ids = new Set()
  const chapterIds = new Set(curriculum.chapters.map((chapter) => chapter.id))
  const focusUnion = new Set()

  if (curriculum.chapters.length !== 10) errors.push(`章节数 = ${curriculum.chapters.length}，期望 10`)
  if (lessons.length !== 40) errors.push(`课程节点 = ${lessons.length}，期望 40`)
  const expectedVersion = curriculumVersionOf(curriculum.chapters, lessons)
  if (curriculum.dataVersion !== expectedVersion) {
    errors.push(`dataVersion = ${curriculum.dataVersion}，期望 ${expectedVersion}`)
  }
  const kinds = lessons.reduce((acc, lesson) => {
    acc[lesson.kind] = (acc[lesson.kind] ?? 0) + 1
    return acc
  }, {})
  if (kinds.intro !== 1 || kinds.drill !== 27 || kinds.review !== 11 || kinds.exam !== 1) {
    errors.push(`课程类型计数 ${JSON.stringify(kinds)}，期望 intro1/drill27/review11/exam1`)
  }
  for (const field of FORBIDDEN_CURRICULUM_FIELDS) {
    if (field in curriculum) errors.push(`curriculum 不应包含字段 ${field}`)
  }

  // 章 order = 1..10；命名法：课 id = L<章 order>.<章内序号>，标题「类别 · 内容」且唯一
  const chapters = [...curriculum.chapters].sort((a, b) => a.order - b.order)
  chapters.forEach((chapter, index) => {
    if (chapter.order !== index + 1) errors.push(`章节 ${chapter.id}: order = ${chapter.order}，期望 ${index + 1}`)
    if (!chapter.title || !chapter.subtitle) errors.push(`章节 ${chapter.id}: 缺标题/副标题`)
  })
  const orderById = new Map(curriculum.chapters.map((chapter) => [chapter.id, chapter.order]))
  const titleSeen = new Set()
  const chapterLessonCounts = new Map()
  let totalMinutes = 0
  const seen = new Set()
  for (const lesson of lessons) {
    totalMinutes += lesson.estimatedMinutes ?? 0
    const label = `${scheme.id}/${lesson.id}`
    const idMatch = /^L(\d+)\.(\d+)$/.exec(lesson.id)
    if (!idMatch) errors.push(`${label}: 课 id 不符合 L<章>.<课序>`)
    else {
      const chapterOrder = Number(idMatch[1])
      if (chapterOrder !== orderById.get(lesson.chapterId)) errors.push(`${label}: id 章号与 chapterId 不一致`)
      const expectedSeq = (chapterLessonCounts.get(lesson.chapterId) ?? 0) + 1
      if (Number(idMatch[2]) !== expectedSeq) errors.push(`${label}: 章内课号不连续`)
    }
    chapterLessonCounts.set(lesson.chapterId, (chapterLessonCounts.get(lesson.chapterId) ?? 0) + 1)
    const titleMatch = /^(入门|声母|零声母|韵母|同键|复习|期中|综合|通关) · (.+)$/.exec(lesson.title ?? '')
    if (!titleMatch) errors.push(`${label}: 标题不符合「类别 · 内容」`)
    else if (!TITLE_CATEGORIES.includes(titleMatch[1])) errors.push(`${label}: 未知标题类别`)
    if (titleSeen.has(lesson.title)) errors.push(`${label}: 标题重复`)
    titleSeen.add(lesson.title)
    if (ids.has(lesson.id)) errors.push(`${label}: 课程 id 重复`)
    ids.add(lesson.id)
    if (!chapterIds.has(lesson.chapterId)) errors.push(`${label}: 未知章节`)
    for (const field of FORBIDDEN_LESSON_FIELDS) {
      if (field in lesson) errors.push(`${label}: 不应包含字段 ${field}`)
    }
    for (const atomId of lesson.focusAtoms) {
      if (atomId.startsWith('rule:')) errors.push(`${label}: 不允许的 rule 原子 ${atomId}`)
      focusUnion.add(atomId)
      const meta = lesson.atomMeta[atomId]
      if (!meta) errors.push(`${label}: 原子 ${atomId} 缺 atomMeta`)
      else if (!(Array.isArray(meta.keys) && meta.keys.length > 0)) {
        errors.push(`${label}: 原子 ${atomId} 键位为空`)
      } else {
        if (meta.anchors !== undefined) {
          if (!Array.isArray(meta.anchors) || meta.anchors.length < 1 || meta.anchors.length > 5) {
            errors.push(`${label}/${atomId}: anchors 非法`)
          }
          if (meta.anchors.some((item) => typeof item !== 'string' || !item.trim())) {
            errors.push(`${label}/${atomId}: anchors 含空值`)
          }
        }
        if (meta.mnemonic !== undefined && !String(meta.mnemonic).trim()) {
          errors.push(`${label}/${atomId}: mnemonic 为空`)
        }
      }
    }
    const blocking = lesson.focusAtoms.filter(
      (atomId) => atomId.startsWith('initial:') || atomId.startsWith('final:'),
    )
    const nonBlocking = lesson.focusAtoms.filter((atomId) => atomId.startsWith('zero:'))
    if (JSON.stringify(blocking) !== JSON.stringify(lesson.blockingAtoms)) {
      errors.push(`${label}: blockingAtoms 与 focusAtoms 不一致`)
    }
    if (JSON.stringify(nonBlocking) !== JSON.stringify(lesson.nonBlockingAtoms)) {
      errors.push(`${label}: nonBlockingAtoms 与 focusAtoms 不一致`)
    }
    if (lesson.prerequisites.length !== seen.size || lesson.prerequisites.some((atom) => !seen.has(atom))) {
      errors.push(`${label}: prerequisites 不是此前 focus 的累计集合`)
    }
    if (!Array.isArray(lesson.tips) || lesson.tips.length < 1 || lesson.tips.length > 4) {
      errors.push(`${label}: tips 数量 = ${Array.isArray(lesson.tips) ? lesson.tips.length : '非数组'}`)
    } else {
      if (new Set(lesson.tips).size !== lesson.tips.length) errors.push(`${label}: tips 有重复`)
      if (lesson.tips.some((tip) => typeof tip !== 'string' || !tip.trim())) errors.push(`${label}: tips 含空值`)
    }
    const expectedZeros = lesson.focusAtoms
      .filter((atomId) => atomId.startsWith('zero:'))
      .map((atomId) => atomId.slice(5))
    const actualZeros = (lesson.zeroExamples ?? []).map((example) => example.syllable)
    if (JSON.stringify(expectedZeros) !== JSON.stringify(actualZeros)) {
      errors.push(`${label}: zeroExamples 与 focus zero 原子不一致`)
    }
    if (lesson.kind === 'intro') {
      if (lesson.passCriteria !== undefined) errors.push(`${label}: 入门课不应写 passCriteria`)
      if (lesson.focusAtoms.length > 0) errors.push(`${label}: 入门课 focusAtoms 应为空`)
    } else {
      const criteria = lesson.passCriteria
      if (!criteria) errors.push(`${label}: 缺少 passCriteria`)
      else {
        if (!(criteria.accuracy > 0 && criteria.accuracy <= 1)) errors.push(`${label}: accuracy 非法`)
        if (criteria.starCpm) {
          const [one, two, three] = criteria.starCpm
          if (!(one === criteria.minCpm && one < two && two < three)) {
            errors.push(`${label}: starCpm 非法（应为 [minCpm, 2★, 3★] 且递增）`)
          }
        }
        if ((criteria.mode === 'speed' || criteria.mode === 'accuracy-speed') && criteria.minCpm === undefined) {
          errors.push(`${label}: 速度模式缺 minCpm`)
        }
      }
    }
    if (JSON.stringify(Object.keys(lesson.wordPlan).sort()) !== JSON.stringify(['lengthRange', 'maxUnfamiliar'])) {
      errors.push(`${label}: wordPlan 字段非法`)
    }
    if (lesson.kind === 'drill') {
      const before = new Set(lesson.prerequisites)
      const newBlocking = lesson.blockingAtoms.filter((atomId) => !before.has(atomId))
      if (newBlocking.length > 1) {
        const allUmlaut = newBlocking.every((atomId) => UMLAUT_FAMILY.has(atomId))
        const keySets = newBlocking.map((atomId) => {
          const [type, key] = atomId.split(':')
          const table = type === 'initial' ? scheme.initials : scheme.finals
          return new Set((table?.[key] ?? []).map((item) => String(item).toLowerCase()))
        })
        const shared = keySets.length > 0 && [...keySets[0]].some((key) => keySets.every((set) => set.has(key)))
        if (!allUmlaut && !shared) {
          errors.push(`${label}: 多个新键 ${newBlocking.join(',')} 既不共用键位也不属 ü 家族`)
        }
      }
    }
    const category = titleMatch?.[1] ?? ''
    if (CUMULATIVE_CATEGORIES.has(category)) {
      const expectedFocus = [...lesson.prerequisites]
      if (JSON.stringify(expectedFocus) !== JSON.stringify(lesson.focusAtoms)) {
        errors.push(`${label}: cumulative focus 应等于此前已学知识点`)
      }
      if (lesson.blockingAtoms.some((atom) => !lesson.prerequisites.includes(atom))) {
        errors.push(`${label}: cumulative 不应引入新阻塞原子`)
      }
    }
    // stageMinWords：每课显式；drill 三段、review/exam 单段；最后阶段必须 exam
    const expectedMinWords = (() => {
      if (lesson.kind === 'intro') return {}
      if (lesson.kind === 'exam') return { exam: 100 }
      if (lesson.kind === 'review') return { exam: 50 }
      return { single: 15, word: 15, exam: 25 }
    })()
    if (JSON.stringify(expectedMinWords) !== JSON.stringify(lesson.stageMinWords)) {
      errors.push(`${label}: stageMinWords = ${JSON.stringify(lesson.stageMinWords)}，期望 ${JSON.stringify(expectedMinWords)}`)
    }
    if (lesson.stageMinWords) {
      const stages = Object.keys(lesson.stageMinWords)
      if (lesson.kind !== 'intro' && stages[stages.length - 1] !== 'exam') {
        errors.push(`${label}: 最后一个阶段必须是 exam（全遮挡考核）`)
      }
      if (lesson.kind === 'drill' && JSON.stringify(stages) !== JSON.stringify(['single', 'word', 'exam'])) {
        errors.push(`${label}: drill 阶段应为 single → word → exam`)
      }
      if ((lesson.kind === 'review' || lesson.kind === 'exam') && JSON.stringify(stages) !== JSON.stringify(['exam'])) {
        errors.push(`${label}: ${lesson.kind} 阶段应只有 exam`)
      }
      for (const [stage, value] of Object.entries(lesson.stageMinWords)) {
        if (!['single', 'word', 'exam'].includes(stage)) errors.push(`${label}: stageMinWords 未知阶段 ${stage}`)
        if (!Number.isInteger(value) || value <= 0) errors.push(`${label}: stageMinWords.${stage} 非法`)
      }
    }
    for (const atomId of lesson.focusAtoms) seen.add(atomId)
  }

  // 结构专项
  // 零声母累计复习（按数据特征定位）：复习课 && focus == prerequisites && 覆盖 12 个 zero
  const zeroReview = lessons.find(
    (lesson) =>
      lesson.kind === 'review' &&
      (lesson.title ?? '').startsWith('复习 ·') &&
      JSON.stringify(lesson.focusAtoms) === JSON.stringify(lesson.prerequisites) &&
      lesson.focusAtoms.filter((atom) => atom.startsWith('zero:')).length === ZERO_INITIALS.length,
  )
  if (!zeroReview) errors.push('缺少覆盖 12 个零声母的累计复习课')
  else {
    const zeroAtoms = zeroReview.focusAtoms.filter((atom) => atom.startsWith('zero:'))
    const expectedZeros = zeroReview.prerequisites.filter((atom) => atom.startsWith('zero:'))
    if (JSON.stringify(zeroAtoms) !== JSON.stringify(expectedZeros)) {
      errors.push('零声母累计复习：零声母顺序应等于 prerequisites 中的学习顺序')
    }
  }
  const zhLesson = lessons.find((lesson) => lesson.title === '声母 · zh')
  if (!zhLesson || !zhLesson.tips.some((tip) => tip.includes('多音字') && tip.includes('j/q/x/y'))) {
    errors.push('L2.1（声母 · zh）tips 必须包含「多音字」与「j/q/x/y」首提提示')
  }
  const uUmlautLesson = lessons.find((lesson) => lesson.reviewFamily === 'u-ü')
  if (!uUmlautLesson) errors.push('缺少 reviewFamily=u-ü 的「复习 · u 与 ü 家族」课')
  else {
    for (const atom of ['final:ui', 'final:un', 'final:ue', 'final:ve']) {
      if (!uUmlautLesson.focusAtoms.includes(atom)) errors.push(`u-ü 复习缺 ${atom}`)
    }
  }
  const umlautLesson = lessons.find(
    (lesson) =>
      lesson.focusAtoms.includes('final:ue') &&
      lesson.focusAtoms.includes('final:ve') &&
      lesson.focusAtoms.includes('final:v'),
  )
  if (!umlautLesson) errors.push('缺少同时覆盖 final:ue/ve/v 的 ü 组课')
  else {
    if (umlautLesson.title !== '韵母 · ü / üe / ve') errors.push('ü 组课标题应为「韵母 · ü / üe / ve」')
  }
  // 零声母全表课（按数据特征定位）：focus 恰好 12 个 zero 原子且集合 = ZERO_INITIALS
  const zeroSet = new Set(ZERO_INITIALS)
  const zeroTableLesson = lessons.find(
    (lesson) =>
      lesson.focusAtoms.length === ZERO_INITIALS.length &&
      lesson.focusAtoms.every((atom) => atom.startsWith('zero:')),
  )
  if (!zeroTableLesson) errors.push('缺少零声母全表课（focus 恰为 12 个 zero）')
  else {
    if (zeroTableLesson.focusAtoms.some((atom) => !zeroSet.has(atom.slice(5)))) {
      errors.push('零声母全表课 focus 含非标准零声母')
    }
    if (zeroTableLesson.blockingAtoms.length !== 0) errors.push('零声母全表课不应有阻塞原子')
    if (zeroTableLesson.title !== '零声母 · 12 个音节') errors.push('零声母全表课标题应为「零声母 · 12 个音节」')
    if (zeroTableLesson.zeroExamples.length !== ZERO_INITIALS.length) errors.push('零声母全表课 zeroExamples 应为 12 条')
  }

  // learn 原子全覆盖
  const learnAtoms = [
    ...diff.learnInitials.map((initial) => `initial:${initial}`),
    ...diff.learnFinals.map((final) => `final:${final}`),
    ...diff.learnZero.map((zero) => `zero:${zero}`),
  ]
  for (const atomId of learnAtoms) {
    if (!focusUnion.has(atomId)) errors.push(`${scheme.id}: learn 原子 ${atomId} 未出现在任何课程 focusAtoms 中`)
    const firstIndex = lessons.findIndex((lesson) => lesson.focusAtoms.includes(atomId))
    if (firstIndex < 0) continue
    for (let index = firstIndex + 1; index < lessons.length; index += 1) {
      if (!lessons[index].prerequisites.includes(atomId)) {
        errors.push(`${scheme.id}: ${atomId} 未进入 ${lessons[index].id} 的 prerequisites`)
        break
      }
    }
  }
  const reviewNodes = lessons.filter(
    (lesson) => lesson.kind === 'review' || lesson.kind === 'exam',
  ).length
  if (reviewNodes !== 12) errors.push(`${scheme.id}: 复习/考核节点 = ${reviewNodes}，期望 12`)
  if (totalMinutes !== 326) errors.push(`${scheme.id}: 课程总时长 = ${totalMinutes}，期望 326`)
  return { ok: errors.length === 0, errors, totalMinutes, lessonCount: lessons.length }
}

// ── CLI ──────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(SCHEME_INDEX_FILE)) {
    console.error(`缺少 ${SCHEME_INDEX_FILE}（data/schemes 冻结事实源）`)
    process.exitCode = 1
    return
  }
  if (!exists(ANCHORS_FILE)) {
    console.error(`缺少 ${ANCHORS_FILE}，请先运行 pnpm data:words`)
    process.exitCode = 1
    return
  }
  const schemeIndex = readJSON(SCHEME_INDEX_FILE)
  const courseSupported = schemeIndex.courseSupported ?? []
  if (courseSupported.length !== 5) {
    console.error(`courseSupported 应为 5 套，实际 ${courseSupported.length}`)
    process.exitCode = 1
    return
  }
  const schemeMeta = new Map((schemeIndex.schemes ?? []).map((scheme) => [scheme.id, scheme]))
  const indexEntries = []
  let failed = 0
  for (const schemeId of courseSupported) {
    const schemeFile = path.join(SCHEME_DIR, `${schemeId}.json`)
    if (!fs.existsSync(schemeFile)) {
      console.error(`✗ ${schemeId}: 缺少方案文件`)
      failed += 1
      continue
    }
    const scheme = readJSON(schemeFile)
    const curriculum = buildCurriculum(scheme)
    const meta = schemeMeta.get(schemeId)
    if (meta?.course?.courseTier) curriculum.supportLevel = meta.course.courseTier
    const report = validateCurriculum(curriculum, scheme)
    if (!report.ok) {
      failed += 1
      console.error(`✗ ${schemeId}: ${report.errors.slice(0, 8).join('；')}`)
      continue
    }
    writeJSON(path.join(CURRICULUM_DIR, `${schemeId}.curriculum.json`), curriculum)
    indexEntries.push({
      schemeId,
      schemeName: scheme.name,
      supportLevel: curriculum.supportLevel,
      lessonCount: report.lessonCount,
      totalMinutes: report.totalMinutes,
      file: `${schemeId}.curriculum.json`,
    })
    console.log(`✓ ${schemeId.padEnd(12)} ${report.lessonCount} 课 / ${report.totalMinutes} 分钟 · ${curriculum.dataVersion}`)
  }
  writeJSON(CURRICULUM_INDEX_FILE, {
    generatedAt: new Date().toISOString(),
    templateVersion: TEMPLATE_VERSION,
    schemes: indexEntries,
  })
  console.log(`\n完成：${indexEntries.length}/${courseSupported.length} 套课程（${TEMPLATE_VERSION}）`)
  if (failed > 0) process.exitCode = 1
}

main()
