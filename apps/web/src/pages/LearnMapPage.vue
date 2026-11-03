<script setup lang="ts">
/**
 * 学习地图：Hero + 章节/课程卡 + 方案切换 + 进度操作。
 * 数据引导/章节视图/锁课规则分别来自 course store、lib/lessonView、stores。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import ChapterSection from '@/components/map/ChapterSection.vue'
import CurrentLearningCard from '@/components/map/CurrentLearningCard.vue'
import SchemeHero from '@/components/common/SchemeHero.vue'
import LearningProgressCard from '@/components/map/LearningProgressCard.vue'
import MapKeymapPanel from '@/components/map/MapKeymapPanel.vue'
import StateCard from '@/components/common/StateCard.vue'
import BackToTop from '@/components/common/BackToTop.vue'
import { useSchemeView } from '@/composables/useSchemeView'
import { getStorage, readString, writeString, STORAGE_KEYS } from '@/lib/storage'
import { useGlobalKeys, type KeyBinding } from '@/composables/useGlobalKeys'
import { buildChapterViews } from '@/lib/lessonView'
import { useCourseStore } from '@/stores/course'
import { useProgressStore } from '@/stores/progress'
import { useSoundStore } from '@/stores/sound'

const router = useRouter()
const course = useCourseStore()
const progress = useProgressStore()
const sound = useSoundStore()
const { engine, freeAtomIds } = useSchemeView()
const status = computed(() => course.status)
const error = computed(() => course.error)
function retry(): void {
  void course.init()
}
const busy = ref(false)
const errorText = computed(() => {
  if (!error.value) return ''
  if (!import.meta.env.DEV) return '应用数据未能加载。请确认静态包完整，并使用正确的启动方式。'
  return error.value
})
const errorHint = computed(() => {
  if (import.meta.env.DEV) {
    return '请确认 public/data 已由 node scripts/sync-data.mjs 生成，或执行 pnpm dev。'
  }
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    return '检测到直接双击 index.html：浏览器不允许读取本地 JSON 数据。请解压后运行 python start.py，再访问终端中显示的地址。'
  }
  return '请通过静态服务器启动，推荐解压后运行 python start.py；不要直接双击 index.html；同时确认 data/ 目录完整。'
})

// ── 学习地图滚动位置：按方案记忆；返回地图/课程页时恢复，而不是每次置顶 ──
const scrollStorage = getStorage('session')
const scrollKey = (): string => STORAGE_KEYS.mapScroll(course.schemeId || 'default')
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
  const value = Number(readString(scrollKey(), scrollStorage))
  return Number.isFinite(value) && value > 0 ? value : 0
}

function saveScroll(): void {
  writeString(scrollKey(), String(lastScrollY), scrollStorage)
}

// ── 章节展开 / 收起：按方案持久化；章节头即开关 ────────────────
const collapseStorage = getStorage('local')
const collapseKey = (): string => STORAGE_KEYS.mapCollapsed(course.schemeId || 'default')
const collapsedChapterIds = ref<string[]>([])

function readCollapsedChapters(): string[] {
  const raw = readString(collapseKey(), collapseStorage)
  return raw ? raw.split(',').filter(Boolean) : []
}

function saveCollapsedChapters(): void {
  writeString(collapseKey(), collapsedChapterIds.value.join(','), collapseStorage)
}

function toggleChapter(chapterId: string): void {
  const next = new Set(collapsedChapterIds.value)
  if (next.has(chapterId)) next.delete(chapterId)
  else next.add(chapterId)
  collapsedChapterIds.value = [...next]
  saveCollapsedChapters()
}

function isChapterCollapsed(chapterId: string): boolean {
  return collapsedChapterIds.value.includes(chapterId)
}

watch(
  () => course.schemeId,
  () => {
    collapsedChapterIds.value = readCollapsedChapters()
  },
  { immediate: true },
)

function onScroll(): void {
  if (leaving || suppressScrollSave) return
  lastScrollY = Math.max(0, Math.round(window.scrollY))
  if (scrollFrame !== undefined) return
  scrollFrame = window.requestAnimationFrame(() => {
    scrollFrame = undefined
    saveScroll()
  })
}

/** 用户点击/按键前先记住当前位置；导航后短时间内保持该位置，避免布局切换把 window.scrollY 归零 */
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


