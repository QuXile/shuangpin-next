#!/usr/bin/env node
/**
 * 通用课程生成器。
 *
 * 只为「没有自有课程路线」的方案生成通用 curriculum；已有自有路线的方案
 * （curriculum.supportLevel === 'full'）一律跳过、原样保留。
 *
 * 设计依据：tmp/curriculum-route-design.md
 *  - 第一章：通用入门 + （存在全拼沿用原子时）「复习 · 全拼沿用」；
 *  - 内容章顺序：单韵母 → 单声母 → 复合声母 → 前响复韵母 → 后响复韵母 →
 *    中响复韵母 → 基本前鼻韵母 → 基本后鼻韵母 → 带介前鼻韵母 →
 *    带介后鼻韵母 → 零声母；
 *  - 内容章只给 learn 原子单独设课（每原子一课、不合并），章末生成复习课；
 *    free 原子（与全拼一致）统一进第一章「复习 · 全拼沿用」，不重复排课；
 *  - 期中：按「左右新课数差最小 → 章数差最小 → 更早边界」选章间边界插入，
 *    独立成章、只有复习课；
 *  - 最终章：综合练习 → 速度练习 → 最终考核（考核必须是最后一课）；
 *  - 推荐码例外（recommended != 主键组合）与兼容编码不单独设课，按
 *    「目标音节最后学到的 learn 原子」归组写入对应原子课 tips；两端都是 free
 *    原子的归到「复习 · 全拼沿用」tips。
 *
 * 生成结果写入 data/schemes/<id>/curriculum.json，并同步更新
 * data/schemes/curriculum-index.json 与 data/schemes/index.json 的课程能力字段。
 * 生成后还需运行 `pnpm data:sync`。
 *
 * 用法：node scripts/generate-universal-curriculum.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FINALS, INITIALS, ZERO_INITIALS, createSchemeEngine } from '../packages/core/src/index.ts'
import {
  CURRICULUM_INDEX_FILE,
  LEXICON_FILE,
  SCHEME_DIR,
  SCHEME_INDEX_FILE,
  TEMPLATE_VERSION,
  curriculumVersionOf,
  readJSON,
  writeJSON,
} from './lib/data-contract.mjs'

const CURRICULUM_VERSION = '1.0.0'
const SELF_OWNED_SUPPORT = 'full'
const GENERATED_SUPPORT = 'simplified'
/** 一条 tips 里最多压缩几个编码条目（C 双拼这类例外多的方案会分多条 tip）。 */
const CODE_TIPS_CHUNK = 5
/** 简化课程允许的 tips 上限（编码条目按块压缩后 1–4 条一般够用）。 */
export const SIMPLIFIED_TIPS_MAX = 10

const PASS_ACCURACY = Object.freeze({ accuracy: 0.85, mode: 'accuracy' })
const PASS_REVIEW = Object.freeze({ accuracy: 0.85, mode: 'accuracy', minCpm: 45 })
const PASS_SPEED = Object.freeze({ accuracy: 0.85, mode: 'speed', minCpm: 45, starCpm: [45, 60, 75] })
const PASS_EXAM = Object.freeze({ accuracy: 0.85, mode: 'accuracy-speed', minCpm: 45, starCpm: [45, 60, 75] })

const WORD_PLAN_DEFAULT = Object.freeze({ maxUnfamiliar: 0, lengthRange: [2, 5] })
const WORD_PLAN_INTRO = Object.freeze({ maxUnfamiliar: 0, lengthRange: [2, 3] })
const STAGE_MIN_DRILL = Object.freeze({ single: 15, word: 15, exam: 25 })
const STAGE_MIN_REVIEW = Object.freeze({ exam: 50 })
const STAGE_MIN_EXAM = Object.freeze({ exam: 100 })

/**
 * 章节顺序（内容章）：单韵母 → 单声母 → 复合声母 → 前响 → 后响 → 中响 →
 * 基本前鼻 → 基本后鼻 → 带介前鼻 → 带介后鼻 → 零声母。
 * 每项只列该类别下的规范原子；实际是否生成章节由方案 learn 原子决定。
 */
