/**
 * 会话结束统计与反馈文案的唯一实现。
 * 课程练习结束卡（usePractice）与练习场文章总结（TrainingPage）都从这里取数，
 * 不再各自计算 accuracy% / durationSec / keyErrors 排序。
 */
import {
  keyErrorEntriesWithAtoms,
  sessionMetrics,
  type AtomId,
  type SessionFeedback,
  type SessionState,
} from '@shuangpin/core'

/** 错误键位排行的一行：应敲的键 vs 实际按下的键。 */
export interface KeyErrorRow {
  expected: string
  typed: string
  count: number
  /** 该键位对应的知识点（声母 / 韵母 / 零声母） */
  atomId?: AtomId
}

/** 阶段考核本次评分；练习模式不产生评分。 */
export interface SessionRating {
  passed: boolean
  stars: 0 | 1 | 2 | 3
}

export interface SessionSummary {
  completedWords: number
  /** 0–100 的整数百分比 */
  accuracy: number
  cpm: number
  /** 错误次数（会话 stats.errors） */
  errors: number
  /** 至少 1 秒，避免 0 除/闪现 0 秒 */
  durationSec: number
  keyErrorRows: KeyErrorRow[]
}

/**
 * 会话统计快照。`now` 必须与创建会话使用同一时钟（performance.now），
 * 已结束会话使用 stats.finishedAt，不再读取 now。
 */
export function buildSessionSummary(session: SessionState, now: number): SessionSummary {
  const metrics = sessionMetrics(session, now)
  const finishedAt = session.stats.finishedAt ?? now
  return {
    completedWords: metrics.completedWords,
    accuracy: Math.round(metrics.accuracy * 100),
    cpm: metrics.cpm,
    errors: session.stats.errors,
    durationSec: Math.max(1, Math.round((finishedAt - session.stats.startedAt) / 1000)),
    keyErrorRows: keyErrorEntriesWithAtoms(session).map((entry) => ({
      expected: entry.expected.toUpperCase(),
      typed: entry.typed.toUpperCase(),
      count: entry.count,
      ...(entry.atomId ? { atomId: entry.atomId } : {}),
    })),
  }
}

/** 供 aria-live 播报的反馈文案（错误 / 词语完成）。 */
export function liveMessageOf(feedback: SessionFeedback | null | undefined): string {
  if (!feedback) return ''
  if (feedback.kind === 'wrong') return feedback.message ?? '键位错误'
  if (feedback.kind === 'word-complete') return feedback.message ?? '词语完成'
  return ''
}

/** 声音反馈所需的最小播放接口（由 sound store 实现；此处只做分支，不依赖 Pinia）。 */
interface FeedbackPlayer {
  playKey(): void
  playError(): void
  playComplete(): void
}

/** 一次输入后的声音反馈：错误 → 错误音；词完成 → 完成音；其余 → 按键音。 */
export function playFeedback(
  player: FeedbackPlayer,
  feedback: SessionFeedback | null | undefined,
): void {
  if (feedback?.kind === 'wrong') player.playError()
  else if (feedback?.kind === 'word-complete') player.playComplete()
  else player.playKey()
}
