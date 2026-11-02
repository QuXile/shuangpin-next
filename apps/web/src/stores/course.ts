/**
 * 课程/方案 store：只负责数据加载、方案切换与进度委派。
 * 规则（锁课/下一课/进度统计）来自 core 与 lib/lessonView；store 不复制判题/评分逻辑。
 */
import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import {
  createSchemeEngine,
  type Curriculum,
  type LessonDef,
  type LessonResult,
  type PracticeStage,
  type SchemeDef,
  type SchemeEngine,
  type SchemeIndexFile,
  type SchemeSummary,
} from '@shuangpin/core'
import { loadCurriculum, loadIndex, loadLexicon, loadScheme } from '@/lib/data'
import { canStartLesson, currentLessonId, nextLessonId, passedLessonCount } from '@shuangpin/core'
import { STORAGE_KEYS, readString, removeKey, writeString } from '@/lib/storage'
import { useProgressStore } from '@/stores/progress'

type CourseStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface SchemeOption {
  id: string
  name: string
  meta: SchemeSummary
}

/** 主选择器固定展示前五套；其余全部收进「更多方案」。 */
const PRIMARY_SCHEME_COUNT = 5

function readUnlockedAll(): boolean {
  return readString(STORAGE_KEYS.unlockAll) === '1'
}

function readSavedScheme(): string {
  return readString(STORAGE_KEYS.scheme) ?? ''
}

function saveScheme(id: string): void {
  writeString(STORAGE_KEYS.scheme, id)
}

/** 按 recommendedOrder（缺失时用 schemes 顺序）展开方案摘要。 */
function orderedSchemes(index: SchemeIndexFile): SchemeSummary[] {
  const order =
    index.recommendedOrder.length > 0
      ? index.recommendedOrder
      : index.schemes.map((item) => item.id)
  const byId = new Map(index.schemes.map((item) => [item.id, item]))
  return order
    .map((id) => byId.get(id))
    .filter((item): item is SchemeSummary => item !== undefined)
}

function toOptions(schemes: readonly SchemeSummary[]): SchemeOption[] {
  return schemes.map((item) => ({ id: item.id, name: item.name, meta: item }))
}

