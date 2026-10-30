/**
 * 学习进度持久化（localStorage）：只读写/校验，不重新判星（判定由 core evaluateLesson 负责）。
 * 键：shuangpin-next:progress:<schemeId>；值：Record<lessonId, LessonProgress>。
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { LessonProgress, LessonResult } from '@shuangpin/core'

const progressKey = (schemeId: string): string => `shuangpin-next:progress:${schemeId}`

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** 逐条校验 localStorage 内容；损坏的条目直接丢弃，不阻塞启动。 */
function sanitizeProgress(raw: unknown): Record<string, LessonProgress> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const result: Record<string, LessonProgress> = {}
  for (const [lessonId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const entry = value as Record<string, unknown>
    if (typeof entry.passed !== 'boolean') continue
    if (!isFiniteNumber(entry.stars) || !isFiniteNumber(entry.bestAccuracy)) continue
    if (!isFiniteNumber(entry.attempts) || !isFiniteNumber(entry.updatedAt)) continue
    result[lessonId] = {
      passed: entry.passed,
      stars: Math.max(0, Math.min(3, Math.floor(entry.stars))),
      bestAccuracy: Math.max(0, Math.min(1, entry.bestAccuracy)),
      attempts: Math.max(0, Math.floor(entry.attempts)),
      updatedAt: entry.updatedAt,
    }
  }
  return result
}

function readProgress(schemeId: string): Record<string, LessonProgress> {
  if (!schemeId) return {}
  try {
    const raw = localStorage.getItem(progressKey(schemeId))
    if (!raw) return {}
    return sanitizeProgress(JSON.parse(raw) as unknown)
  } catch {
    return {}
  }
}

export const useProgressStore = defineStore('progress', () => {
  const schemeId = ref('')
  const records = ref<Record<string, LessonProgress>>({})

  function load(id: string): void {
    schemeId.value = id
    records.value = readProgress(id)
  }

  function persist(): void {
    if (!schemeId.value) return
    try {
      localStorage.setItem(progressKey(schemeId.value), JSON.stringify(records.value))
    } catch {
      /* 存储空间不足/隐私模式：保留内存中的进度，不中断练习 */
    }
  }

  /** 记录一次完整阶段结果：passed 与星级取历史最优，attempts 累加。 */
  function record(lessonId: string, result: LessonResult, accuracy: number): LessonProgress {
    const previous = records.value[lessonId]
    const next: LessonProgress = {
      passed: Boolean(previous?.passed) || result.passed,
      stars: Math.max(previous?.stars ?? 0, result.stars),
      bestAccuracy: Math.max(previous?.bestAccuracy ?? 0, accuracy),
      attempts: (previous?.attempts ?? 0) + 1,
      updatedAt: Date.now(),
    }
    records.value = { ...records.value, [lessonId]: next }
    persist()
    return next
  }

  function clear(): void {
    records.value = {}
    persist()
  }

  return { schemeId, records, load, record, clear }
})
