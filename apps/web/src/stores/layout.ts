/**
 * 顶栏上下文：练习页把自己的阶段标题挂到全局顶栏上，并声明底部键位图是否可用。
 * 仅影响展示，不参与课程/判题逻辑。
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useLayoutStore = defineStore('layout', () => {
  const stageLabel = ref('')
  /** 底部键位图是否默认显示；仅在支持底部键位图的页面生效 */
  const keyboardVisible = ref(true)
  /** 当前页面是否有底部键位图（决定顶栏键盘按钮是否出现） */
  const keyboardAvailable = ref(false)
  /** 快捷键帮助浮层 */
  const shortcutHelpVisible = ref(false)

  function setStageLabel(label: string): void {
    stageLabel.value = label
  }

  function clearStageLabel(): void {
    stageLabel.value = ''
  }

  function setKeyboardAvailable(available: boolean): void {
    keyboardAvailable.value = available
  }

  function toggleKeyboard(): void {
    if (!keyboardAvailable.value) return
    keyboardVisible.value = !keyboardVisible.value
  }

  function openShortcutHelp(): void {
    shortcutHelpVisible.value = true
  }

  function closeShortcutHelp(): void {
    shortcutHelpVisible.value = false
  }

  function toggleShortcutHelp(): void {
    shortcutHelpVisible.value = !shortcutHelpVisible.value
  }

  return {
    stageLabel,
    setStageLabel,
    clearStageLabel,
    keyboardVisible,
    keyboardAvailable,
    setKeyboardAvailable,
    toggleKeyboard,
    shortcutHelpVisible,
    openShortcutHelp,
    closeShortcutHelp,
    toggleShortcutHelp,
  }
})
