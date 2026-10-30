<script setup lang="ts">
/**
 * 学习地图：Hero + 章节/课程卡 + 方案切换 + 进度操作。
 * 数据引导/章节视图/锁课规则分别来自 useCourseBootstrap、lib/lessonView、stores。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { createSchemeEngine } from '@shuangpin/core'
import ChapterSection from '@/components/map/ChapterSection.vue'
import HeroPanel from '@/components/map/HeroPanel.vue'
import StateCard from '@/components/common/StateCard.vue'
import { useCourseBootstrap } from '@/composables/useCourseBootstrap'
import { useGlobalKeys, type KeyBinding } from '@/composables/useGlobalKeys'
import { buildChapterViews } from '@/lib/lessonView'
import { useCourseStore } from '@/stores/course'
import { useProgressStore } from '@/stores/progress'

const router = useRouter()
const course = useCourseStore()
const progress = useProgressStore()
const { status, error, retry } = useCourseBootstrap()
const busy = ref(false)

// ── 学习地图滚动位置：按方案记忆；返回地图/课程页时恢复，而不是每次置顶 ──
const SCROLL_KEY = 'shuangpin-next:map-scroll'
const scrollKey = (): string => `${SCROLL_KEY}:${course.schemeId || 'default'}`
let scrollRestored = false
let scrollFrame: number | undefined
/** 首次渲染先隐藏地图，等滚动位置恢复后再显示，避免先闪到顶部再跳 */
const restorePending = ref(true)
/** 最后一次已知的地图滚动位置：路由切换时旧页面可能已被新布局重置为 0，不能直接读 window.scrollY */
let lastScrollY = 0
/** 路由离开中：新页面切换布局可能把 window.scrollY 重置为 0，不能再覆盖已保存的位置 */
let leaving = false
/** 点击/按键触发导航后的短暂窗口：忽略布局切换导致的 0 滚动事件 */
let suppressScrollSave = false
let suppressTimer: number | undefined

function readSavedScroll(): number {
  try {
    const value = Number(sessionStorage.getItem(scrollKey()))
    return Number.isFinite(value) && value > 0 ? value : 0
  } catch {
    return 0
  }
}

function saveScroll(): void {
  try {
    sessionStorage.setItem(scrollKey(), String(lastScrollY))
  } catch {
    /* 隐私模式：不阻断页面 */
  }
}

function onScroll(): void {
  if (leaving || suppressScrollSave) return
  lastScrollY = Math.max(0, Math.round(window.scrollY))
  if (scrollFrame !== undefined) return
  scrollFrame = window.requestAnimationFrame(() => {
    scrollFrame = undefined
    saveScroll()
  })
}

/** 用户点击/按键前先记住当前位置；导航后布局切换可能把 window.scrollY 归零，短时间内不再覆盖 */
function captureScrollBeforeNavigate(): void {
  if (status.value !== 'ready') return
  lastScrollY = Math.max(0, Math.round(window.scrollY))
  saveScroll()
  suppressScrollSave = true
  if (suppressTimer !== undefined) window.clearTimeout(suppressTimer)
  suppressTimer = window.setTimeout(() => {
    suppressTimer = undefined
    suppressScrollSave = false
  }, 700)
}

onMounted(() => {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  lastScrollY = Math.max(0, Math.round(window.scrollY))
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('pointerdown', captureScrollBeforeNavigate, { capture: true, passive: true })
  window.addEventListener('keydown', captureScrollBeforeNavigate, { capture: true, passive: true })
  window.addEventListener('popstate', captureScrollBeforeNavigate, { capture: true, passive: true })
  window.addEventListener('beforeunload', saveScroll)
})

onBeforeRouteLeave(() => {
  leaving = true
  saveScroll()
})

onBeforeUnmount(() => {
  saveScroll()
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('pointerdown', captureScrollBeforeNavigate, { capture: true })
  window.removeEventListener('keydown', captureScrollBeforeNavigate, { capture: true })
  window.removeEventListener('popstate', captureScrollBeforeNavigate, { capture: true })
  window.removeEventListener('beforeunload', saveScroll)
  if (scrollFrame !== undefined) window.cancelAnimationFrame(scrollFrame)
  if (suppressTimer !== undefined) window.clearTimeout(suppressTimer)
})


