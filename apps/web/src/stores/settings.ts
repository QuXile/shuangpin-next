/**
 * 主题偏好（浅色 / 深色）：系统主题为默认，用户选择持久化。
 * 首屏防闪白的同口径读取在 index.html 内联脚本中（应用启动前执行，键名与这里保持一致）。
 */
import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { STORAGE_KEYS, readString, writeString } from '@/lib/storage'

type Theme = 'light' | 'dark'

function systemTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readTheme(): Theme {
  const saved = readString(STORAGE_KEYS.theme)
  if (saved === 'dark' || saved === 'light') return saved
  return systemTheme()
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

export const useSettingsStore = defineStore('settings', () => {
  const theme = ref<Theme>(readTheme())
  const isDark = computed(() => theme.value === 'dark')

  watch(theme, (value) => {
    writeString(STORAGE_KEYS.theme, value)
    applyTheme(value)
  })

  function toggleTheme(): void {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }

  applyTheme(theme.value)

  return { theme, isDark, toggleTheme }
})
