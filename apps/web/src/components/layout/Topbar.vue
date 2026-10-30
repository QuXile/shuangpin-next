<script setup lang="ts">
/** 全局顶栏：品牌 / 主导航 / 返回路线 / 课程标题 / 主题切换。 */
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useCourseStore } from '@/stores/course'
import { useSettingsStore } from '@/stores/settings'

const route = useRoute()
const router = useRouter()
const course = useCourseStore()
const settings = useSettingsStore()

const isPractice = computed(() => route.path.startsWith('/practice'))
const courseActive = computed(() => route.path === '/' || isPractice.value)
const trainingActive = computed(() => route.path === '/training')
const practiceTitle = computed(() => {
  if (!isPractice.value) return ''
  const lessonId = String(route.params.lessonId ?? '')
  return course.getLesson(lessonId)?.title ?? '课程练习'
})
</script>

<template>
  <header class="topbar">
    <div class="topbar-inner">
      <div class="topbar-left">
        <template v-if="isPractice">
          <button class="topbar-back" type="button" @click="router.push('/')">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19.5 12h-15" /><path d="m10.5 6-6 6 6 6" />
            </svg>
            返回路线
            <kbd>Esc</kbd>
          </button>
          <span class="topbar-divider" aria-hidden="true" />
          <span class="topbar-course">{{ practiceTitle }}</span>
        </template>
        <RouterLink v-else to="/" class="brand" aria-label="双拼 NEXT 学习路线">
          <span class="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32">
              <defs>
                <linearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stop-color="#6366f1" />
                  <stop offset="1" stop-color="#8b5cf6" />
                </linearGradient>
              </defs>
              <rect x="1.5" y="1.5" width="29" height="29" rx="9" fill="url(#brandGrad)" />
              <g fill="#ffffff">
                <rect x="7.4" y="8.4" width="7.4" height="6.6" rx="2" opacity=".95" />
                <rect x="17.2" y="8.4" width="7.4" height="6.6" rx="2" opacity=".55" />
                <rect x="7.4" y="17" width="7.4" height="6.6" rx="2" opacity=".55" />
                <rect x="17.2" y="17" width="7.4" height="6.6" rx="2" opacity=".95" />
              </g>
            </svg>
          </span>
          <span class="brand-name">双拼</span>
          <span class="brand-tag">NEXT</span>
        </RouterLink>
      </div>

      <nav class="topbar-nav" aria-label="主导航">
        <RouterLink to="/" class="nav-tab" :class="{ 'is-active': courseActive }">课程</RouterLink>
        <RouterLink to="/training" class="nav-tab" :class="{ 'is-active': trainingActive }">练习</RouterLink>
      </nav>

      <div class="top-actions">
        <button
          class="icon-btn theme-btn"
          type="button"
          :aria-label="settings.isDark ? '切换为亮色模式（Alt+T）' : '切换为暗色模式（Alt+T）'"
          :aria-pressed="settings.isDark"
          aria-keyshortcuts="Alt+T"
          title="切换主题（Alt+T）"
          @click="settings.toggleTheme()"
        >
          <svg v-if="settings.isDark" class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
            <circle cx="12" cy="12" r="4.1" />
            <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6" />
          </svg>
          <svg v-else class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.4 14.4A8.5 8.5 0 1 1 9.6 3.6a6.9 6.9 0 0 0 10.8 10.8z" />
          </svg>
          <kbd>Alt+T</kbd>
        </button>
      </div>
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
  background: color-mix(in srgb, var(--bg) 84%, transparent);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--line-faint);
}
.topbar-inner {
  max-width: 1120px;
  margin: 0 auto;
  height: 100%;
  padding: 0 20px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 16px;
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: var(--text-md);
}
.brand-mark {
  width: 30px;
  height: 30px;
  display: block;
}
.brand-mark svg {
  width: 100%;
  height: 100%;
  display: block;
}
.brand-name {
  letter-spacing: 0.02em;
}
.brand-tag {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.1em;
  color: var(--brand-ink);
  background: var(--brand-soft);
  border-radius: var(--r-xs);
  padding: 2px 5px;
}
.topbar-left {
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 13px;
}
.topbar-nav {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--line-faint);
  border-radius: var(--r-pill);
  background: var(--surface-2);
}
.nav-tab {
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 15px;
  border-radius: var(--r-pill);
  color: var(--ink-3);
  font-size: 12px;
  font-weight: 650;
  white-space: nowrap;
  transition: background var(--dur-fast), color var(--dur-fast), box-shadow var(--dur-fast);
}
.nav-tab:hover {
  color: var(--ink);
}
.nav-tab.is-active {
  color: var(--brand-ink);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}
.topbar-back {
  height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 8px 0 5px;
  border-radius: var(--r-sm);
  color: var(--ink-3);
  font-size: 12px;
  transition: background var(--dur-fast), color var(--dur-fast);
}
.topbar-back:hover {
  background: var(--surface-2);
  color: var(--ink);
}
.topbar-back .icon {
  width: 16px;
  height: 16px;
}
.topbar-back kbd {
  margin-left: 1px;
}
.topbar-divider {
  width: 1px;
  height: 17px;
  flex: none;
  background: var(--line);
}
.topbar-course {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.top-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-width: 0;
}
.icon-btn {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: var(--r-pill);
  color: var(--ink-3);
  border: 1px solid transparent;
  transition: background var(--dur-fast), color var(--dur-fast);
}
.icon-btn:hover {
  background: var(--surface-2);
  color: var(--ink);
}
.theme-btn {
  width: auto;
  padding: 0 9px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.theme-btn kbd {
  color: var(--ink-3);
}
@media (max-width: 640px) {
  .topbar-inner {
    padding: 0 14px;
  }
  .topbar-left {
    gap: 8px;
  }
  .topbar-back {
    padding-left: 2px;
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
    font-size: 13px;
  }
  .topbar-inner {
    padding: 0 12px;
    gap: 8px;
  }
  .brand-tag {
    display: none;
  }
  .brand-name {
    font-size: 14px;
  }
  .brand-mark {
    width: 26px;
    height: 26px;
  }
  .theme-btn {
    padding: 0;
  }
  .theme-btn kbd {
    display: none;
  }
  .topbar-nav {
    padding: 2px;
  }
  .nav-tab {
    height: 26px;
    padding: 0 11px;
    font-size: 11px;
  }
}
</style>
