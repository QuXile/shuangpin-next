/**
 * 课程/方案数据 store：只负责加载、方案切换与进度存储委派。
 * 评分/阶段/选词等规则全部在 @shuangpin/core；锁课/章节视图在 lib/lessonView。
 */
import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import {
  createSchemeEngine,
  type Curriculum,
  type LessonDef,
  type LessonResult,
  type PoolIndexFile,
  type SchemeDef,
  type SchemeEngine,
  type SchemeIndexFile,
  type SchemeSummary,
} from '@shuangpin/core'
import { loadCurriculum, loadPoolIndex, loadScheme, loadSchemeIndex } from '@/lib/data'
import {
  canStartLesson,
  currentLessonId,
  nextLessonId,
  passedLessonCount,
} from '@/lib/lessonView'
import { useProgressStore } from '@/stores/progress'

export type { LessonView } from '@/lib/lessonView'

export type CourseStatus = 'idle' | 'loading' | 'ready' | 'error'

const UNLOCK_ALL_KEY = 'shuangpin-next:unlock-all'

function readUnlockedAll(): boolean {
  try {
    return localStorage.getItem(UNLOCK_ALL_KEY) === '1'
  } catch {
    return false
  }
}

const SCHEME_KEY = 'shuangpin-next:scheme'

function readSavedScheme(): string {
  try {
    return localStorage.getItem(SCHEME_KEY) ?? ''
  } catch {
    return ''
  }
}

function saveScheme(id: string): void {
  try {
    localStorage.setItem(SCHEME_KEY, id)
  } catch {
    /* 隐私模式：保留当前会话内选择即可 */
  }
}

export interface SchemeOption {
  id: string
  name: string
  meta: SchemeSummary
}

