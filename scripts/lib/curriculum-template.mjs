/**
 * 课程模板唯一来源。
 *
 * 阶段计划 / 评分门槛 / 词量 / 章节顺序 / 章节内顺序 / 期中边界算法 / 原子工具
 * 全部只在这里定义一次，被以下两者共用：
 *   - scripts/generate-universal-curriculum.mjs（生成 14 套 simplified 课程）
 *   - scripts/validate/curriculum.mjs（重新生成后与磁盘课程深比较）
 *
 * 这些常量直接决定 data/schemes/<id>/curriculum.json 的内容：
 * 任何调整都必须跑 node scripts/generate-universal-curriculum.mjs，并确认 data/ 零 diff。
 */
import {
  FINALS,
  INITIALS,
  KIND_STAGE_MIN_WORDS,
  ZERO_INITIALS,
  atomId,
  parseAtomId,
} from '../../packages/core/src/index.ts'

export const CURRICULUM_VERSION = '1.0.0'
export const TEMPLATE_VERSION = '1.0.0'

/** 简化课程允许的 tips 上限（编码条目按块压缩后 1–4 条一般够用）。 */
export const SIMPLIFIED_TIPS_MAX = 10

/** 生成课程 tips 只允许两类可验证前缀（生成器写入 / 校验器校验共用同一来源）。 */
export const CODE_TIP_RECOMMENDED_PREFIX = '推荐码：'
export const CODE_TIP_COMPAT_PREFIX = '兼容映射：'
export const CODE_TIP_PREFIXES = Object.freeze([CODE_TIP_RECOMMENDED_PREFIX, CODE_TIP_COMPAT_PREFIX])

export const PASS_ACCURACY = Object.freeze({ accuracy: 0.85, mode: 'accuracy' })
export const PASS_REVIEW = Object.freeze({ accuracy: 0.85, mode: 'accuracy', minCpm: 45 })
export const PASS_SPEED = Object.freeze({ accuracy: 0.85, mode: 'speed', minCpm: 45, starCpm: [45, 60, 75] })
export const PASS_EXAM = Object.freeze({
  accuracy: 0.85,
  mode: 'accuracy-speed',
  minCpm: 45,
  starCpm: [45, 60, 75],
})

export const WORD_PLAN_DEFAULT = Object.freeze({ maxUnfamiliar: 0, lengthRange: [2, 5] })
export const WORD_PLAN_INTRO = Object.freeze({ maxUnfamiliar: 0, lengthRange: [2, 3] })

/** 课程类型 → 阶段最低词量（直接使用 core 的唯一口径，不在脚本里手抄数值）。 */
export const STAGE_MIN_BY_KIND = KIND_STAGE_MIN_WORDS

/**
 * 章节顺序（内容章）：单韵母 → 单声母 → 复合声母 → 前响 → 中响 → 后响 →
 * 基本后鼻 → 基本前鼻 → 带介前鼻 → 带介后鼻 → 零声母。
 * 顺序经过生成课程词池实验调整，目标是增大后续课程候选词池；实验结论见 docs/ARCHITECTURE.md。
 * 每项只列该类别下的规范原子；实际是否生成章节由方案 learn 原子决定。
 */
const MODULES = Object.freeze([
  { key: 'single-final', type: 'final', title: '单韵母', atoms: ['i', 'u', 'e', 'a', 'o', 'v'] },
  {
    key: 'single-initial',
    type: 'initial',
    title: '单声母',
    atoms: INITIALS.filter((name) => name !== 'zh' && name !== 'ch' && name !== 'sh'),
  },
  { key: 'compound-initial', type: 'initial', title: '复合声母', atoms: ['sh', 'zh', 'ch'] },
  { key: 'front-diphthong', type: 'final', title: '前响复韵母', atoms: ['ao', 'ou', 'ai', 'ei'] },
  { key: 'mid-diphthong', type: 'final', title: '中响复韵母', atoms: ['iao', 'ui', 'iu', 'uai'] },
  { key: 'back-diphthong', type: 'final', title: '后响复韵母', atoms: ['uo', 'ie', 'ia', 'ue', 'ua', 've'] },
  { key: 'back-nasal', type: 'final', title: '基本后鼻韵母', atoms: ['ing', 'ong', 'ang', 'eng'] },
  { key: 'front-nasal', type: 'final', title: '基本前鼻韵母', atoms: ['an', 'en', 'in', 'un'] },
  { key: 'medial-front-nasal', type: 'final', title: '带介前鼻韵母', atoms: ['ian', 'uan'] },
  { key: 'medial-back-nasal', type: 'final', title: '带介后鼻韵母', atoms: ['iang', 'iong', 'uang'] },
  { key: 'zero-initial', type: 'zero', title: '零声母', atoms: [...ZERO_INITIALS] },
])