const MODULES = Object.freeze([
  { key: 'single-final', type: 'final', title: '单韵母', atoms: ['a', 'o', 'e', 'i', 'u', 'v'] },
  {
    key: 'single-initial',
    type: 'initial',
    title: '单声母',
    atoms: INITIALS.filter((name) => name !== 'zh' && name !== 'ch' && name !== 'sh'),
  },
  { key: 'compound-initial', type: 'initial', title: '复合声母', atoms: ['zh', 'ch', 'sh'] },
  { key: 'front-diphthong', type: 'final', title: '前响复韵母', atoms: ['ai', 'ei', 'ao', 'ou'] },
  { key: 'back-diphthong', type: 'final', title: '后响复韵母', atoms: ['ia', 'ie', 'ua', 'uo', 'ue', 've'] },
  { key: 'mid-diphthong', type: 'final', title: '中响复韵母', atoms: ['iao', 'iu', 'uai', 'ui'] },
  { key: 'front-nasal', type: 'final', title: '基本前鼻韵母', atoms: ['an', 'en', 'in', 'un'] },
  { key: 'back-nasal', type: 'final', title: '基本后鼻韵母', atoms: ['ang', 'eng', 'ing', 'ong'] },
  { key: 'medial-front-nasal', type: 'final', title: '带介前鼻韵母', atoms: ['ian', 'uan'] },
  { key: 'medial-back-nasal', type: 'final', title: '带介后鼻韵母', atoms: ['iang', 'iong', 'uang'] },
  { key: 'zero-initial', type: 'zero', title: '零声母', atoms: [...ZERO_INITIALS] },
])

// ── 原子工具 ──────────────────────────────────────────────────

export function atomIdOf(type, key) {
  return `${type}:${key}`
}

export function splitAtomId(atomId) {
  const index = atomId.indexOf(':')
  return [atomId.slice(0, index), atomId.slice(index + 1)]
}

function tableOf(scheme, type) {
  if (type === 'initial') return scheme.initials
  if (type === 'final') return scheme.finals
  return scheme.zeroInitial
}

function hasAtom(scheme, type, key) {
  const table = tableOf(scheme, type)
  return Boolean(table) && Object.prototype.hasOwnProperty.call(table, key)
}

function keysOfAtom(scheme, atomId) {
  const [type, key] = splitAtomId(atomId)
  const values = tableOf(scheme, type)?.[key] ?? []
  return values.map((value) => String(value).toLowerCase())
}

function freeSetsOf(engine) {
  const diff = engine.diff()
  return {
    diff,
    freeInitials: new Set(diff.freeInitials),
    freeFinals: new Set(diff.freeFinals),
    freeZero: new Set(diff.freeZero),
  }
}

function isFreeAtom(atomId, freeSets) {
  const [type, key] = splitAtomId(atomId)
  if (type === 'initial') return freeSets.freeInitials.has(key)
  if (type === 'final') return freeSets.freeFinals.has(key)
  return freeSets.freeZero.has(key)
}

/** 全部 free 原子：声母 → 韵母 → 零声母（规范顺序）。 */
function freeAtomsOf(scheme, freeSets) {
  const initials = INITIALS.filter((name) => hasAtom(scheme, 'initial', name) && freeSets.freeInitials.has(name)).map(
    (name) => atomIdOf('initial', name),
  )
  const finals = FINALS.filter((name) => hasAtom(scheme, 'final', name) && freeSets.freeFinals.has(name)).map((name) =>
    atomIdOf('final', name),
  )
  const zeros = ZERO_INITIALS.filter((name) => hasAtom(scheme, 'zero', name) && freeSets.freeZero.has(name)).map((name) =>
    atomIdOf('zero', name),
  )
  return [...initials, ...finals, ...zeros]
}

