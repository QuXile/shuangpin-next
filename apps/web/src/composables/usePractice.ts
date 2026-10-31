/**
 * 练习页阶段状态机（页面级 composable）。
 *
 * 规则全部来自 core（lessonStages/lessonStageMinWords/stageGate/evaluateLesson/
 * hintTierFor(stage) / build* / sessionMetrics / applyKey / resumeSession）。
 *
 * 练习模型：
 * - 每阶段有限目标：完成目标词数后显示总结卡，不自动追加词卡；
 * - 每阶段独立 SessionState（Map 保存），离开/回来用 resumeSession 恢复计时；
 * - 阶段门槛由 stageGate 决定：普通阶段看最低字数，全遮挡严格阶段还要正确率/速度；
 * - 主按钮文案只由阶段位置决定：非最后「下一阶段」、最后「完成本课」；仅 enabled 变化；
 * - 达标即自动记录本课通过；课程本身不提供无尽练习，需要时跳转练习场。
 */
import { computed, onMounted, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  accuracyTiers,
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
  speedTiers,
  stageGate,
  tierOf,
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
import { useSoundStore } from '@/stores/sound'
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
  keyErrors: ReadonlyMap<string, number>
  /** 达标粘滞：一旦 gate.met 过就不再撤销（含 alreadyPassed 课程） */
  cleared: boolean
  /** 最后一次考核是否已自动/手动记录，避免同一轮重复增加 attempts */
  recorded?: boolean
}

export interface EndPromptKeyError {
  expected: string
  typed: string
  count: number
}

export interface EndPromptRating {
  passed: boolean
  stars: 0 | 1 | 2 | 3
}

export interface EndPromptView {
  /** 是否已经可以进入下一阶段/完成本课（含此前已通过的阶段） */
  met: boolean
  /** 本次尝试是否达到当前阶段的评分门槛（决定总结卡颜色） */
  passedAttempt: boolean
  title: string
  enterLabel: string | null
  stats: {
    accuracy: number
    cpm: number
    errors: number
    durationSec: number
  }
  keyErrors: EndPromptKeyError[]
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
  const sound = useSoundStore()

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