// ── 原子工具（方案数据 + engine.diff 派生的唯一口径） ──────────

function tableOf(scheme, type) {
  if (type === 'initial') return scheme.initials
  if (type === 'final') return scheme.finals
  if (type === 'zero') return scheme.zeroInitial
  return null
}

function atomExistsInScheme(scheme, atom) {
  const ref = parseAtomId(atom)
  const table = ref ? tableOf(scheme, ref.type) : null
  return Boolean(table) && Object.prototype.hasOwnProperty.call(table, ref.key)
}

/** 原子在方案数据里的全部键位（小写，保持数据顺序）。 */
export function keysOfAtom(scheme, atom) {
  const ref = parseAtomId(atom)
  const values = ref ? (tableOf(scheme, ref.type)?.[ref.key] ?? []) : []
  return values.map((value) => String(value).toLowerCase())
}

/** 原子是否属于「与全拼一致」的 free 集合（freeSets = engine.freeSets()）。 */
export function isFreeAtom(atom, freeSets) {
  const ref = parseAtomId(atom)
  if (!ref) return false
  if (ref.type === 'initial') return freeSets.initials.has(ref.key)
  if (ref.type === 'final') return freeSets.finals.has(ref.key)
  return freeSets.zero.has(ref.key)
}

/** 全部 free 原子（规范顺序：声母 → 韵母 → 零声母）。 */
export function freeAtomIdsOf(scheme, freeSets) {
  const collect = (type, keys, set) =>
    keys
      .filter((key) => atomExistsInScheme(scheme, atomId(type, key)) && set.has(key))
      .map((key) => atomId(type, key))
  return [
    ...collect('initial', INITIALS, freeSets.initials),
    ...collect('final', FINALS, freeSets.finals),
    ...collect('zero', ZERO_INITIALS, freeSets.zero),
  ]
}

/** 只保留存在 learn 原子的内容章，顺序遵循章节模板。 */
export function buildContentModules(scheme, freeSets) {
  const modules = []
  for (const module of MODULES) {
    const atoms = module.atoms.filter((key) => {
      const atom = atomId(module.type, key)
      return atomExistsInScheme(scheme, atom) && !isFreeAtom(atom, freeSets)
    })
    if (atoms.length === 0) continue
    modules.push({ ...module, atoms })
  }
  return modules
}

/**
 * 推荐码例外 / 兼容编码按「目标音节最后学到的 learn 原子」归组（课程模板策略）。
 *
 * @param analysis core `analyzeSchemeCodes(def)` 的结果
 * @param modules `buildContentModules(scheme, freeSets)` 的结果（与课程章节共用，避免重复计算）
 * @param freeSets `engine.freeSets()`
 * @returns {{ groups: Map<'free'|AtomId, object[]> }}
 *   Entry = { syllable, recommended: string|null, compat: string[] }（tips 文本只消费这三个字段）
 */
export function groupCodeEntries(analysis, modules, freeSets) {
  const order = new Map()
  let index = 0
  for (const module of modules) {
    for (const key of module.atoms) {
      index += 1
      order.set(atomId(module.type, key), index)
    }
  }
  const groups = new Map()
  for (const item of analysis.entries) {
    // 只有「推荐码 != 主键组合」的例外与额外兼容码才需要写进 tips。
    if (!item.recommendedOverride && item.compat.length === 0) continue
    const completion = (() => {
      if (item.atoms.length === 1) {
        return isFreeAtom(item.atoms[0], freeSets) ? 'free' : item.atoms[0]
      }
      const orders = item.atoms.map((atom) => (isFreeAtom(atom, freeSets) ? 0 : (order.get(atom) ?? 0)))
      if (orders.every((value) => value === 0)) return 'free'
      const max = Math.max(...orders)
      return item.atoms[orders.indexOf(max)]
    })()
    const entry = {
      syllable: item.syllable,
      recommended: item.recommendedOverride ? item.recommended : null,
      compat: item.compat,
    }
    const list = groups.get(completion) ?? []
    list.push(entry)
    groups.set(completion, list)
  }
  for (const list of groups.values()) list.sort((a, b) => a.syllable.localeCompare(b.syllable))
  return { groups }
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
