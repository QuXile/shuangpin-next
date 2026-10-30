/**
 * 练习页阶段状态机（页面级 composable）。
 *
 * 规则全部来自 core（lessonStages/lessonStageMinWords/stageGate/evaluateLesson/
 * hintTierFor(stage) / build* / sessionMetrics / applyKey extendWords / resumeSession）。
 *
 * 练习模型：
 * - 每阶段无限练习：批次生成器经 applyKey.extendWords 持续追加词卡；
 * - 每阶段独立 SessionState（Map 保存），离开/回来用 resumeSession 恢复计时；
 * - 阶段门槛由 stageGate 决定：普通阶段看最低字数，全遮挡严格阶段还要正确率/速度；
 * - 主按钮文案只由阶段位置决定：非最后「下一阶段」、最后「完成本课」；仅 enabled 变化；
 * - 点「完成本课」才 evaluateLesson + recordResult + goNext；达标后可继续无限练习。
 */
import { computed, onMounted, onScopeDispose, ref, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  appendSessionWords,
  buildSingleCharWords,
  buildTutorialWords,
  buildWordStageWords,
  createSchemeEngine,
  createSession,
  describePassCriteria,
  evaluateLesson,
  hintTierFor,
  lessonStageMinWords,
  lessonStages,
  resumeSession,
  sessionMetrics,
  stageGate,
  type LessonDef,
  type LessonPool,
  type PassCriteriaLine,
  type PracticeStage,
  type PracticeWord,
  type SchemeEngine,
  type SessionState,
  type StageGate,
} from '@shuangpin/core'
import { loadLessonPool } from '@/lib/data'
import {
  applySessionKey,
  backspaceSession,
  clearSessionInput,
  currentCellKey as cellKeyOf,
  hasInputError as hasErrorOf,
  type InputTracker,
} from '@/lib/sessionInput'
import {
  buildLessonNotes,
  lessonFocusItems,
  stageTitle,
  type FocusAtomView,
  type LessonNote,
} from '@/lib/lessonView'
import { useCourseStore } from '@/stores/course'
import { useGlobalKeys, type KeyBinding } from './useGlobalKeys'
import { useLiveCpm } from './useLiveCpm'

export type PracticeStatus = 'loading' | 'ready' | 'error'
export type PracticeStageView = 'tutorial' | PracticeStage

export interface PracticeAction {
  label: string
  kbd: string
  enabled: boolean
  run: () => void
}

interface StageRuntime {
  session: SessionState
  revealed: ReadonlySet<string>
  wrongInputs: ReadonlyMap<string, string[]>
  cellErrors: ReadonlyMap<string, number>
  /** 达标粘滞：一旦 gate.met 过就不再撤销（含 alreadyPassed 课程） */
  cleared: boolean
  /** 是否已选择「继续练习」进入无尽滚动（每阶段独立，重练重置） */
  infinite: boolean
}

export interface EndPromptErrorGroup {
  label: string
  count: number
}

export interface EndPromptDistribution {
  label: string
  count: number
}

export interface EndPromptRating {
  passed: boolean
  stars: 0 | 1 | 2 | 3
}

export interface EndPromptView {
  met: boolean
  title: string
  enterLabel: string | null
  stats: {
    accuracy: number
    cpm: number
    errors: number
    durationSec: number
  }
  errorDistribution: EndPromptDistribution[]
  errorGroups: EndPromptErrorGroup[]
  rules: PassCriteriaLine[]
  /** 仅最后一场全遮挡考核显示：本次尝试的星级评分 */
  rating: EndPromptRating | null
}

const EMPTY_SET: ReadonlySet<string> = new Set()
const EMPTY_INPUTS: ReadonlyMap<string, string[]> = new Map()

const newSeed = (): number => Math.floor(Math.random() * 0xffffffff) >>> 0