export const useCourseStore = defineStore('course', () => {
  const progressStore = useProgressStore()

  const status = ref<CourseStatus>('idle')
  const error = ref('')
  const unlockedAll = ref(readUnlockedAll())
  const schemeIndex = shallowRef<SchemeIndexFile | null>(null)
  const schemeId = ref('')
  /** 当前是「纯练习方案」预览：有 scheme 与键位图，但无课程/进度。 */
  const previewMode = ref(false)
  const scheme = shallowRef<SchemeDef | null>(null)
  const curriculum = shallowRef<Curriculum | null>(null)
  const poolIndex = shallowRef<PoolIndexFile | null>(null)
  const engine = computed<SchemeEngine | null>(() => (scheme.value ? createSchemeEngine(scheme.value) : null))

  let bootPromise: Promise<void> | null = null
  /**
   * 加载请求代号：init / setScheme / previewScheme 共用。
   * 只有最后一次发起的请求可以提交数据与状态；旧请求完成时静默丢弃，
   * 避免快速切换方案时先发的慢请求覆盖后发的选择。
   */
  let loadEpoch = 0

  function beginLoad(): number {
    loadEpoch += 1
    return loadEpoch
  }

  function isCurrentLoad(epoch: number): boolean {
    return epoch === loadEpoch
  }

  const lessons = computed<LessonDef[]>(() => curriculum.value?.lessons ?? [])
  const wordCount = computed<number>(() => poolIndex.value?.uniqueWords ?? 0)
  const ready = computed<boolean>(() => status.value === 'ready')
  const progress = computed(() => progressStore.records)
  const passedCount = computed(() => passedLessonCount(lessons.value, progress.value))
  const progressPercent = computed(() => {
    if (lessons.value.length === 0) return 0
    return Math.round((passedCount.value / lessons.value.length) * 100)
  })

  const schemeOptions = computed<SchemeOption[]>(() => {
    const index = schemeIndex.value
    if (!index) return []
    const supported = new Set(index.courseSupported)
    const order = index.recommendedOrder.length > 0
      ? index.recommendedOrder
      : index.schemes.map((item) => item.id)
    return order
      .map((id) => index.schemes.find((item) => item.id === id))
      .filter((item): item is SchemeSummary => item !== undefined && supported.has(item.id))
      .map((item) => ({ id: item.id, name: item.name, meta: item }))
  })

  const allSchemeOptions = computed<SchemeOption[]>(() => {
    const index = schemeIndex.value
    if (!index) return []
    const order = index.recommendedOrder.length > 0
      ? index.recommendedOrder
      : index.schemes.map((item) => item.id)
    return order
      .map((id) => index.schemes.find((item) => item.id === id))
      .filter((item): item is SchemeSummary => item !== undefined)
      .map((item) => ({ id: item.id, name: item.name, meta: item }))
  })

  async function applyScheme(id: string, epoch: number): Promise<void> {
    const [def, curriculumFile, pools] = await Promise.all([
      loadScheme(id),
      loadCurriculum(id),
      loadPoolIndex(),
    ])
    // 已被更新的请求取代：不提交数据，交给最后一次请求决定最终方案。
    if (!isCurrentLoad(epoch)) return
    schemeId.value = id
    scheme.value = def
    curriculum.value = curriculumFile
    poolIndex.value = pools
    previewMode.value = false
    progressStore.load(id)
    saveScheme(id)
  }

  /** 预览 practice-only 方案：只加载键位映射，课程与进度留空。 */
  async function previewScheme(id: string): Promise<void> {
    if (!id || (id === schemeId.value && previewMode.value)) return
    const epoch = beginLoad()
    status.value = 'loading'
    error.value = ''
    try {
      const [def, pools] = await Promise.all([loadScheme(id), loadPoolIndex()])
      if (!isCurrentLoad(epoch)) return
      schemeId.value = id
      scheme.value = def
      curriculum.value = null
      poolIndex.value = pools
      previewMode.value = true
      progressStore.load('')
      status.value = 'ready'
    } catch (cause) {
      if (!isCurrentLoad(epoch)) return
      error.value = cause instanceof Error ? cause.message : String(cause)
      status.value = 'error'
    }
  }

  /** 所有页面共用的方案切换：课程方案走课程加载，practice-only 走键位预览。 */
  async function selectScheme(id: string): Promise<void> {
    if (!id || id === schemeId.value) return
    const supported = new Set(schemeIndex.value?.courseSupported ?? [])
    if (supported.has(id)) await setScheme(id)
    else await previewScheme(id)
  }

  async function runInit(): Promise<void> {
    const epoch = beginLoad()
    status.value = 'loading'
    error.value = ''
    try {
      const index = await loadSchemeIndex()
      if (!isCurrentLoad(epoch)) return
      schemeIndex.value = index
      const supported = new Set(index.courseSupported)
      const candidates = [readSavedScheme(), index.defaultScheme, index.courseSupported[0], index.schemes[0]?.id]
      const initial = candidates.find((id): id is string => Boolean(id) && supported.has(id))
      if (!initial) throw new Error('没有可用的双拼方案')
      await applyScheme(initial, epoch)
      if (!isCurrentLoad(epoch)) return
      status.value = 'ready'
    } catch (cause) {
      if (!isCurrentLoad(epoch)) return
      error.value = cause instanceof Error ? cause.message : String(cause)
      status.value = 'error'
    }
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

  async function setScheme(id: string): Promise<void> {
    if (!id || id === schemeId.value) return
    const epoch = beginLoad()
    status.value = 'loading'
    error.value = ''
    try {
      await applyScheme(id, epoch)
      if (!isCurrentLoad(epoch)) return
      status.value = 'ready'
    } catch (cause) {
      if (!isCurrentLoad(epoch)) return
      error.value = cause instanceof Error ? cause.message : String(cause)
      status.value = 'error'
    }
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
    try {
      if (unlockedAll.value) localStorage.setItem(UNLOCK_ALL_KEY, '1')
      else localStorage.removeItem(UNLOCK_ALL_KEY)
    } catch {
      /* 存储不可用时本次会话内仍然生效 */
    }
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

  function markStageCleared(lessonId: string, stage: 'single' | 'word' | 'exam'): void {
    progressStore.markStageCleared(lessonId, stage)
  }

  return {
    status,
    error,
    unlockedAll,
    schemeId,
    previewMode,
    scheme,
    curriculum,
    lessons,
    wordCount,
    ready,
    progress,
    passedCount,
    progressPercent,
    schemeOptions,
    allSchemeOptions,
    init,
    setScheme,
    previewScheme,
    selectScheme,
    getLesson,
    canStart,
    toggleUnlockedAll,
    nextLesson,
    currentLesson,
    recordResult,
    markStageCleared,
  }
})