/** 只保留存在 learn 原子的内容章，顺序遵循章节模板。 */
function buildContentModules(scheme, freeSets) {
  const modules = []
  for (const module of MODULES) {
    const atoms = module.atoms.filter(
      (key) => hasAtom(scheme, module.type, key) && !isFreeAtom(atomIdOf(module.type, key), freeSets),
    )
    if (atoms.length === 0) continue
    modules.push({ ...module, atoms })
  }
  return modules
}

// ── 课程内容 ──────────────────────────────────────────────────

function upperKeys(keys) {
  return keys.map((key) => key.toUpperCase()).join(' / ')
}

function buildAtomMeta(scheme, engine, freeSets, atomId) {
  const [type, key] = splitAtomId(atomId)
  const keys = engine.keysForAtom(atomId)
  const free = isFreeAtom(atomId, freeSets)
  const meta = {
    atomId,
    type,
    pinyin: key,
    keys: [...keys],
    free,
  }
  const keyText = upperKeys(keys)
  if (type === 'zero') {
    meta.mnemonic = `零声母 ${key} = ${keyText}（整段输入）`
  } else if (type === 'initial') {
    meta.mnemonic = `声母 ${key} = ${keyText}`
  } else {
    meta.mnemonic = `韵母 ${key} = ${keyText}`
  }
  return meta
}

