<script setup lang="ts">
/** 顶栏右侧操作区：快捷键帮助 / 底部键盘 / 音效 / 主题。 */
import { useLayoutStore } from '@/stores/layout'
import { useSettingsStore } from '@/stores/settings'
import { useSoundStore } from '@/stores/sound'

const layout = useLayoutStore()
const settings = useSettingsStore()
const sound = useSoundStore()
</script>

<template>
      <div class="top-actions">
        <button
          class="theme-btn shortcut-btn"
          type="button"
          aria-label="查看快捷键 ?"
          aria-keyshortcuts="?"
          title="查看快捷键 ?"
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
          :aria-label="layout.keyboardVisible ? '隐藏底部键盘 Ctrl+K' : '显示底部键盘 Ctrl+K'"
          :aria-pressed="layout.keyboardVisible"
          aria-keyshortcuts="Control+K"
          :title="layout.keyboardVisible ? '隐藏底部键盘 Ctrl+K' : '显示底部键盘 Ctrl+K'"
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
          class="theme-btn sound-btn"
          type="button"
          :aria-label="sound.enabled ? '关闭音效 Alt+B' : '开启音效 Alt+B'"
          :aria-pressed="sound.enabled"
          aria-keyshortcuts="Alt+B"
          :title="sound.enabled ? '关闭音效 Alt+B' : '开启音效 Alt+B'"
          @click="sound.toggle()"
        >
          <svg v-if="sound.enabled" class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 5 6 9H3v6h3l5 4V5Z" />
            <path d="M15.2 8.7a4.7 4.7 0 0 1 0 6.6" />
            <path d="M18 5.9a8.5 8.5 0 0 1 0 12.2" />
          </svg>
          <svg v-else class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 5 6 9H3v6h3l5 4V5Z" />
            <path d="m15.5 9.5 5 5" />
            <path d="m20.5 9.5-5 5" />
          </svg>
          <kbd>Alt+B</kbd>
        </button>

        <button
          class="theme-btn"
          type="button"
          :aria-label="settings.isDark ? '切换为亮色模式 Alt+T' : '切换为暗色模式 Alt+T'"
          :aria-pressed="settings.isDark"
          aria-keyshortcuts="Alt+T"
          title="切换主题 Alt+T"
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
</template>

<style scoped>
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


/* 中等宽度：动作区使用图标-only，避免右侧按钮溢出压住主导航。 */
@media (max-width: 1024px) {
  .top-actions {
    gap: 6px;
  }
  .theme-btn {
    gap: 0;
    width: 34px;
    padding: 0;
  }
  .theme-btn kbd {
    display: none;
  }
}
@media (max-width: 640px) {
  .theme-btn {
    width: 34px;
    padding: 0;
  }
  .theme-btn kbd {
    display: none;
  }
}
</style>