const chapters = computed(() =>
  engine.value && course.curriculum
    ? buildChapterViews(course.curriculum, engine.value, progress.records, course.unlockedAll)
    : [],
)
watch(
  [status, chapters],
  async () => {
    if (status.value === 'ready' && !course.curriculum) {
      restorePending.value = false
      return
    }
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
const heroPanelRef = ref<InstanceType<typeof SchemeHero> | null>(null)
/** 继续学习卡固定跟随 Hero 高度，避免映射多时反向撑高 Hero。 */
const heroHeight = ref<number | null>(null)
let heroResizeObserver: ResizeObserver | undefined

function updateHeroHeight(): void {
  if (window.innerWidth <= 640) {
    heroHeight.value = null
    return
  }
  const el = heroPanelRef.value?.$el as HTMLElement | undefined
  if (!el) {
    heroHeight.value = null
    return
  }
  heroHeight.value = Math.round(el.getBoundingClientRect().height)
}

async function observeHeroHeight(): Promise<void> {
  await nextTick()
  heroResizeObserver?.disconnect()
  const el = heroPanelRef.value?.$el as HTMLElement | undefined
  if (el) {
    heroResizeObserver = new ResizeObserver(updateHeroHeight)
    heroResizeObserver.observe(el)
  }
  updateHeroHeight()
}

watch(
  [status, () => course.schemeId, () => course.currentLesson()],
  () => { void observeHeroHeight() },
  { immediate: true, flush: 'post' },
)

onMounted(() => {
  window.addEventListener('resize', updateHeroHeight)
  void observeHeroHeight()
})

onBeforeUnmount(() => {
  heroResizeObserver?.disconnect()
  window.removeEventListener('resize', updateHeroHeight)
})
const currentLesson = computed(() =>
  currentId.value ? course.getLesson(currentId.value) : undefined,
)
const currentLessonView = computed(() =>
  chapters.value.flatMap((chapter) => chapter.lessons).find((lesson) => lesson.id === currentId.value) ?? null,
)
const currentChapterView = computed(() =>
  chapters.value.find((chapter) => chapter.lessons.some((lesson) => lesson.id === currentId.value)) ?? null,
)
const schemeName = computed(() => course.scheme?.name ?? '双拼方案')
const completedChapterCount = computed(
  () => chapters.value.filter((chapter) => chapter.lessons.length > 0 && chapter.lessons.every((lesson) => lesson.state === 'passed')).length,
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

/** 在学习路线中定位当前课：滚动到对应课程卡并闪烁高亮一次。 */
async function locateCurrentLesson(): Promise<void> {
  const id = currentId.value
  if (!id) return
  const chapter = currentChapterView.value
  if (chapter && isChapterCollapsed(chapter.id)) {
    toggleChapter(chapter.id)
    await nextTick()
  }
  const card = document.querySelector<HTMLElement>(`.lesson-card[data-lesson-id="${id}"]`)
  if (!card) return
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  card.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' })
  card.classList.remove('is-located')
  void card.offsetWidth
  card.classList.add('is-located')
  window.setTimeout(() => card.classList.remove('is-located'), 1700)
}

function clearProgress(): void {
  if (course.passedCount === 0) return
  if (!window.confirm('清除当前双拼方案的全部学习进度？此操作不可撤销。')) return
  progress.clear()
}

const schemeOptions = computed(() => course.allSchemeOptions)
const primarySchemeIds = computed(() => course.schemeOptions.map((option) => option.id))

async function changeScheme(id: string): Promise<void> {
  if (!id || id === course.schemeId) return
  sound.playKey()
  busy.value = true
  try {
    await course.selectScheme(id)
  } finally {
    busy.value = false
  }
}

function focusOtherScheme(): void {
  const select = document.querySelector<HTMLSelectElement>('.scheme-more select')
  if (!select) return
  select.focus()
  try {
    select.showPicker()
  } catch {
    /* 浏览器不支持时仍可聚焦后用方向键选择 */
  }
}

function focusLesson(step: 1 | -1): void {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('.lesson-card:not(:disabled)'),
  ).filter((button) => button.getClientRects().length > 0)
  if (buttons.length === 0) return
  const current = document.activeElement instanceof HTMLButtonElement
    ? buttons.indexOf(document.activeElement)
    : -1
  const next = current < 0 ? 0 : (current + step + buttons.length) % buttons.length
  buttons[next]?.focus()
}

const bindings = computed<KeyBinding[]>(() => {
  const list: KeyBinding[] = [
    {
      key: 's',
      alt: true,
      allowInInput: true,
      run: () => document.querySelector<HTMLSelectElement>('#scheme-select')?.focus(),
    },
    ...course.schemeOptions.map((option, index) => ({
      key: String(index + 1),
      alt: true,
      run: () => heroPanelRef.value?.selectScheme(option.id),
    })),
    {
      key: '6',
      alt: true,
      run: () => focusOtherScheme(),
    },
    {
      key: 'u',
      alt: true,
      run: () => course.toggleUnlockedAll(),
    },
    {
      key: 'c',
      alt: true,
      run: () => clearProgress(),
    },
    {
      key: 'l',
      alt: true,
      run: () => locateCurrentLesson(),
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
  ]
  return list
})
useGlobalKeys(bindings)
</script>

<template>
  <div class="page">
    <StateCard v-if="status === 'loading'" loading message="正在加载课程与词库…" />

    <StateCard
      v-else-if="status === 'error'"
      title="数据加载失败"
      :message="errorText"
    >
      <p class="hint">{{ errorHint }}</p>
      <button class="btn btn--primary" type="button" @click="retry()">重试</button>
    </StateCard>

    <div v-else class="course-board" :class="{ 'is-restoring': restorePending }">
      <div class="hero-overview">
        <SchemeHero
          ref="heroPanelRef"
          eyebrow="SHUANGPIN · DAILY PRACTICE"
          :title-lines="['学习双拼', '让输入成为直觉']"
          :keycap-text="schemeName"
          :scheme-options="schemeOptions"
          :primary-scheme-ids="primarySchemeIds"
          :scheme-id="course.schemeId"
          :scheme="course.scheme"
          :busy="busy"
          @change-scheme="changeScheme"
        />
        <CurrentLearningCard
          :lesson="currentLessonView"
          :chapter="currentChapterView"
          :current-title="currentTitle"
          :passed-count="course.passedCount"
          :lesson-total="course.lessons.length"
          :style="heroHeight ? { height: `${heroHeight}px` } : undefined"
          @start="startCurrent"
          @locate="locateCurrentLesson"
        />
      </div>

      <div class="workspace">
        <MapKeymapPanel
          :rows="engine?.keyMap() ?? []"
          :special-initials="engine?.diff().learnInitials ?? []"
          :zero-initials="course.scheme?.zeroInitial"
          :compat-codes="course.scheme?.compatCodes"
          :free-atom-ids="freeAtomIds"
          :scheme-name="schemeName"
        />
        <LearningProgressCard
          :progress-percent="course.progressPercent"
          :passed-count="course.passedCount"
          :lesson-total="course.lessons.length"
          :chapter-count="course.curriculum?.chapters.length ?? 0"
          :completed-chapter-count="completedChapterCount"
          :word-count="course.wordCount"
          :can-clear="course.passedCount > 0"
          :unlocked-all="course.unlockedAll"
          @clear-progress="clearProgress"
          @toggle-unlock="course.toggleUnlockedAll()"
        />
      </div>

      <section class="course-section panel">
        <header class="course-header">
          <h2 class="panel-title">学习路线</h2>
          <span v-if="!course.isCustomCourse" class="count-badge route-origin">自动生成</span>
          <span class="route-hint">
            <kbd>↑</kbd><kbd>↓</kbd> 选课
            <span aria-hidden="true">·</span>
            <kbd>Enter</kbd> 开始
          </span>
        </header>
        <div class="chapters">
          <ChapterSection
            v-for="chapter in chapters"
            :key="chapter.id"
            :chapter="chapter"
            :current-id="currentId"
            :collapsed="isChapterCollapsed(chapter.id)"
            @toggle="toggleChapter"
            @start="start"
          />
        </div>
      </section>
    </div>
    <BackToTop />
  </div>
</template>

<style scoped>
.course-board.is-restoring {
  visibility: hidden;
}
.course-board {
  display: flex;
  flex-direction: column;
  gap: 15px;
}
.hero-overview {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(390px, 0.95fr);
  gap: 16px;
  align-items: start;
}
.workspace {
  display: grid;
  grid-template-columns: minmax(0, 1.85fr) minmax(280px, 0.72fr);
  gap: 15px;
  align-items: stretch;
}
.course-section {
  overflow: visible;
  padding-bottom: 10px;
}
.course-header {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: space-between;
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--line);
}
.route-origin {
  margin-right: auto;
  background: var(--fin-soft);
  color: var(--fin-strong);
}
.route-hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--ink-4);
  font-size: var(--text-2xs);
  font-weight: 600;
}
.route-hint kbd {
  min-width: 18px;
  justify-content: center;
}
.chapters {
  display: block;
}
.hint {
  margin-bottom: 8px;
  color: var(--ink-3);
  font-size: var(--text-sm);
}
@media (max-width: 1024px) {
  .hero-overview {
    grid-template-columns: minmax(0, 1.15fr) minmax(340px, 0.95fr);
  }
  .workspace {
    grid-template-columns: minmax(0, 1.6fr) minmax(260px, 0.75fr);
  }
}
@media (max-width: 1024px) {
  .hero-overview {
    grid-template-columns: minmax(0, 1.05fr) minmax(320px, 0.95fr);
  }
  .workspace {
    grid-template-columns: minmax(0, 1.45fr) minmax(250px, 0.8fr);
  }
}
@media (max-width: 640px) {
  .course-board {
    gap: 12px;
  }
  .hero-overview,
  .workspace {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  .course-header {
    padding: 14px 16px 10px;
  }
  .course-section {
    padding-bottom: 6px;
  }
}
@media (max-width: 640px) {
  .page {
    padding: var(--page-top-gap) 10px 26px;
  }
}
</style>
