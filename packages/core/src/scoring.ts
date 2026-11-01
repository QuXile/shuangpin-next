/**
 * 通过标准与星级判定（纯函数；唯一权威）。
 *
 * 口径（docs/ARCHITECTURE.md §6）：
 * - 普通课（accuracy 模式）：完成即通过；星级按正确率（★★≥90%、★★★≥95% 未揭示）；若配置 minCpm，低于速度底线不通过；
 * - 严格阶段（speed / accuracy-speed）：通过 = 正确率 ≥ criteria.accuracy 且 cpm ≥ minCpm
 *   （工具条门槛由 stageGate 保证只在达标后可完成）；
 * - speed 模式星级按 starCpm；accuracy-speed 模式 2★ ≥90%+starCpm[1]，
 *   3★ ≥95%+starCpm[2] 且未揭示答案；
 * - 入门课（intro）完成即通过，统一 ★★★。
 */
import type {
  LessonDef,
  LessonMetrics,
  LessonResult,
  PassCriteria,
  PassCriteriaLine,
} from './types.ts'

const STAR2_ACCURACY = 0.9
const STAR3_ACCURACY = 0.95

/** 指标档位（展示用；数值已是百分数或 WPM，不在核心逻辑中参与判定）。 */
export interface MetricTier {
  /** 本档下界（含）；null 表示低于第一档。 */
  min: number | null
  /** 本档上界（不含）；null 表示高于最后一档。 */
  max: number | null
  /** 展示标签，例如 `<85%`、`85–90%`、`≥95%`、`<30 WPM`。 */
  label: string
  /** 该档对应星级；null 表示该指标只作通过底线，不参与星级分档。 */
  stars: 0 | 1 | 2 | 3 | null
}

function buildTiers(thresholds: readonly number[], unit: string, graded: boolean): MetricTier[] {
  const values = [...new Set(thresholds.filter((value) => Number.isFinite(value)).map((value) => Math.round(value)))]
    .sort((a, b) => a - b)
  if (values.length === 0) return []
  const tiers: MetricTier[] = []
  const starsAt = (index: number): 0 | 1 | 2 | 3 | null =>
    graded ? (Math.min(index, 3) as 0 | 1 | 2 | 3) : null
  tiers.push({ min: null, max: values[0]!, label: `<${values[0]}${unit}`, stars: starsAt(0) })
  for (let index = 1; index < values.length; index += 1) {
    tiers.push({
      min: values[index - 1]!,
      max: values[index]!,
      label: `${values[index - 1]}–${values[index]}${unit}`,
      stars: starsAt(index),
    })
  }
  const last = values[values.length - 1]!
  tiers.push({ min: last, max: null, label: `≥${last}${unit}`, stars: starsAt(values.length) })
  return tiers
}

/**
 * 正确率档位：
 * - 普通/准确率+速度：通过线、90%、95% 四档；
 * - 速度模式：正确率作为通过底线；
 */
export function accuracyTiers(criteria: PassCriteria): MetricTier[] {
  const mode = criteria.mode ?? 'accuracy'
  const thresholds = [Math.round(criteria.accuracy * 100)]
  if (mode !== 'speed') thresholds.push(90, 95)
  // 速度课只展示通过线两档，但两档同样带 0★/★ 星级。
  return buildTiers(thresholds, '%', true)
}

/**
 * 速度档位：
 * - speed / accuracy-speed：最低速度 + 两档星级速度，四档；
 * - accuracy + minCpm：只有速度底线，两档；
 * - 未配置速度要求：null，只显示原始速度。
 */
export function speedTiers(criteria: PassCriteria): MetricTier[] | null {
  const mode = criteria.mode ?? 'accuracy'
  const minCpm = criteria.minCpm ?? 0
  if (mode === 'speed' || mode === 'accuracy-speed') {
    const fallback = mode === 'speed' ? [minCpm, 45, 60] : [minCpm, 40, 50]
    const starCpm = criteria.starCpm ?? fallback
    return buildTiers([minCpm, ...starCpm].filter((value) => value > 0), ' WPM', true)
  }
  return minCpm > 0 ? buildTiers([minCpm], ' WPM', true) : null
}

