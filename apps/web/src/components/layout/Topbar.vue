<script setup lang="ts">
/** 全局顶栏：返回路线 / 品牌 / 主导航 / 操作区。品牌与操作区拆为子组件。 */
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useCourseStore } from '@/stores/course'
import { useLayoutStore } from '@/stores/layout'
import BrandPopover from './BrandPopover.vue'
import TopbarActions from './TopbarActions.vue'

const route = useRoute()
const router = useRouter()
const course = useCourseStore()
const layout = useLayoutStore()

const isPractice = computed(() => route.path.startsWith('/practice'))
const courseActive = computed(() => route.path === '/' || isPractice.value)
const trainingActive = computed(() => route.path === '/training')
const displayedScheme = computed(() => course.scheme?.name ?? '')
const practiceTitle = computed(() => {
  if (!isPractice.value) return ''
  const lessonId = String(route.params.lessonId ?? '')
  return course.getLesson(lessonId)?.title ?? '课程练习'
})
</script>

<template>
  <header class="topbar" :class="{ 'is-practice': isPractice, 'has-stage': Boolean(layout.stageLabel) }">
    <div class="topbar-inner">
      <div class="topbar-left">
        <template v-if="isPractice">
          <button class="topbar-back" type="button" @click="router.push('/')">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19.5 12h-15" /><path d="m10.5 6-6 6 6 6" />
            </svg>
            返回路线
            <kbd>Alt+H</kbd>
          </button>
          <span class="topbar-divider" aria-hidden="true" />
          <span class="topbar-course">{{ practiceTitle }}</span>
          <span v-if="layout.stageLabel" class="topbar-stage">{{ layout.stageLabel }}</span>
        </template>
        <BrandPopover v-else />
        <span v-if="!isPractice && layout.stageLabel" class="topbar-stage">{{ layout.stageLabel }}</span>
        <span v-if="displayedScheme" class="count-badge topbar-scheme">{{ displayedScheme }}</span>
      </div>

      <nav class="topbar-nav segmented" aria-label="主导航">
        <RouterLink
          to="/"
          class="segmented-btn"
          :class="{ 'is-active': courseActive }"
          :aria-current="courseActive ? 'page' : undefined"
          aria-keyshortcuts="Alt+H"
          title="课程路线 Alt+H"
        >
          课程
          <kbd>Alt+H</kbd>
        </RouterLink>
        <RouterLink
          to="/training"
          class="segmented-btn"
          :class="{ 'is-active': trainingActive }"
          :aria-current="trainingActive ? 'page' : undefined"
          aria-keyshortcuts="Alt+P"
          title="练习场 Alt+P"
        >
          练习
          <kbd>Alt+P</kbd>
        </RouterLink>
      </nav>

      <TopbarActions />
    </div>
  </header>
</template>

<style scoped>
.topbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 20;
  height: var(--topbar-h);
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--line);
}
.topbar-inner {
  max-width: var(--page-max);
  margin: 0 auto;
  height: 100%;
  padding: 0 var(--page-pad-x);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 16px;
}


.topbar-left {
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
}
.topbar-back {
  flex: none;
  height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 10px 0 6px;
  border-radius: var(--r-control);
  color: var(--ink-3);
  font-size: var(--text-sm);
  font-weight: 600;
  transition: background var(--dur-fast), color var(--dur-fast), transform var(--dur-fast);
}
.topbar-back:hover {
  background: var(--surface-2);
  color: var(--ink);
}
.topbar-back:active {
  transform: scale(0.96);
}
.topbar-back .icon {
  width: 16px;
  height: 16px;
}
.topbar-back kbd {
  color: var(--ink-3);
}
.topbar-divider {
  width: 1px;
  height: 16px;
  flex: none;
  background: var(--line-strong);
}
.topbar-course {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink);
  font-size: var(--text-md);
  font-weight: 850;
  letter-spacing: -0.015em;
}
.topbar-scheme {
  flex: none;
  max-width: 112px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-2xs);
}
.topbar-stage {
  flex: none;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 2px 9px;
  border-radius: var(--r-control);
  background: var(--brand-soft);
  color: var(--brand-ink);
  font-size: var(--text-xs);
  font-weight: 750;
  line-height: 1.5;
}


@media (max-width: 640px) {
  .topbar-inner {
    gap: 8px;
  }
  .topbar-left {
    gap: 8px;
  }
  /* 移动端优先保留返回图标，课名与阶段标签仍可读 */
  .topbar-back {
    width: 34px;
    justify-content: center;
    padding: 0;
    font-size: 0;
  }
  .topbar-back .icon {
    width: 18px;
    height: 18px;
  }
  .topbar-back kbd {
    display: none;
  }
  .topbar-divider {
    display: none;
  }
  .topbar-course {
    font-size: var(--text-base);
  }
  .topbar-stage {
    max-width: 84px;
    padding: 1px 7px;
    font-size: var(--text-2xs);
  }
  .topbar-scheme {
    display: none;
  }
  .topbar-nav {
    --seg-pad: 2px;
    padding: 2px;
    border-radius: var(--r-control);
  }
  .topbar-nav .segmented-btn {
    height: 26px;
    padding: 0 11px;
    font-size: var(--text-xs);
  }
  .topbar-nav kbd {
    display: none;
  }
  /* 练习进行中：移动端优先展示课名和阶段标签，隐藏主导航 */
  .topbar.has-stage .topbar-inner {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .topbar.has-stage .topbar-nav {
    display: none;
  }
  .topbar.has-stage :deep(.top-actions) {
    grid-column: 2;
  }
}
</style>