const engine = computed(() =>
  course.scheme ? createSchemeEngine(course.scheme) : null,
)
const chapters = computed(() =>
  engine.value && course.curriculum
    ? buildChapterViews(course.curriculum, engine.value, progress.records, course.unlockedAll)
    : [],
)
watch(
  [status, chapters],
  async () => {
    if (scrollRestored || status.value !== 'ready' || chapters.value.length === 0) return
    scrollRestored = true
    await nextTick()
    lastScrollY = readSavedScroll()
    // 全局 CSS 是 smooth 滚动：恢复记忆位置时必须临时关闭，直接落到目标位置
    const root = document.documentElement
    const previousBehavior = root.style.scrollBehavior
    root.style.scrollBehavior = 'auto'
    window.scrollTo(0, lastScrollY)
    root.style.scrollBehavior = previousBehavior
    restorePending.value = false
  },
  { immediate: true, flush: 'post' },
)
const currentId = computed(() => course.currentLesson())
const currentLesson = computed(() =>
  currentId.value ? course.getLesson(currentId.value) : undefined,
)
const currentTitle = computed(() => {
  const lesson = currentLesson.value
  if (!lesson) return '开始学习'
  if (progress.records[lesson.id]?.passed) return '再练一次'
  const order = course.lessons.findIndex((item) => item.id === lesson.id)
  return `继续第 ${Math.max(order + 1, 1)} 课`
})
async function start(lessonId: string): Promise<void> {
  if (!course.canStart(lessonId)) return
  await router.push(`/practice/${lessonId}`)
}

function startCurrent(): void {
  if (currentId.value) void start(currentId.value)
}

function clearProgress(): void {
  if (course.passedCount === 0) return
  if (!window.confirm('清除当前双拼方案的全部学习进度？此操作不可撤销。')) return
  progress.clear()
}

async function changeScheme(id: string): Promise<void> {
  if (!id || id === course.schemeId) return
  busy.value = true
  await course.setScheme(id)
  busy.value = false
}

function focusLesson(step: 1 | -1): void {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.lesson:not(:disabled)'))
  if (buttons.length === 0) return
  const current = document.activeElement instanceof HTMLButtonElement
    ? buttons.indexOf(document.activeElement)
    : -1
  const next = current < 0 ? 0 : (current + step + buttons.length) % buttons.length
  buttons[next]?.focus()
}

const bindings = computed<KeyBinding[]>(() => [
  {
    key: 's',
    alt: true,
    allowInInput: true,
    run: () => document.querySelector<HTMLSelectElement>('#scheme-select')?.focus(),
  },
  {
    key: 'Enter',
    when: (event) =>
      !(event.target instanceof HTMLButtonElement) && !(event.target instanceof HTMLSelectElement),
    run: () => startCurrent(),
  },
  {
    key: 'ArrowDown',
    when: (event) => !(event.target instanceof HTMLSelectElement),
    run: () => focusLesson(1),
  },
  {
    key: 'ArrowUp',
    when: (event) => !(event.target instanceof HTMLSelectElement),
    run: () => focusLesson(-1),
  },
])
useGlobalKeys(bindings)
</script>

<template>
  <div class="page">
    <StateCard v-if="status === 'loading'" loading message="正在加载课程与词库…" />

    <StateCard
      v-else-if="status === 'error'"
      title="数据加载失败"
      :message="error"
    >
      <p class="hint">请确认 public/data 已由 <code>node scripts/sync-data.mjs</code> 生成，或执行 <code>pnpm dev</code>。</p>
      <button class="btn btn--primary" type="button" @click="retry()">重试</button>
    </StateCard>

    <div v-else class="course-board" :class="{ 'is-restoring': restorePending }">
      <HeroPanel
        :current-title="currentTitle"
        :scheme-options="course.schemeOptions"
        :scheme-id="course.schemeId"
        :busy="busy"
        :progress-percent="course.progressPercent"
        :passed-count="course.passedCount"
        :lesson-total="course.lessons.length"
        :chapter-count="course.curriculum?.chapters.length ?? 0"
        :word-count="course.wordCount"
        :can-clear="course.passedCount > 0"
        :unlocked-all="course.unlockedAll"
        @start="startCurrent"
        @change-scheme="changeScheme"
        @clear-progress="clearProgress"
        @toggle-unlock="course.toggleUnlockedAll()"
      />

      <div class="chapters">
        <ChapterSection
          v-for="chapter in chapters"
          :key="chapter.id"
          :chapter="chapter"
          :current-id="currentId"
          @start="start"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.course-board.is-restoring {
  visibility: hidden;
}
.course-board {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-xl);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
.chapters {
  display: flex;
  flex-direction: column;
  background: transparent;
  border-top: 1px solid var(--line-faint);
  border-radius: 0;
  box-shadow: none;
  overflow: hidden;
}
.hint {
  margin-bottom: 8px;
  color: var(--ink-3);
  font-size: var(--text-sm);
}
@media (max-width: 680px) {
  .page {
    padding: 16px 12px 48px;
  }
}
</style>