/** 当前值落入的档位；tiers 必须来自 accuracyTiers / speedTiers。 */
export function tierOf(tiers: readonly MetricTier[], value: number): MetricTier | null {
  if (tiers.length === 0) return null
  for (const tier of tiers) {
    if (tier.max === null || value < tier.max) return tier
  }
  return tiers[tiers.length - 1] ?? null
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`
}

/** 判定一节课是否通过、获得几星（lessons 数据缺失评分配置时显式报错） */
export function evaluateLesson(lesson: LessonDef, metrics: LessonMetrics): LessonResult {
  if (lesson.kind === 'intro') {
    // 入门课完成即通过，并统一记三星（与普通课程同一套星级展示）
    return { passed: true, stars: 3, reasons: [] }
  }
  const criteria = lesson.passCriteria
  if (!criteria) {
    throw new Error(`课程 ${lesson.id} 缺少 passCriteria`)
  }
  const mode = criteria.mode ?? 'accuracy'
  if (mode === 'accuracy') {
    // 普通课 / 带速度底线的复习课：星级按正确率，速度底线不达标则不通过
    const minCpm = criteria.minCpm ?? 0
    if (minCpm > 0 && metrics.cpm < minCpm) {
      return {
        passed: false,
        stars: 0,
        reasons: [`速度 ${metrics.cpm} < ${minCpm} WPM`],
      }
    }
    let accuracyStars: 1 | 2 | 3 = 1
    if (metrics.accuracy >= STAR2_ACCURACY) accuracyStars = 2
    if (metrics.accuracy >= STAR3_ACCURACY && !metrics.revealed) accuracyStars = 3
    return { passed: true, stars: accuracyStars, reasons: [] }
  }
  const speedRequired = mode === 'speed' || mode === 'accuracy-speed'
  const minCpm = criteria.minCpm ?? 0
  const accuracyOk = metrics.accuracy >= criteria.accuracy
  const speedOk = !speedRequired || metrics.cpm >= minCpm
  if (!accuracyOk || !speedOk) {
    const reasons: string[] = []
    if (!accuracyOk) reasons.push(`正确率 ${pct(metrics.accuracy)} < ${pct(criteria.accuracy)}`)
    if (!speedOk) reasons.push(`速度 ${metrics.cpm} < ${minCpm} WPM`)
    return { passed: false, stars: 0, reasons }
  }

  let stars: 1 | 2 | 3 = 1
  if (mode === 'speed') {
    const thresholds = criteria.starCpm ?? [minCpm, 45, 60]
    if (metrics.cpm >= thresholds[1]) stars = 2
    if (metrics.cpm >= thresholds[2]) stars = 3
  } else if (mode === 'accuracy-speed') {
    const thresholds = criteria.starCpm ?? [minCpm, 40, 50]
    if (metrics.accuracy >= STAR2_ACCURACY && metrics.cpm >= thresholds[1]) stars = 2
    if (
      metrics.accuracy >= STAR3_ACCURACY &&
      metrics.cpm >= thresholds[2] &&
      !metrics.revealed
    ) {
      stars = 3
    }
  } else {
    if (metrics.accuracy >= STAR2_ACCURACY) stars = 2
    if (metrics.accuracy >= STAR3_ACCURACY && !metrics.revealed) stars = 3
  }
  return { passed: true, stars, reasons: [] }
}

/**
 * 生成「评分规则」展示文案（与 evaluateLesson 同一份门槛数据）。
 * 只展示 1–3 星三档，1★ 即最低通过。
 */
export function describePassCriteria(criteria: PassCriteria): PassCriteriaLine[] {
  const mode = criteria.mode ?? 'accuracy'
  const minCpm = criteria.minCpm ?? 0
  const accuracy = pct(criteria.accuracy)
  const speedFloor = minCpm > 0 ? `，速度 ≥${minCpm} WPM` : ''
  if (mode === 'speed') {
    const thresholds = criteria.starCpm ?? [minCpm, 45, 60]
    return [
      { label: '★', text: `正确率 ≥${accuracy}，速度 ≥${thresholds[0]} WPM。` },
      { label: '★★', text: `正确率 ≥${accuracy}，速度 ≥${thresholds[1]} WPM。` },
      { label: '★★★', text: `正确率 ≥${accuracy}，速度 ≥${thresholds[2]} WPM。` },
    ]
  }
  if (mode === 'accuracy-speed') {
    const thresholds = criteria.starCpm ?? [minCpm, 40, 50]
    return [
      { label: '★', text: `正确率 ≥${accuracy} 且 ≥${thresholds[0]} WPM。` },
      { label: '★★', text: `正确率 ≥90% 且 ≥${thresholds[1]} WPM。` },
      { label: '★★★', text: `正确率 ≥95%、≥${thresholds[2]} WPM 且未揭示答案。` },
    ]
  }
  return [
    { label: '★', text: `正确率 ≥${accuracy}${speedFloor}。` },
    { label: '★★', text: `正确率 ≥90%${speedFloor}。` },
    { label: '★★★', text: `正确率 ≥95%${speedFloor} 且未揭示答案。` },
  ]
}
