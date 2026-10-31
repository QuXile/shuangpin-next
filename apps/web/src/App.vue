<script setup lang="ts">
/** 应用外壳：全局顶栏 + 路由视图 + 页脚；数据引导与全局快捷键在这里启动一次。 */
import { computed, onMounted } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import Topbar from '@/components/layout/Topbar.vue'
import ShortcutHelp from '@/components/layout/ShortcutHelp.vue'
import { useCourseBootstrap } from '@/composables/useCourseBootstrap'
import { useGlobalKeys } from '@/composables/useGlobalKeys'
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
useCourseBootstrap()
usePointerBlur()

onMounted(() => {
  const unlockAudio = (): void => sound.unlock()
  window.addEventListener('pointerdown', unlockAudio, { capture: true, once: true })
  window.addEventListener('keydown', unlockAudio, { capture: true, once: true })
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
    <footer v-if="!isPractice" class="footer">
      <span>双拼 NEXT · 实现预览</span>
      <span v-if="course.scheme">
        当前方案：{{ course.scheme.name }}
        <template v-if="!course.previewMode"> · 课程 {{ course.lessons.length }} 节</template>
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
  transition: opacity 200ms var(--ease), transform 200ms var(--ease);
}
:global(.page-enter-from) {
  opacity: 0;
  transform: translateY(6px);
}
:global(.page-leave-to) {
  opacity: 0;
  transform: translateY(-4px);
}
@media (prefers-reduced-motion: reduce) {
  :global(.page-enter-active),
  :global(.page-leave-active) {
    transition-duration: 1e-5s;
  }
}
</style>