export const useCourseStore = defineStore('course', () => {
  const progressStore = useProgressStore()

  const status = ref<CourseStatus>('idle')
  const error = ref('')
  const unlockedAll = ref(readUnlockedAll())
  const schemeIndex = shallowRef<SchemeIndexFile | null>(null)
  const schemeId = ref('')
  /** 当前是「仅支持练习」预览：有 scheme 与键位图，但无课程/进度。 */
  const previewMode = ref(false)
  const scheme = shallowRef<SchemeDef | null>(null)
  const curriculum = shallowRef<Curriculum | null>(null)
  const lexiconWordCount = ref(0)
  /** 当前方案引擎：所有页面共用这一份派生，不再各自 createSchemeEngine。 */
  const engine = computed<SchemeEngine | null>(() =>
    scheme.value ? createSchemeEngine(scheme.value) : null,
  )

  let bootPromise: Promise<void> | null = null
  /**
   * 加载请求代号：init / selectScheme 共用。只有最后一次发起的请求可以提交数据与状态；
   * 旧请求完成时静默丢弃，避免快速切换方案时先发的慢请求覆盖后发的选择。
   */
  let loadEpoch = 0

  function beginLoad(): number {
    loadEpoch += 1
    return loadEpoch
  }

  function isCurrentLoad(epoch: number): boolean {
    return epoch === loadEpoch
  }

  /** 统一加载状态机：loading → ready / error，并丢弃过期请求。 */
  async function runLoad(task: (epoch: number) => Promise<void>): Promise<void> {
    const epoch = beginLoad()
    status.value = 'loading'
    error.value = ''
    try {
      await task(epoch)
      if (!isCurrentLoad(epoch)) return
      status.value = 'ready'
    } catch (cause) {
      if (!isCurrentLoad(epoch)) return
      error.value = cause instanceof Error ? cause.message : String(cause)
      status.value = 'error'
    }
  }

  const lessons = computed<LessonDef[]>(() => curriculum.value?.lessons ?? [])
  const wordCount = computed<number>(() => lexiconWordCount.value)
  const ready = computed<boolean>(() => status.value === 'ready')
  const progress = computed(() => progressStore.records)
  const passedCount = computed(() => passedLessonCount(lessons.value, progress.value))
  const progressPercent = computed(() => {
    if (lessons.value.length === 0) return 0
    return Math.round((passedCount.value / lessons.value.length) * 100)
  })

  const allSchemeOptions = computed<SchemeOption[]>(() => {
    const index = schemeIndex.value
    return index ? toOptions(orderedSchemes(index)) : []
  })

  const schemeOptions = computed<SchemeOption[]>(() => {
    const index = schemeIndex.value
    if (!index) return []
    const supported = new Set(index.courseSupported)
    const primary = new Set(
      orderedSchemes(index)
        .slice(0, PRIMARY_SCHEME_COUNT)
        .map((item) => item.id),
    )
    return allSchemeOptions.value.filter(
      (option) => supported.has(option.id) && primary.has(option.id),
    )
  })

  const primarySchemeIds = computed<string[]>(() => schemeOptions.value.map((option) => option.id))

  async function applyScheme(id: string, epoch: number): Promise<void> {
    const [def, curriculumFile, lexicon] = await Promise.all([
      loadScheme(id),
      loadCurriculum(id),
      loadLexicon(),
    ])
    if (!isCurrentLoad(epoch)) return
    schemeId.value = id
    scheme.value = def
    curriculum.value = curriculumFile
    lexiconWordCount.value = lexicon.words.length
    previewMode.value = false
    progressStore.load(id)
    saveScheme(id)
  }

  /** 预览 practice-only 方案：只加载键位映射，课程与进度留空。 */
  async function previewScheme(id: string): Promise<void> {
    if (!id || (id === schemeId.value && previewMode.value)) return
    await runLoad(async (epoch) => {
      const [def, lexicon] = await Promise.all([loadScheme(id), loadLexicon()])
      if (!isCurrentLoad(epoch)) return
      schemeId.value = id
      scheme.value = def
      curriculum.value = null
      lexiconWordCount.value = lexicon.words.length
      previewMode.value = true
      progressStore.load('')
    })
  }

  /** 所有页面共用的方案切换：课程方案走课程加载，practice-only 走键位预览。 */
  async function selectScheme(id: string): Promise<void> {
    if (!id || id === schemeId.value) return
    const supported = new Set(schemeIndex.value?.courseSupported ?? [])
    if (supported.has(id)) {
      await runLoad(async (epoch) => {
        await applyScheme(id, epoch)
      })
    } else {
      await previewScheme(id)
    }
  }

  async function runInit(): Promise<void> {
    await runLoad(async (epoch) => {
      const index = await loadIndex()
      if (!isCurrentLoad(epoch)) return
      schemeIndex.value = index
      const supported = new Set(index.courseSupported)
      const candidates = [
        readSavedScheme(),
        index.defaultScheme,
        index.courseSupported[0],
        index.schemes[0]?.id,
      ]
      const initial = candidates.find((id): id is string => Boolean(id) && supported.has(id))
      if (!initial) throw new Error('没有可用的双拼方案')
      await applyScheme(initial, epoch)
    })
  }

  /** single-flight 数据引导：并发调用共享同一个 Promise，失败后允许重试。 */
  function init(): Promise<void> {
    if (status.value === 'ready') return Promise.resolve()
    // 正在切换方案/预览时不要重入 init，否则会用默认方案覆盖用户刚选的方案。
    if (status.value === 'loading' && !bootPromise) return Promise.resolve()
    if (!bootPromise) {
      bootPromise = runInit().finally(() => {
        bootPromise = null
      })
    }
    return bootPromise
  }

  function getLesson(id: string): LessonDef | undefined {
    return lessons.value.find((lesson) => lesson.id === id)
  }

  function canStart(id: string): boolean {
    return canStartLesson(lessons.value, progress.value, id, unlockedAll.value)
  }

  /** 切换全部课程解锁（持久化；恢复锁定时移除本地标记） */
  function toggleUnlockedAll(): void {
    unlockedAll.value = !unlockedAll.value
    if (unlockedAll.value) writeString(STORAGE_KEYS.unlockAll, '1')
    else removeKey(STORAGE_KEYS.unlockAll)
  }

  function nextLesson(id: string): string | undefined {
    return nextLessonId(lessons.value, id)
  }

  function currentLesson(): string | undefined {
    return currentLessonId(lessons.value, progress.value, unlockedAll.value)
  }

  function recordResult(lessonId: string, result: LessonResult, accuracy: number): void {
    progressStore.record(lessonId, result, accuracy)
  }

  function markStageCleared(lessonId: string, stage: PracticeStage): void {
    progressStore.markStageCleared(lessonId, stage)
  }

  /** 清除当前方案的全部学习进度（页面确认后调用） */
  function clearProgress(): void {
    progressStore.clear()
  }

  return {
    status,
    error,
    unlockedAll,
    schemeId,
    previewMode,
    scheme,
    engine,
    curriculum,
    lessons,
    wordCount,
    ready,
    progress,
    passedCount,
    progressPercent,
    schemeOptions,
    allSchemeOptions,
    primarySchemeIds,
    init,
    selectScheme,
    getLesson,
    canStart,
    toggleUnlockedAll,
    nextLesson,
    currentLesson,
    recordResult,
    markStageCleared,
    clearProgress,
  }
})
