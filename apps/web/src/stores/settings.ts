import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

type Theme = 'light' | 'dark'

const THEME_KEY = 'shuangpin-next:theme'

function systemTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'dark' || saved === 'light') return saved
  } catch {
    /* 隐私模式/禁用存储：回退系统主题 */
  }
  return systemTheme()
}

export const useSettingsStore = defineStore('settings', () => {
  const theme = ref<Theme>(readTheme())
  const isDark = computed(() => theme.value === 'dark')

  function applyTheme(): void {
    document.documentElement.dataset.theme = theme.value
    document.documentElement.style.colorScheme = theme.value
  }

  watch(theme, () => {
    try {
      localStorage.setItem(THEME_KEY, theme.value)
    } catch {
      /* 写入失败不影响界面 */
    }
    applyTheme()
  })

  function toggleTheme(): void {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }

  applyTheme()

  return { theme, isDark, toggleTheme }
})