function zeroExamplesOf(focusAtoms, lexicon) {
  const examples = []
  for (const atomId of focusAtoms) {
    if (!atomId.startsWith('zero:')) continue
    const syllable = atomId.slice('zero:'.length)
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

function specialFinalTip(type, key) {
  if (type !== 'final') return null
  if (key === 'v') return 'v 是 ü 的数据写法（如 lv = lü）；n/l 后的 ü 按本键输入。'
  if (key === 'ue') return 'ue 是 j/q/y/x 后 üe 的拼写（如 jue）；输入时取本键。'
  if (key === 've') return 've 是 n/l 后 üe 的拼写（如 nve = nüe）；输入时取本键。'
  return null
}

function drillTips(atomId, scheme, codeEntries) {
  const [type, key] = splitAtomId(atomId)
  const keys = keysOfAtom(scheme, atomId)
  const keyText = upperKeys(keys)
  const tips = []
  if (type === 'zero') {
    tips.push(`零声母 ${key} 是整段序列 ${keyText}，不拆声母韵母、两键一次输入。`)
    tips.push('先看提示打对，再逐步撤掉提示；同一个字第 3 次错误会揭示答案。')
  } else {
    tips.push(`新键位：${type === 'initial' ? '声母' : '韵母'} ${key} → ${keyText}${keys.length > 1 ? '（多键均可用）' : ''}。`)
    const special = specialFinalTip(type, key)
    tips.push(special ?? '先看提示打对，再逐步撤掉提示；看到字先拆「声母 + 韵母」，再各取一键。')
    tips.push('把键位和字绑在一起记（字组结合），比背字母表牢固。')
  }
  tips.push(...codeTipsFor(codeEntries))
  return tips
}

function zeroReviewTips(freeInitials, freeFinals, freeZero, codeEntries) {
  const total = freeInitials + freeFinals + freeZero
  const tips = [
    `全拼复习：本方案有 ${total} 个键位与全拼一致（声母 ${freeInitials} · 韵母 ${freeFinals} · 零声母 ${freeZero}），可直接按全拼习惯输入。`,
    '重点是把「声母键 + 韵母键」的两键节奏打顺；这些键位后续不再单独出课。',
  ]
  tips.push(...codeTipsFor(codeEntries))
  return tips
}

function chapterReviewTips() {
  return [
    '复习范围：此前学过的全部键位；先求准确，再逐步提速。',
    '本课是无提示考核阶段，需要在完成词量外达到本课正确率门槛。',
  ]
}

function midMixedTips(leftChapters) {
  return [`期中：前 ${leftChapters} 个内容章混合检验；先准确后速度。`, '本课覆盖此前全部已学键位，不引入新键。']
}

function midSpeedTips() {
  return ['期中速度练习：在正确率达标的前提下提速，目标 45 WPM 起。', '本课覆盖此前全部已学键位。']
}

function sprintMixedTips() {
  return ['综合：全部已学键位混合练习，为最终考核做准备。', '先准确后速度；错 3 次会揭示答案。']
}

function sprintSpeedTips() {
  return ['速度：全部已学键位速度冲刺，目标 45 WPM 起。']
}

function examTips() {
  return ['最终考核：无提示 + 限时，正确率与速度同时达标才能通关。', '本课是课程的最后一课，覆盖全部已学键位。']
}

// ── 推荐码 / 兼容编码分析 ────────────────────────────────────

/** 把音节名解析成 { type, key, atoms, composition }；无法解析返回 null。 */
export function resolveSyllable(scheme, syllable) {
  if (hasAtom(scheme, 'zero', syllable)) {
    const sequence = (scheme.zeroInitial[syllable] ?? []).map((value) => String(value).toLowerCase())[0] ?? ''
    return {
      type: 'zero',
      key: syllable,
      atomIds: [atomIdOf('zero', syllable)],
      composition: sequence,
    }
  }
  const twoLetter = ['zh', 'ch', 'sh'].find(
    (initial) => syllable.startsWith(initial) && hasAtom(scheme, 'final', syllable.slice(initial.length)),
  )
  const oneLetter = !twoLetter
    ? INITIALS.find(
        (initial) =>
          initial.length === 1 && syllable.startsWith(initial) && hasAtom(scheme, 'final', syllable.slice(1)),
      )
    : null
  const initial = twoLetter ?? oneLetter
  if (!initial) return null
  const final = syllable.slice(initial.length)
  const initialKey = (scheme.initials[initial] ?? []).map((value) => String(value).toLowerCase())[0] ?? ''
  const finalKey = (scheme.finals[final] ?? []).map((value) => String(value).toLowerCase())[0] ?? ''
  return {
    type: 'mixed',
    key: syllable,
    initial,
    final,
    atomIds: [atomIdOf('initial', initial), atomIdOf('final', final)],
    composition: `${initialKey}${finalKey}`,
  }
}

/**
 * 推荐码 / 兼容编码按「目标音节最后学到的 learn 原子」归组。
 * 返回 { groups: Map<'free'|AtomId, Entry[]>, unresolved: string[], stats }。
 *
 * Entry = { syllable, recommended: string|null, composition: string, compat: string[] }
 * 只有「推荐码 != 主键组合」的例外和 compatCodes 才会进入 groups。
 */
export function analyzeSymbolCodes(scheme, { atomOrder, freeSets } = {}) {
  const engine = createSchemeEngine(scheme)
  const sets = freeSets ?? freeSetsOf(engine)
  const modules = buildContentModules(scheme, sets)
  const order = atomOrder ?? (() => {
    const map = new Map()
    let index = 0
    for (const module of modules) {
      for (const key of module.atoms) {
        index += 1
        map.set(atomIdOf(module.type, key), index)
      }
    }
    return map
  })()

  const groups = new Map()
  const unresolved = []
  let recommendedCount = 0
  let compatCount = 0
  const syllables = new Set([
    ...Object.keys(scheme.recommended ?? {}),
    ...Object.keys(scheme.compatCodes ?? {}),
  ])
  for (const syllable of [...syllables].sort()) {
    const resolved = resolveSyllable(scheme, syllable)
    if (!resolved) {
      unresolved.push(syllable)
      continue
    }
    const recommended = (() => {
      const value = scheme.recommended?.[syllable]
      return typeof value === 'string' ? value.toLowerCase() : null
    })()
    const recommendedOverride = Boolean(recommended && recommended !== resolved.composition)
    // compatCodes 里与推荐码 / 主键组合重复的序列不算「额外」信息（部分方案数据有冗余）。
    const compat = (scheme.compatCodes?.[syllable] ?? [])
      .map((value) => String(value).toLowerCase())
      .filter((value) => value.length > 0 && value !== resolved.composition)
      .filter((value) => value !== recommended)
    if (!recommendedOverride && compat.length === 0) continue

    const completion = (() => {
      if (resolved.atomIds.length === 1) {
        const atom = resolved.atomIds[0]
        return isFreeAtom(atom, sets) ? 'free' : atom
      }
      const orders = resolved.atomIds.map((atom) => (isFreeAtom(atom, sets) ? 0 : (order.get(atom) ?? 0)))
      if (orders.every((value) => value === 0)) return 'free'
      const max = Math.max(...orders)
      return resolved.atomIds[orders.indexOf(max)]
    })()

    const entry = {
      syllable,
      recommended: recommendedOverride ? recommended : null,
      composition: resolved.composition,
      compat,
    }
    if (entry.recommended) recommendedCount += 1
    if (entry.compat.length > 0) compatCount += 1
    const list = groups.get(completion) ?? []
    list.push(entry)
    groups.set(completion, list)
  }
  for (const list of groups.values()) list.sort((a, b) => a.syllable.localeCompare(b.syllable))
  return { groups, unresolved, stats: { recommendedCount, compatCount } }
}

function formatCodeEntry(entry) {
  const upper = (value) => value.toUpperCase()
  const parts = []
  if (entry.recommended) {
    parts.push(`推荐码 ${upper(entry.recommended)}（主键组合 ${upper(entry.composition)} 也接受）`)
  }
  if (entry.compat.length > 0) {
    parts.push(`兼容码 ${entry.compat.map((value) => upper(value)).join(' / ')}`)
  }
  return `${entry.syllable} ${parts.join('，')}`
}

/** 编码条目压缩为 tips：每 ${CODE_TIPS_CHUNK} 条一组，避免 C 双拼单个课 tips 过长。 */
export function codeTipsFor(entries) {
  if (!entries || entries.length === 0) return []
  const tips = []
  for (let index = 0; index < entries.length; index += CODE_TIPS_CHUNK) {
    const chunk = entries.slice(index, index + CODE_TIPS_CHUNK)
    tips.push(`编码补充（标答与额外接受码）：${chunk.map(formatCodeEntry).join('；')}。`)
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

/** 期中边界：左右新课数差最小 → 章数差最小 → 更早边界；只有一个内容章时返回 null。 */
export function chooseMidBoundary(modules) {
  if (modules.length < 2) return null
  const counts = modules.map((module) => module.atoms.length)
  const total = counts.reduce((sum, value) => sum + value, 0)
  let leftCount = 0
  let best = null
  for (let index = 1; index < modules.length; index += 1) {
    leftCount += counts[index - 1]
    const rightCount = total - leftCount
    const diff = Math.abs(leftCount - rightCount)
    const chapterDiff = Math.abs(index - (modules.length - index))
    const candidate = { index, leftCount, rightCount, diff, chapterDiff }
    if (
      !best ||
      candidate.diff < best.diff ||
      (candidate.diff === best.diff && candidate.chapterDiff < best.chapterDiff)
    ) {
      best = candidate
    }
  }
  return best
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
  const freeSets = freeSetsOf(engine)
  const freeAtoms = freeAtomsOf(scheme, freeSets)
  const modules = buildContentModules(scheme, freeSets)
  const boundary = chooseMidBoundary(modules)
  const codeAnalysis = analyzeSymbolCodes(scheme, { freeSets })
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
      tips: options.tips ?? [],
      stageMinWords:
        kind === 'intro'
          ? {}
          : kind === 'drill'
            ? { ...STAGE_MIN_DRILL }
            : kind === 'review'
              ? { ...STAGE_MIN_REVIEW }
              : { ...STAGE_MIN_EXAM },
    }
    for (const atomId of focus) lesson.atomMeta[atomId] = buildAtomMeta(scheme, engine, freeSets, atomId)
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
  const introChapter = addChapter('ch-intro', '入门', '认识双拼 · 全拼沿用')
  addLesson(
    introChapter,
    makeLesson('intro', '入门 · 认识双拼', '一声母一韵母两键；先看提示打对，再逐步撤掉提示。', [], {
      tips: [
        '不用先背整张键位图：先看提示打对，再逐步撤掉提示即可。',
        '目标不是速度，而是看到字能稳定拆出「声母键 + 韵母键」。',
      ],
    }),
  )
  if (freeAtoms.length > 0) {
    const freeInitialCount = freeAtoms.filter((atom) => atom.startsWith('initial:')).length
    const freeFinalCount = freeAtoms.filter((atom) => atom.startsWith('final:')).length
    const freeZeroCount = freeAtoms.filter((atom) => atom.startsWith('zero:')).length
    addLesson(
      introChapter,
      makeLesson(
        'review',
        '复习 · 全拼沿用',
        `与全拼一致的 ${freeAtoms.length} 个键位复习（声母 ${freeInitialCount} · 韵母 ${freeFinalCount} · 零声母 ${freeZeroCount}）。`,
        freeAtoms,
        {
          passCriteria: PASS_REVIEW,
          // Lead 决策 A：无 newFocus 的全拼沿用复习允许少量预习原子，
          // 否则「全部韵母都需要重学」的方案（如键道3）没有任何合法练习词。
          wordPlan: { maxUnfamiliar: 2, lengthRange: [2, 5] },
          tips: zeroReviewTips(freeInitialCount, freeFinalCount, freeZeroCount, codeAnalysis.groups.get('free')),
        },
      ),
    )
    learned.push(...freeAtoms)
  }

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
        tips: midMixedTips(boundary.index),
      }),
    )
    addLesson(
      chapter,
      makeLesson('review', '期中 · 速度练习', '期中速度练习：目标 45 WPM 起。', [...learned], {
        passCriteria: PASS_SPEED,
        tips: midSpeedTips(),
      }),
    )
  }

  modules.forEach((module, moduleIndex) => {
    if (boundary && boundary.index === moduleIndex) addMidChapter()
    const chapter = addChapter(`ch-${module.key}`, module.title, moduleSubtitle(module))
    for (const key of module.atoms) {
      const atomId = atomIdOf(module.type, key)
      const keys = keysOfAtom(scheme, atomId)
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
      const lesson = makeLesson('drill', title, desc, [atomId], {
        passCriteria: PASS_ACCURACY,
        tips: drillTips(atomId, scheme, codeAnalysis.groups.get(atomId)),
      })
      addLesson(chapter, lesson)
      learned.push(atomId)
    }
    addLesson(
      chapter,
      makeLesson('review', `复习 · ${module.title}`, `复习：${module.title}全部键位；先准确后速度。`, [...learned], {
        passCriteria: PASS_REVIEW,
        tips: chapterReviewTips(),
      }),
    )
  })

  // ── 最终章 ──
  const finalChapter = addChapter('ch-final', '最终章', '综合 · 速度 · 最终考核')
  addLesson(
    finalChapter,
    makeLesson('review', '综合 · 混合练习', '综合：全部内容混合练习。', [...learned], {
      passCriteria: PASS_REVIEW,
      tips: sprintMixedTips(),
    }),
  )
  addLesson(
    finalChapter,
    makeLesson('review', '综合 · 速度练习', '速度：全部内容速度冲刺，目标 45 WPM 起。', [...learned], {
      passCriteria: PASS_SPEED,
      tips: sprintSpeedTips(),
    }),
  )
  addLesson(
    finalChapter,
    makeLesson('exam', '通关 · 最终考核', '无提示 + 限时：正确率与速度同时达标才能通关。', [...learned], {
      passCriteria: PASS_EXAM,
      tips: examTips(),
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

  return {
    schemeId: scheme.id,
    schemeName: schemeName ?? scheme.name ?? scheme.id,
    schemeType: scheme.type,
    version: CURRICULUM_VERSION,
    templateVersion: TEMPLATE_VERSION,
    generatedAt,
    supportLevel: GENERATED_SUPPORT,
    dataVersion: curriculumVersionOf(chapters, lessons),
    chapters,
    lessons,
  }
}

// ── 索引更新 ──────────────────────────────────────────────────

const GENERATED_COURSE = Object.freeze({
  supportsGuidedCourse: true,
  courseTier: 'simplified',
  reason: '没有自有课程路线：使用自动生成的通用课程（learn 原子逐课 + 全拼沿用复习 + 期中 / 最终章）。',
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

function updateCurriculumIndex(courseIds, curricula) {
  const previous = fs.existsSync(CURRICULUM_INDEX_FILE) ? readJSON(CURRICULUM_INDEX_FILE) : null
  const previousIds = (previous?.schemes ?? []).map((item) => item.schemeId)
  const sameIds =
    previousIds.length === courseIds.length && courseIds.every((id, index) => previousIds[index] === id)
  const schemes = courseIds.map((id) => {
    const curriculum = curricula.get(id)
    return {
      schemeId: id,
      schemeName: curriculum.schemeName,
      supportLevel: curriculum.supportLevel,
      file: `data/schemes/${id}/curriculum.json`,
    }
  })
  writeJSON(CURRICULUM_INDEX_FILE, {
    generatedAt: sameIds ? (previous?.generatedAt ?? new Date().toISOString()) : new Date().toISOString(),
    templateVersion: TEMPLATE_VERSION,
    schemes,
  })
}

/** 读取方案源数据并生成全部「无自有路线」的通用课程 + 索引。返回生成统计。 */
export function generateAll({ write = true, log = console.log } = {}) {
  const schemeIndex = readJSON(SCHEME_INDEX_FILE)
  const lexicon = readJSON(LEXICON_FILE)
  const schemes = []
  const generated = []
  const skipped = []
  for (const summary of schemeIndex.schemes ?? []) {
    const schemeFile = path.join(SCHEME_DIR, summary.id, 'scheme.json')
    if (!fs.existsSync(schemeFile)) continue
    const scheme = readJSON(schemeFile)
    schemes.push(scheme)
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
    if (write) writeJSON(curriculumFile, curriculum)
    generated.push({ id: summary.id, curriculum })
  }

  const courseIds = [...generated, ...skipped.map((id) => ({ id }))]
    .map((item) => item.id)
    .sort((a, b) => {
      const order = schemeIndex.recommendedOrder ?? []
      return order.indexOf(a) - order.indexOf(b)
    })
  const curricula = new Map(generated.map((item) => [item.id, item.curriculum]))
  for (const id of skipped) {
    curricula.set(id, readJSON(path.join(SCHEME_DIR, id, 'curriculum.json')))
  }
  if (write) {
    updateSchemeIndex(schemeIndex, courseIds)
    writeJSON(SCHEME_INDEX_FILE, schemeIndex)
    updateCurriculumIndex(courseIds, curricula)
  }

  const stats = generated.map(({ id, curriculum }) => ({
    id,
    chapters: curriculum.chapters.length,
    lessons: curriculum.lessons.length,
    drills: curriculum.lessons.filter((lesson) => lesson.kind === 'drill').length,
    reviews: curriculum.lessons.filter((lesson) => lesson.kind === 'review').length,
    dataVersion: curriculum.dataVersion,
  }))
  for (const item of stats) {
    log(`[curriculum] ${item.id}: ${item.chapters} 章 / ${item.lessons} 课（${item.drills} 新课、${item.reviews} 复习） ${item.dataVersion}`)
  }
  log(`[curriculum] 生成 ${generated.length} 套通用课程；保留自有路线 ${skipped.length} 套（${skipped.join(', ')}）`)
  log(`[curriculum] courseSupported = ${courseIds.length} 套`)
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
