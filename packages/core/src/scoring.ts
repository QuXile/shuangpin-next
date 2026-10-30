/**
 * 通过标准与星级判定（纯函数；唯一权威）。
 *
 * 口径（docs/ARCHITECTURE.md §6）：
 * - 普通课（accuracy 模式）：用户点击「完成本课」即通过，星级按正确率（★★≥95%、★★★≥98% 未揭示）；
 * - 严格阶段（speed / accuracy-speed）：通过 = 正确率 ≥ criteria.accuracy 且 cpm ≥ minCpm
 *   （工具条门槛由 stageGate 保证只在达标后可完成）；
 * - speed 模式星级按 starCpm；accuracy-speed 模式 2★ ≥95%+starCpm[1]，
 *   3★ ≥98%+starCpm[2] 且未揭示答案；
 * - 入门课（intro）完成即通过，统一 ★★★。
 */
import type {
  LessonDef,
  LessonMetrics,
  LessonResult,
  PassCriteria,
  PassCriteriaLine,
} from './types.ts'

const STAR2_ACCURACY = 0.95
const STAR3_ACCURACY = 0.98

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
    // 普通课：完成即通过，星级按当前阶段正确率
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
    if (!speedOk) reasons.push(`速度 ${metrics.cpm} < ${minCpm} 字/分`)
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
 * 只展示 1–3 星三档：1★ 即最低限度的通过，不再单列「通过」等级。
 */
export function describePassCriteria(criteria: PassCriteria): PassCriteriaLine[] {
  const mode = criteria.mode ?? 'accuracy'
  const minCpm = criteria.minCpm ?? 0
  const accuracy = pct(criteria.accuracy)
  if (mode === 'speed') {
    const thresholds = criteria.starCpm ?? [minCpm, 45, 60]
    return [
      { label: '★', text: `正确率 ≥${accuracy}，速度 ≥${thresholds[0]} 字/分。` },
      { label: '★★', text: `正确率 ≥${accuracy}，速度 ≥${thresholds[1]} 字/分。` },
      { label: '★★★', text: `正确率 ≥${accuracy}，速度 ≥${thresholds[2]} 字/分。` },
    ]
  }
  if (mode === 'accuracy-speed') {
    const thresholds = criteria.starCpm ?? [minCpm, 40, 50]
    return [
      { label: '★', text: `正确率 ≥${accuracy} 且 ≥${thresholds[0]} 字/分。` },
      { label: '★★', text: `正确率 ≥95% 且 ≥${thresholds[1]} 字/分。` },
      { label: '★★★', text: `正确率 ≥98%、≥${thresholds[2]} 字/分且未揭示答案。` },
    ]
  }
  return [
    { label: '★', text: `正确率 ≥${accuracy}。` },
    { label: '★★', text: '正确率 ≥95%。' },
    { label: '★★★', text: '正确率 ≥98% 且未揭示答案。' },
  ]
}