export function usePractice() {
  const route = useRoute()
  const router = useRouter()
  const course = useCourseStore()

  const lessonId = computed(() => String(route.params.lessonId ?? ''))
  const lesson = computed<LessonDef | undefined>(() => course.getLesson(lessonId.value))
  const isIntro = computed(() => lesson.value?.kind === 'intro')
  const lessonOrder = computed(() => {
    const index = course.lessons.findIndex((item) => item.id === lessonId.value)
    return index >= 0 ? index + 1 : 0
  })

  const status = ref<PracticeStatus>('loading')
  const errorMessage = ref('')
  const engine = shallowRef<SchemeEngine | null>(null)
  const pool = shallowRef<LessonPool | null>(null)
  const tutorialWords = ref<PracticeWord[]>([])
  const scheme = computed(() => course.scheme)
  const introWords = computed(() => pool.value?.words ?? [])

  const stages = computed<PracticeStage[]>(() => (lesson.value ? lessonStages(lesson.value) : []))
  /** -1 = tutorial；其余为 stages 下标 */
  const stageIndex = ref(-1)
  const stage = computed<PracticeStageView>(() =>
    stageIndex.value < 0 ? 'tutorial' : (stages.value[stageIndex.value] ?? 'tutorial'),
  )

  /** 每阶段独立会话运行时（切换阶段时保存/恢复，不重做已达标内容） */
  const runtimes = shallowRef<Map<PracticeStage, StageRuntime>>(new Map())
  const currentRuntime = computed<StageRuntime | null>(() => {
    const current = stage.value
    if (current === 'tutorial') return null
    return runtimes.value.get(current) ?? null
  })
  const session = computed<SessionState | null>(() => currentRuntime.value?.session ?? null)
  const revealed = computed<ReadonlySet<string>>(() => currentRuntime.value?.revealed ?? EMPTY_SET)
  const wrongInputs = computed<ReadonlyMap<string, string[]>>(
    () => currentRuntime.value?.wrongInputs ?? EMPTY_INPUTS,
  )

  /** 当前字是否处于错误锁定状态（保留红色输入，空格/Enter 可清空） */
  const currentCellKey = computed(() => cellKeyOf(session.value))
  const hasInputError = computed(() => {
    const runtime = currentRuntime.value
    return runtime ? hasErrorOf(runtime.session, trackerOf(runtime)) : false
  })

  const pressedKeys = ref<string[]>([])
  const introKeymapVisible = ref(false)
  const introRecorded = ref(false)
  const liveCpm = useLiveCpm(() => session.value)

  const alreadyPassed = computed(() => Boolean(lesson.value && course.progress[lessonId.value]?.passed))
  const isLastStage = computed(
    () => stageIndex.value >= 0 && stageIndex.value === stages.value.length - 1,
  )

  /** 展示与门槛判定用（cpm 必须使用与会话一致的 performance.now 时钟） */
  const metrics = computed(() => {
    const state = session.value
    return state ? sessionMetrics(state, performance.now()) : null
  })

  const gate = computed<StageGate | null>(() => {
    const currentLesson = lesson.value
    const currentStage = stage.value
    const value = metrics.value
    if (!currentLesson || currentStage === 'tutorial' || !value) return null
    return stageGate(currentLesson, currentStage, value)
  })
  const stageCleared = computed(() => Boolean(currentRuntime.value?.cleared || alreadyPassed.value))
  const gateReady = computed(() => Boolean(gate.value?.met || stageCleared.value))
  const gateHint = computed(() => {
    if (!gate.value || gate.value.met || stageCleared.value) return ''
    // 「再练 N 词」已由顶栏进度「已练 X/Y 词」表达，不再重复显示；
    // 正确率/速度等未达标原因保留为大字提示。
    return gate.value.reasons.filter((reason) => !reason.startsWith('再练 ')).join('；')
  })

  /** 进度「已练 X/Y 词」：Y=阶段目标词数，X 封顶为 Y；无目标回退「已练 X 词」 */
  const progressLabel = computed(() => {
    const value = metrics.value
    if (!value) return '已练 0 词'
    const target = gate.value?.minWords ?? 0
    if (target <= 0) return `已练 ${value.completedWords} 词`
    return `已练 ${Math.min(value.completedWords, target)}/${target} 词`
  })

  /** 有限目标完成后的总结卡：统计、错误分布、评分规则；最后一场考核额外显示本次星级 */
  const endPrompt = computed<EndPromptView | null>(() => {
    const runtime = currentRuntime.value
    const value = metrics.value
    const currentLesson = lesson.value
    if (!runtime || stage.value === 'tutorial' || runtime.infinite || !currentLesson) return null
    if (runtime.session.phase !== 'finished' || !value) return null

    const words = value.completedWords
    const met = gateReady.value
    const rawStats = runtime.session.stats

    // 按「出错的字/词」聚合错误次数；cell key 为「词下标:字下标」
    const errorCounts = new Map<string, number>()
    for (const [cellKey, count] of runtime.cellErrors) {
      const wordIndex = Number(cellKey.split(':')[0])
      const label = runtime.session.words[wordIndex]?.word.text ?? '未知'
      errorCounts.set(label, (errorCounts.get(label) ?? 0) + count)
    }
    const errorGroups = [...errorCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, 5)

    const distribution = new Map<number, number>()
    for (const count of runtime.cellErrors.values()) {
      const bucket = Math.min(count, 3)
      distribution.set(bucket, (distribution.get(bucket) ?? 0) + 1)
    }
    const errorDistribution = [1, 2, 3].map((bucket) => ({
      label: bucket === 3 ? '3 次及以上' : `${bucket} 次`,
      count: distribution.get(bucket) ?? 0,
    }))

    const finishedAt = rawStats.finishedAt ?? performance.now()
    const durationSec = Math.max(1, Math.round((finishedAt - rawStats.startedAt) / 1000))
    const rules = currentLesson.passCriteria ? describePassCriteria(currentLesson.passCriteria) : []

    // 最后一场全遮挡考核：显示本次评分（未达标则记未通过）
    const isFinalExam = isLastStage.value && stage.value === 'exam'
    let rating: EndPromptRating | null = null
    if (isFinalExam) {
      if (!met) {
        rating = { passed: false, stars: 0 }
      } else {
        const result = evaluateLesson(currentLesson, {
          accuracy: value.accuracy,
          cpm: value.cpm,
          revealed: runtime.revealed.size > 0,
        })
        rating = { passed: result.passed, stars: result.stars }
      }
    }

    const stats = {
      accuracy: Math.round(value.accuracy * 100),
      cpm: value.cpm,
      errors: rawStats.errors,
      durationSec,
    }

    if (met) {
      const enterLabel = isLastStage.value ? '完成本课' : '进入下一阶段'
      return {
        met,
        title: `已练满 ${words} 词。`,
        enterLabel,
        stats,
        errorDistribution,
        errorGroups,
        rules,
        rating,
      }
    }
    // 未达标原因已在顶栏以大号文字展示，这里不重复；按钮本身已说明操作方式
    return {
      met,
      title: `已练满 ${words} 词，还没达标。`,
      enterLabel: null,
      stats,
      errorDistribution,
      errorGroups,
      rules,
      rating,
    }
  })

  const stageTitleText = computed(() =>
    lesson.value && stage.value !== 'tutorial' ? stageTitle(lesson.value, stage.value) : '本课教学',
  )
  const tier = computed<1 | 2 | 3>(() =>
    stage.value !== 'tutorial' ? hintTierFor(stage.value) : 1,
  )
  /** 供 aria-live 播报的反馈（错误/词完成） */
  const liveMessage = computed(() => {
    const feedback = session.value?.lastFeedback
    if (!feedback) return ''
    if (feedback.kind === 'wrong') return feedback.message ?? '键位错误'
    if (feedback.kind === 'word-complete') return feedback.message ?? '词语完成'
    return ''
  })

  const focusItems = computed<FocusAtomView[]>(() =>
    lesson.value && engine.value ? lessonFocusItems(lesson.value, engine.value) : [],
  )
  const focusAtomIds = computed(() => focusItems.value.map((item) => item.atomId))
  const focusBadge = computed(() =>
    lesson.value && (lesson.value.kind === 'review' || lesson.value.kind === 'exam') ? '含' : '新',
  )
  const notes = computed<LessonNote[]>(() => (lesson.value ? buildLessonNotes(lesson.value) : []))

  const conceal = computed(() => stage.value === 'word' || stage.value === 'exam')
  const highlightAtomIds = computed(() => {
    const blocking = lesson.value?.blockingAtoms ?? []
    return blocking.length <= 3 ? blocking : []
  })
  const specialInitials = computed(() => engine.value?.diff().learnInitials ?? [])
  const keyMapRows = computed(() => engine.value?.keyMap() ?? [])
  const showDock = computed(() =>
    isIntro.value ? introKeymapVisible.value : status.value === 'ready',
  )
  const nextLesson = computed(() => (lesson.value ? course.nextLesson(lesson.value.id) : undefined))

  function showPressed(key: string): void {
    pressedKeys.value = [key.toLowerCase()]
    if (pressTimer !== undefined) window.clearTimeout(pressTimer)
    pressTimer = window.setTimeout(() => {
      pressedKeys.value = []
    }, 160)
  }
  let pressTimer: number | undefined

  // ── 批次生成器（无限练习） ──────────────────────────────────

  function stageMinWords(target: PracticeStage): number {
    const currentLesson = lesson.value
    if (!currentLesson) return 10
    return Math.max(1, lessonStageMinWords(currentLesson)[target] ?? 10)
  }

  /** 单字批次：重复洗牌；词语/考核批次：新 seed 重新组卷 */
  function makeBatch(target: PracticeStage): PracticeWord[] {
    const currentLesson = lesson.value
    const currentEngine = engine.value
    const currentPool = pool.value
    if (!currentLesson || !currentEngine || !currentPool) return []
    const minWords = stageMinWords(target)
    const seed = newSeed()
    if (target === 'single') {
      const count = Math.max(minWords, 1)
      const words = buildSingleCharWords({
        engine: currentEngine,
        lesson: currentLesson,
        pool: currentPool,
        learnedAtoms: currentLesson.prerequisites,
        count,
        seed,
      })
      if (words.length === 0) return []
      const out: PracticeWord[] = []
      while (out.length < count) out.push(words[out.length % words.length] as PracticeWord)
      return out
    }
    return buildWordStageWords({
      engine: currentEngine,
      lesson: currentLesson,
      pool: currentPool,
      learnedAtoms: currentLesson.prerequisites,
      targetWords: Math.max(minWords, 1),
      seed,
    })
  }

  // ── 阶段运行时管理 ─────────────────────────────────────────

  function trackerOf(runtime: StageRuntime): InputTracker {
    return {
      revealed: runtime.revealed,
      wrongInputs: runtime.wrongInputs,
      cellErrors: runtime.cellErrors,
    }
  }

  function setRuntime(target: PracticeStage, runtime: StageRuntime): void {
    const next = new Map(runtimes.value)
    next.set(target, runtime)
    runtimes.value = next
  }

  /** 首次进入创建会话；再次进入用 resumeSession 恢复计时，不重做也不丢进度 */
  function activateStage(target: PracticeStage): void {
    const existing = runtimes.value.get(target)
    if (existing) {
      setRuntime(target, {
        ...existing,
        session: resumeSession(existing.session, performance.now()),
      })
      liveCpm.reset()
      return
    }
    const words = makeBatch(target)
    if (words.length === 0) {
      status.value = 'error'
      errorMessage.value = '本阶段暂无可用练习，请检查课程词池数据'
      return
    }
    setRuntime(target, {
      session: createSession({ words, now: performance.now() }),
      revealed: new Set(),
      wrongInputs: new Map(),
      cellErrors: new Map(),
      cleared: alreadyPassed.value,
      infinite: false,
    })
    liveCpm.reset()
  }

  function startFirstStage(): void {
    if (stages.value.length === 0) return
    stageIndex.value = 0
    activateStage(stages.value[0] as PracticeStage)
  }

  function advanceStage(): void {
    const next = stageIndex.value + 1
    if (next >= stages.value.length) return
    stageIndex.value = next
    activateStage(stages.value[next] as PracticeStage)
  }

  function retryStage(): void {
    if (stage.value === 'tutorial') {
      startFirstStage()
      return
    }
    // 重练：清空本阶段运行时，重新从零开始（不影响其它阶段）
    const next = new Map(runtimes.value)
    next.delete(stage.value)
    runtimes.value = next
    activateStage(stage.value)
  }

  function previousStage(): void {
    if (stageIndex.value <= 0) {
      stageIndex.value = -1
      liveCpm.reset()
      return
    }
    stageIndex.value -= 1
    activateStage(stages.value[stageIndex.value] as PracticeStage)
  }

  function goNext(): void {
    const target = nextLesson.value
    if (target && course.canStart(target)) {
      void router.push(`/practice/${target}`)
      return
    }
    void router.push('/')
  }

  // ── 输入 ───────────────────────────────────────────────────

  function handleKey(raw: string): void {
    // 只要事件在页面被处理（练习/tutorial/锁定/完成态），键位图都显示按下反馈
    showPressed(raw)
    const currentStage = stage.value
    if (currentStage === 'tutorial') return
    const runtime = runtimes.value.get(currentStage)
    const currentLesson = lesson.value
    if (
      !currentLesson ||
      !runtime ||
      runtime.session.phase === 'finished' ||
      status.value !== 'ready'
    ) {
      return
    }
    const state = runtime.session
    const { state: nextState, tracker } = applySessionKey(state, raw, trackerOf(runtime), {
      at: performance.now(),
      extendWords: runtime.infinite ? () => makeBatch(currentStage) : undefined,
    })
    const nextGate = stageGate(
      currentLesson,
      currentStage,
      sessionMetrics(nextState, performance.now()),
    )
    setRuntime(currentStage, {
      session: nextState,
      revealed: tracker.revealed,
      wrongInputs: tracker.wrongInputs,
      cellErrors: tracker.cellErrors,
      cleared: runtime.cleared || nextGate.met,
      infinite: runtime.infinite,
    })
  }

  function handleBackspace(): void {
    showPressed('backspace')
    const runtime = currentRuntime.value
    if (!runtime || runtime.session.phase === 'finished') return
    const { state, tracker } = backspaceSession(runtime.session, trackerOf(runtime))
    setRuntime(stage.value as PracticeStage, {
      ...runtime,
      session: state,
      revealed: tracker.revealed,
      wrongInputs: tracker.wrongInputs,
      cellErrors: tracker.cellErrors,
    })
  }

  /** 空格 / Enter：清空当前字输入并取消红色错误状态（Enter 优先于主按钮） */
  function clearCurrentInput(): void {
    const currentStage = stage.value
    if (currentStage === 'tutorial') return
    const runtime = runtimes.value.get(currentStage)
    if (!runtime || runtime.session.phase === 'finished') return
    const { state, tracker } = clearSessionInput(runtime.session, trackerOf(runtime))
    setRuntime(currentStage, {
      ...runtime,
      session: state,
      revealed: tracker.revealed,
      wrongInputs: tracker.wrongInputs,
      cellErrors: tracker.cellErrors,
    })
  }

  // ── 主按钮：文案只由阶段位置决定，仅 enabled 变化 ────────────

  /** 提示行「继续练习」：追加同目标词数的一批，开启无尽滚动 */
  function continuePractice(): void {
    const currentStage = stage.value
    if (currentStage === 'tutorial') return
    const runtime = runtimes.value.get(currentStage)
    if (!runtime || runtime.infinite || runtime.session.phase !== 'finished') return
    const words = makeBatch(currentStage)
    if (words.length === 0) return
    setRuntime(currentStage, {
      ...runtime,
      session: appendSessionWords(runtime.session, words),
      infinite: true,
    })
    liveCpm.reset()
  }

  function completeLesson(): void {
    const currentLesson = lesson.value
    const runtime = currentRuntime.value
    if (!currentLesson || !runtime || !isLastStage.value) return
    const value = sessionMetrics(runtime.session, performance.now())
    const result = evaluateLesson(currentLesson, {
      accuracy: value.accuracy,
      cpm: value.cpm,
      revealed: runtime.revealed.size > 0,
    })
    course.recordResult(currentLesson.id, result, value.accuracy)
    goNext()
  }

  const primary = computed<PracticeAction | null>(() => {
    if (status.value !== 'ready' || !lesson.value || isIntro.value) return null
    if (stage.value === 'tutorial') {
      return { label: '开始练习', kbd: 'Enter', enabled: true, run: startFirstStage }
    }
    const last = isLastStage.value
    return {
      label: last ? '完成本课' : '下一阶段',
      kbd: 'Enter',
      enabled: gateReady.value,
      run: last ? completeLesson : advanceStage,
    }
  })

  // ── 入门课 ─────────────────────────────────────────────────

  function onIntroFinished(): void {
    if (introRecorded.value || !lesson.value) return
    introRecorded.value = true
    const result = evaluateLesson(lesson.value, { accuracy: 1, cpm: 0, revealed: false })
    course.recordResult(lesson.value.id, result, 1)
  }

  function onIntroRevealKeymap(): void {
    introKeymapVisible.value = true
  }

  function onIntroHideKeymap(): void {
    introKeymapVisible.value = false
  }

  // ── 键盘快捷键（唯一入口） ─────────────────────────────────

  const bindings = computed<KeyBinding[]>(() => {
    const list: KeyBinding[] = [
      {
        key: 'Escape',
        run: () => {
          void router.push('/')
        },
      },
    ]
    if (isIntro.value || status.value !== 'ready') return list
    list.push(
      { letter: true, run: (event) => handleKey(event.key) },
      { key: 'Backspace', run: () => handleBackspace() },
      { key: ' ', when: () => hasInputError.value, run: () => clearCurrentInput() },
      {
        key: 'Enter',
        when: (event) =>
          !(event.target instanceof HTMLButtonElement) &&
          !(event.target instanceof HTMLSelectElement) &&
          hasInputError.value,
        run: () => clearCurrentInput(),
      },
      {
        key: 'Enter',
        when: (event) =>
          !(event.target instanceof HTMLButtonElement) &&
          !(event.target instanceof HTMLSelectElement) &&
          Boolean(primary.value?.enabled),
        run: () => primary.value?.run(),
      },
      {
        key: 'Enter',
        alt: true,
        when: () => Boolean(endPrompt.value),
        run: () => continuePractice(),
      },
      {
        key: 'ArrowLeft',
        alt: true,
        when: () => stage.value !== 'tutorial',
        run: () => previousStage(),
      },
      { key: 'r', alt: true, run: () => retryStage() },
    )
    return list
  })
  useGlobalKeys(bindings)

  // ── 初始化 ─────────────────────────────────────────────────

  onMounted(async () => {
    await course.init()
    if (course.status === 'error') {
      status.value = 'error'
      errorMessage.value = course.error || '课程数据加载失败'
      return
    }
    const currentLesson = lesson.value
    if (!course.scheme || !currentLesson) {
      status.value = 'error'
      errorMessage.value = '课程不存在或尚未加载完成'
      return
    }
    if (!course.canStart(currentLesson.id)) {
      await router.replace('/')
      return
    }
    engine.value = createSchemeEngine(course.scheme)
    try {
      pool.value = await loadLessonPool(currentLesson.id)
    } catch (cause) {
      status.value = 'error'
      errorMessage.value = cause instanceof Error ? cause.message : String(cause)
      return
    }
    if (!isIntro.value) {
      tutorialWords.value = buildTutorialWords({
        engine: engine.value,
        lesson: currentLesson,
        pool: pool.value,
      })
    }
    status.value = 'ready'
  })

  onScopeDispose(() => {
    if (pressTimer !== undefined) window.clearTimeout(pressTimer)
  })

  return {
    // 状态
    status,
    errorMessage,
    lesson,
    lessonId,
    lessonOrder,
    isIntro,
    stage,
    stages,
    session,
    revealed,
    wrongInputs,
    tutorialWords,
    engine,
    scheme,
    introWords,
    // 展示派生
    focusItems,
    focusAtomIds,
    focusBadge,
    notes,
    tier,
    conceal,
    stageTitleText,
    gateHint,
    endPrompt,
    liveMessage,
    progressLabel,
    cpm: liveCpm.cpm,
    keyMapRows,
    highlightAtomIds,
    specialInitials,
    pressedKeys,
    showDock,
    introKeymapVisible,
    primary,
    // 动作
    startFirstStage,
    advanceStage,
    retryStage,
    previousStage,
    continuePractice,
    goNext,
    showPressed,
    handleKey,
    handleBackspace,
    onIntroFinished,
    onIntroRevealKeymap,
    onIntroHideKeymap,
  }
}