  /** 完成第一个字后才展示正确率/速度，避免只按下一个键时先出现 0%。 */
  const hasStarted = computed(() => {
    const state = session.value
    if (!state) return false
    const stats = state.stats
    return state.phase === 'finished' || stats.correctChars > 0
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

  /** 进度始终显示已完成数（未开始为 0）；正确率/速度仍由 hasStarted 决定是否显示。 */
  const progressLabel = computed(() => {
    const target = gate.value?.minWords ?? 0
    const completed = metrics.value ? Math.min(metrics.value.completedWords, target) : 0
    if (target <= 0) return `已练 ${completed} 词`
    return `已练 ${completed}/${target} 词`
  })
  const accuracyPercent = computed(() => Math.round((metrics.value?.accuracy ?? 0) * 100))
  const accuracyTier = computed(() => {
    if (!hasStarted.value) return null
    const criteria = lesson.value?.passCriteria
    return criteria ? tierOf(accuracyTiers(criteria), accuracyPercent.value) : null
  })
  const speedTier = computed(() => {
    if (!hasStarted.value) return null
    const criteria = lesson.value?.passCriteria
    if (!criteria) return null
    const tiers = speedTiers(criteria)
    return tiers ? tierOf(tiers, liveCpm.cpm.value) : null
  })

  /** 有限目标完成后的总结卡：统计、错误分布、评分标准；最后一场考核额外显示本次星级 */
  const endPrompt = computed<EndPromptView | null>(() => {
    const runtime = currentRuntime.value
    const value = metrics.value
    const currentLesson = lesson.value
    if (!runtime || stage.value === 'tutorial' || !currentLesson) return null
    if (runtime.session.phase !== 'finished' || !value) return null

    const words = value.completedWords
    const met = gateReady.value
    const passedAttempt = Boolean(gate.value?.met)
    const rawStats = runtime.session.stats

    // 错误键位统计：应敲的键 vs 实际按下的键
    const keyErrors = [...runtime.keyErrors.entries()]
      .map(([pair, count]) => {
        const [typed = '?', expected = '?'] = pair.split('|')
        return { expected: expected.toUpperCase(), typed: typed.toUpperCase(), count }
      })
      .sort((a, b) => b.count - a.count || a.expected.localeCompare(b.expected))

    const finishedAt = rawStats.finishedAt ?? performance.now()
    const durationSec = Math.max(1, Math.round((finishedAt - rawStats.startedAt) / 1000))
    const rules = currentLesson.passCriteria ? describePassCriteria(currentLesson.passCriteria) : []

    // 最后一场全遮挡考核：显示本次评分（未达标则记未通过）
    const isFinalExam = isLastStage.value && stage.value === 'exam'
    let rating: EndPromptRating | null = null
    if (isFinalExam) {
      // 已通过课程重练时 gate 会继承“已达标”，本次评分仍必须满足本课最低正确率
      const minAccuracy = currentLesson.passCriteria?.accuracy ?? 0
      const passedAttempt = met && value.accuracy >= minAccuracy
      if (!passedAttempt) {
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
    const title = passedAttempt
      ? `已练满 ${words} 词。`
      : `已练满 ${words} 词，还没达标。`

    if (met) {
      const enterLabel = isLastStage.value ? '完成本课' : '进入下一阶段'
      return {
        met,
        passedAttempt,
        title,
        enterLabel,
        stats,
        keyErrors,
        rules,
        rating,
      }
    }
    // 未达标原因已在顶栏以大号文字展示，这里不重复；按钮本身已说明操作方式
    return {
      met,
      passedAttempt,
      title,
      enterLabel: null,
      stats,
      keyErrors,
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
  const showDock = computed(() => status.value === 'ready')
  const nextLesson = computed(() => (lesson.value ? course.nextLesson(lesson.value.id) : undefined))

  function showPressed(key: string): void {
    pressedKeys.value = [key.toLowerCase()]
    if (pressTimer !== undefined) window.clearTimeout(pressTimer)
    pressTimer = window.setTimeout(() => {
      pressedKeys.value = []
    }, 160)
  }
  let pressTimer: number | undefined

  // ── 批次生成器 ──────────────────────────────────────────────

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
      keyErrors: runtime.keyErrors,
    }
  }

  function setRuntime(target: PracticeStage, runtime: StageRuntime): void {
    const next = new Map(runtimes.value)
    next.set(target, runtime)
    runtimes.value = next
  }

  /** 逐字 / 半遮挡词阶段曾完成过：重进时直接允许继续；全遮挡考核不跳过 */
  function stageWasCleared(target: PracticeStage): boolean {
    if (target === 'exam') return false
    return Boolean(course.progress[lessonId.value]?.clearedStages?.includes(target))
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
      keyErrors: new Map(),
      cleared: alreadyPassed.value || stageWasCleared(target),
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
    if (currentStage === 'tutorial') {
      // 教学页没有判题，但键位图仍会响应按键；保持与练习阶段一致的敲击声。
      sound.playKey()
      return
    }
    const runtime = runtimes.value.get(currentStage)
    const currentLesson = lesson.value
    if (
      !currentLesson ||
      !runtime ||
      runtime.session.phase === 'finished' ||
      status.value !== 'ready'
    ) {
      // 完成总结、锁定或异常阶段仍应给出按键反馈，不能只有退格有声音。
      sound.playKey()
      return
    }
    const state = runtime.session
    const { state: nextState, tracker, feedback } = applySessionKey(state, raw, trackerOf(runtime), {
      at: performance.now(),
    })
    if (feedback.kind === 'wrong') sound.playError()
    else if (feedback.kind === 'word-complete') sound.playComplete()
    else sound.playKey()
    const nextGate = stageGate(
      currentLesson,
      currentStage,
      sessionMetrics(nextState, performance.now()),
    )
    if (nextGate.met && currentStage !== 'exam') {
      course.markStageCleared(currentLesson.id, currentStage)
    }
    setRuntime(currentStage, {
      session: nextState,
      revealed: tracker.revealed,
      wrongInputs: tracker.wrongInputs,
      cellErrors: tracker.cellErrors,
      keyErrors: tracker.keyErrors,
      cleared: runtime.cleared || nextGate.met,
    })
  }

  function handleBackspace(): void {
    showPressed('backspace')
    sound.playKey()
    const runtime = currentRuntime.value
    if (!runtime || runtime.session.phase === 'finished') return
    const { state, tracker } = backspaceSession(runtime.session, trackerOf(runtime))
    setRuntime(stage.value as PracticeStage, {
      ...runtime,
      session: state,
      revealed: tracker.revealed,
      wrongInputs: tracker.wrongInputs,
      cellErrors: tracker.cellErrors,
      keyErrors: tracker.keyErrors,
    })
  }

  /** 空格 / Enter：清空当前字输入并取消红色错误状态（Enter 优先于主按钮） */
  function clearCurrentInput(): void {
    const currentStage = stage.value
    if (currentStage === 'tutorial') return
    sound.playKey()
    const runtime = runtimes.value.get(currentStage)
    if (!runtime || runtime.session.phase === 'finished') return
    const { state, tracker } = clearSessionInput(runtime.session, trackerOf(runtime))
    setRuntime(currentStage, {
      ...runtime,
      session: state,
      revealed: tracker.revealed,
      wrongInputs: tracker.wrongInputs,
      cellErrors: tracker.cellErrors,
      keyErrors: tracker.keyErrors,
    })
  }

  // ── 主按钮：文案只由阶段位置决定，仅 enabled 变化 ────────────

  /** 最后一次考核达到门槛即记录成绩，不再依赖用户在结束卡片上点「完成本课」。 */
  function recordFinalAttempt(): void {
    const currentLesson = lesson.value
    const runtime = currentRuntime.value
    if (!currentLesson || !runtime || runtime.recorded || !isLastStage.value) return
    // 只按「本次尝试是否达标」记录：已通过课程会继承 gateReady，不能拿它当落库依据，
    // 否则未达标的尝试会被记录（evaluateLesson 与 stageGate 的 accuracy 口径不同）。
    if (!gate.value?.met) return
    const value = sessionMetrics(runtime.session, performance.now())
    const result = evaluateLesson(currentLesson, {
      accuracy: value.accuracy,
      cpm: value.cpm,
      revealed: runtime.revealed.size > 0,
    })
    course.recordResult(currentLesson.id, result, value.accuracy)
    setRuntime(stage.value as PracticeStage, { ...runtime, recorded: true })
  }

  function completeLesson(): void {
    if (!lesson.value || !currentRuntime.value || !isLastStage.value) return
    // 门槛未达标时不落库（按钮与 Enter 已按 gateReady 禁用，这里兜底程序调用）。
    if (!gateReady.value) return
    recordFinalAttempt()
    goNext()
  }

  /** 结束卡「进入无尽练习」：只带入本课范围与当前阶段隐藏设置，不自动开始。 */
  function goEndlessPractice(): void {
    const current = lesson.value
    if (!current || stage.value === 'tutorial') return
    try {
      sessionStorage.setItem(
        'shuangpin-next:training-preset',
        JSON.stringify({ from: current.id, stage: stage.value, scheme: course.schemeId }),
      )
    } catch {
      /* 隐私模式下仍然跳转，训练场使用当前/默认设置 */
    }
    void router.push('/training')
  }

  // 考核门槛一旦满足就自动记录；“最后一次评分覆盖前一次”由 progress store
  // 的 passed / stars / bestAccuracy 取历史最优保证。
  watch(
    () => [stage.value, isLastStage.value, gate.value?.met === true, currentRuntime.value?.recorded === true] as const,
    () => {
      if (stage.value === 'exam' && isLastStage.value && gate.value?.met) recordFinalAttempt()
    },
    { flush: 'post' },
  )

  // 阶段总结卡出现时播放完成音；未达标不播。
  // 每次尝试只播一次：record 落库会触发 endPrompt 重算，按已完成的会话去重。
  const completionSounded = new WeakSet<SessionState>()
  watch(endPrompt, (prompt) => {
    if (!prompt?.met) return
    const state = session.value
    if (!state || state.phase !== 'finished' || completionSounded.has(state)) return
    completionSounded.add(state)
    sound.playComplete()
  })

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
    // 完成音由 IntroLesson 在试打通过的同一按键里播放，这里不再重播，避免双响。
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
      {
        letter: true,
        run: (event) => {
          // 教学页没有判题，但物理按键也必须稳定发声，不能依赖深层分支。
          if (stage.value === 'tutorial') sound.playKey()
          handleKey(event.key)
        },
      },
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
        run: () => goEndlessPractice(),
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
    alreadyPassed,
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
    endPrompt,
    liveMessage,
    progressLabel,
    hasStarted,
    accuracyPercent,
    accuracyTier,
    speedTier,
    cpm: liveCpm.cpm,
    keyMapRows,
    highlightAtomIds,
    specialInitials,
    pressedKeys,
    showDock,
    primary,
    // 动作
    startFirstStage,
    advanceStage,
    retryStage,
    previousStage,
    goEndlessPractice,
    goNext,
    showPressed,
    handleKey,
    handleBackspace,
    onIntroFinished,
  }
}
