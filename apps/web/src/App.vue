<script setup lang="ts">
/** 应用外壳：全局顶栏 + 路由视图 + 页脚；数据引导与全局快捷键在这里启动一次。 */
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import Topbar from '@/components/layout/Topbar.vue'
import { useCourseBootstrap } from '@/composables/useCourseBootstrap'
import { useGlobalKeys } from '@/composables/useGlobalKeys'
import { useCourseStore } from '@/stores/course'
import { useSettingsStore } from '@/stores/settings'

const route = useRoute()
const settings = useSettingsStore()
const course = useCourseStore()
useCourseBootstrap()

const isPractice = computed(() => route.path.startsWith('/practice') || route.path === '/training')

useGlobalKeys(() => [
  {
    key: 't',
    alt: true,
    allowInInput: true,
    run: () => settings.toggleTheme(),
  },
])
</script>

<template>
  <div class="app-shell" :class="{ 'is-practice': isPractice }">
    <Topbar />
    <main class="app-main">
      <RouterView :key="route.fullPath" />
    </main>
    <footer v-if="!isPractice" class="footer">
      <span>双拼 NEXT · 实现预览</span>
      <span v-if="course.scheme">当前方案：{{ course.scheme.name }} · 课程 {{ course.lessons.length }} 节</span>
      <span>设计文档见仓库 docs/ · 数据由 data/ 生成</span>
    </footer>
  </div>
</template>

<style scoped>
.app-shell {
  --topbar-h: 64px;
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
  max-width: 1120px;
  margin: 0 auto;
  width: 100%;
  padding: 20px 20px 28px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  font-size: var(--text-xs);
  color: var(--ink-4);
}
@media (max-width: 640px) {
  .app-shell {
    --topbar-h: 54px;
  }
  .footer {
    padding: 16px 14px 24px;
  }
}
</style>
