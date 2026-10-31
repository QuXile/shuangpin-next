<script setup lang="ts">
/** 全局顶栏：品牌 / 主导航 / 返回路线 / 课程标题 / 主题切换。 */
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useCourseStore } from '@/stores/course'
import { useLayoutStore } from '@/stores/layout'
import { useSettingsStore } from '@/stores/settings'

const route = useRoute()
const router = useRouter()
const course = useCourseStore()
const settings = useSettingsStore()
const layout = useLayoutStore()

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
  <header class="topbar" :class="{ 'is-practice': isPractice, 'has-stage': Boolean(layout.stageLabel) }">
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
          <span v-if="layout.stageLabel" class="topbar-stage">{{ layout.stageLabel }}</span>
        </template>
        <RouterLink v-else to="/" class="brand" aria-label="双拼 NEXT 学习路线">
          <span class="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32">
              <defs>
                <linearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" class="brand-grad-start" />
                  <stop offset="1" class="brand-grad-end" />
                </linearGradient>
              </defs>
              <rect x="1.5" y="1.5" width="29" height="29" rx="9" fill="url(#brandGrad)" />
              <g class="brand-glyph">
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
        <span v-if="!isPractice && layout.stageLabel" class="topbar-stage">{{ layout.stageLabel }}</span>
      </div>

      <nav class="topbar-nav segmented" aria-label="主导航">
        <RouterLink
          to="/"
          class="segmented-btn"
          :class="{ 'is-active': courseActive }"
          :aria-current="courseActive ? 'page' : undefined"
          aria-keyshortcuts="Alt+H"
          title="课程路线（Alt+H）"
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
          title="练习场（Alt+P）"
        >
          练习
          <kbd>Alt+P</kbd>
        </RouterLink>
      </nav>

      <div class="top-actions">
        <button
          class="theme-btn shortcut-btn"
          type="button"
          aria-label="查看快捷键（?）"
          aria-keyshortcuts="?"
          title="查看快捷键（?）"
          @click="layout.openShortcutHelp()"
        >
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 10.7v4.8" />
            <path d="M12 7.9h.01" />
          </svg>
          <kbd>?</kbd>
        </button>

        <button
          v-if="layout.keyboardAvailable"
          class="theme-btn keyboard-btn"
          type="button"
          :aria-label="layout.keyboardVisible ? '隐藏底部键盘（Ctrl+K）' : '显示底部键盘（Ctrl+K）'"
          :aria-pressed="layout.keyboardVisible"
          aria-keyshortcuts="Control+K"
          :title="layout.keyboardVisible ? '隐藏底部键盘（Ctrl+K）' : '显示底部键盘（Ctrl+K）'"
          @click="layout.toggleKeyboard()"
        >
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2.5" y="6" width="19" height="12" rx="2.4" />
            <path d="M6.2 10h.01M9.4 10h.01M12.6 10h.01M15.8 10h.01M19 10h.01M6.2 13.2h.01M9.4 13.2h.01M12.6 13.2h.01M15.8 13.2h.01M19 13.2h.01M7.4 16.2h9.2" />
            <path v-if="layout.keyboardVisible" d="M4 20 20 4" />
          </svg>
          <kbd>Ctrl+K</kbd>
        </button>

        <button
          class="theme-btn"
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
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--line-faint);
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

/* ── 品牌 ─────────────────────────────────── */
.brand {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 9px;
  font-weight: 800;
  font-size: 16px;
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
.brand-grad-start {
  stop-color: var(--brand);
}
.brand-grad-end {
  stop-color: var(--brand-fill-hover);
}
.brand-glyph {
  fill: var(--on-accent);
}
.brand-name {
  letter-spacing: 0.02em;
  white-space: nowrap;
}
.brand-tag {
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--brand-soft);
  color: var(--brand-ink);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.12em;
  line-height: 1.5;
}

/* ── 左侧：返回路线 / 课名 / 阶段标签 ─────── */
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

/* ── 右侧：主题切换 ───────────────────────── */
.top-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-width: 0;
}
.theme-btn {
  flex: none;
  height: 34px;
  min-width: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: var(--r-control);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  color: var(--ink-3);
  transition: background var(--dur-fast), border-color var(--dur-fast), color var(--dur-fast);
}
.theme-btn:hover {
  border-color: var(--line-strong);
  background: var(--surface-2);
  color: var(--ink);
}
.theme-btn kbd {
  color: var(--ink-3);
}
.theme-btn .icon {
  transition: transform var(--dur-mid) var(--ease);
}
.theme-btn:hover .icon {
  transform: rotate(-10deg);
}
.theme-btn:active .icon {
  transform: scale(0.9);
}
.keyboard-btn:hover .icon {
  transform: translateY(-1px);
}
.keyboard-btn:active .icon {
  transform: scale(0.9);
}

/* ── 移动端（--topbar-h / --page-pad-x 已由 token 收窄到 54 / 14）── */
@media (max-width: 640px) {
  .topbar-inner {
    gap: 8px;
  }
  .topbar-left {
    gap: 8px;
  }
  .brand {
    gap: 8px;
  }
  .brand-mark {
    width: 26px;
    height: 26px;
  }
  .brand-name {
    font-size: 14px;
  }
  .brand-tag {
    display: none;
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
    font-size: 10px;
  }
  .topbar-nav {
    --seg-pad: 2px;
    padding: 2px;
    border-radius: var(--r-control);
  }
  .topbar-nav .segmented-btn {
    height: 26px;
    padding: 0 11px;
    font-size: 11.5px;
  }
  .topbar-nav kbd {
    display: none;
  }
  .theme-btn {
    width: 34px;
    padding: 0;
  }
  .theme-btn kbd {
    display: none;
  }
  /* 练习进行中：移动端优先展示课名和阶段标签，隐藏主导航 */
  .topbar.has-stage .topbar-inner {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .topbar.has-stage .topbar-nav {
    display: none;
  }
  .topbar.has-stage .top-actions {
    grid-column: 2;
  }
}
</style>
