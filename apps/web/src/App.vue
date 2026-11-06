<script setup lang="ts">
/** 应用外壳：全局顶栏 + 路由视图 + 页脚；数据引导与全局快捷键在这里启动一次。 */
import { computed, onMounted } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import Topbar from '@/components/layout/Topbar.vue'
import BottomDockHost from '@/components/keyboard/BottomDockHost.vue'
import ShortcutHelp from '@/components/layout/ShortcutHelp.vue'
import { useGlobalKeys } from '@/composables/useGlobalKeys'
import { useKeyInput } from '@/composables/useKeyInput'
import { usePointerBlur } from '@/composables/usePointerBlur'
import { useCourseStore } from '@/stores/course'
import { useLayoutStore } from '@/stores/layout'
import { useSettingsStore } from '@/stores/settings'
import { useSoundStore } from '@/stores/sound'

const route = useRoute()
const router = useRouter()
const settings = useSettingsStore()
const sound = useSoundStore()
const course = useCourseStore()
const layout = useLayoutStore()
usePointerBlur()
useKeyInput()

/**
 * 首屏空闲时预取练习页 chunk（最常用导航）。
 * - 与路由懒加载共用同一个 chunk，点击课程时无需再等网络；
 * - 只在课程数据就绪后调度，尊重省流模式与后台标签页；
 * - 失败静默，不影响正常导航（真正进入时仍会重新请求）。
 */
function prefetchPracticeRoute(): void {
  if (typeof window === 'undefined') return
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  if (connection?.saveData) return
  const run = (): void => {
    void import('./pages/PracticePage.vue').catch(() => {
      /* 预取失败由实际导航兜底 */
    })
  }
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 4000 })
  }
}

onMounted(() => {
  void course.init().then(() => {
    if (route.path === '/') prefetchPracticeRoute()
  })
  const unlockAudio = (): void => sound.unlock()
  // 浏览器会在长时间无操作后自动 suspend AudioContext；每次手势都先恢复，
  // 避免下一次按键的声音等到 resume 完成才播放。
  window.addEventListener('pointerdown', unlockAudio, { capture: true })
  window.addEventListener('keydown', unlockAudio, { capture: true })
})

const isPractice = computed(() => route.path.startsWith('/practice') || route.path === '/training')

useGlobalKeys(() => [
  {
    key: 't',
    alt: true,
    allowInInput: true,
    run: () => settings.toggleTheme(),
  },
  {
    key: 'b',
    alt: true,
    allowInInput: true,
    run: () => sound.toggle(),
  },
  {
    key: 'k',
    ctrl: true,
    allowInInput: true,
    when: () => layout.keyboardAvailable,
    run: () => layout.toggleKeyboard(),
  },
  {
    key: 'k',
    alt: true,
    allowInInput: true,
    when: () => layout.keyboardAvailable,
    run: () => layout.toggleKeyboard(),
  },
  {
    key: 'h',
    alt: true,
    run: () => void router.push('/'),
  },
  {
    key: 'p',
    alt: true,
    run: () => void router.push('/training'),
  },
  {
    key: '?',
    when: () => !layout.shortcutHelpVisible,
    run: () => layout.openShortcutHelp(),
  },
])
</script>

<template>
  <div class="app-shell" :class="{ 'is-practice': isPractice }">
    <Topbar />
    <main class="app-main">
      <RouterView v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <component :is="Component" :key="route.fullPath" />
        </Transition>
      </RouterView>
    </main>
    <BottomDockHost />
    <footer v-if="!isPractice" class="footer">
      <span>双拼 NEXT · 实现预览</span>
      <span v-if="course.scheme">
        当前方案：{{ course.scheme.name }}
        · 课程 {{ course.lessons.length }} 节
      </span>
      <span>设计文档见仓库 docs/ · 数据由 data/ 生成</span>
    </footer>
    <ShortcutHelp />
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  padding-top: var(--topbar-h);
  display: flex;
  flex-direction: column;
}
.app-main {
  flex: 1;
}
.app-shell.is-practice {
  height: 100dvh;
  overflow: hidden;
}
.app-shell.is-practice .app-main {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.footer {
  max-width: var(--page-max);
  margin: 0 auto;
  width: 100%;
  padding: 20px var(--page-pad-x) 30px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  font-size: var(--text-xs);
  color: var(--ink-4);
}
@media (max-width: 640px) {
  .footer {
    padding: 16px var(--page-pad-x) 24px;
  }
}
:global(.page-enter-active),
:global(.page-leave-active) {
  transition: opacity var(--dur-mid) var(--ease), transform var(--dur-mid) var(--ease);
}
:global(.page-enter-from) {
  opacity: 0;
  transform: translateY(6px);
}
:global(.page-leave-to) {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
