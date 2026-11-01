/**
 * 顶栏上下文：练习页把自己的阶段标题挂到全局顶栏上，并声明底部键位图是否可用。
 * 仅影响展示，不参与课程/判题逻辑。
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { AtomId, LetterKey } from '@shuangpin/core'

export interface DockContent {
  rows: LetterKey[][]
  schemeName?: string
  highlightAtomIds?: readonly AtomId[]
  conceal?: boolean
  specialInitials?: readonly string[]
  legend?: boolean
  hiddenAtomIds?: readonly AtomId[]
  zeroInitials?: Readonly<Record<string, readonly string[]>>
  compatCodes?: Readonly<Record<string, readonly string[]>>
}

export const useLayoutStore = defineStore('layout', () => {
  const stageLabel = ref('')
  /** 底部键位图是否默认显示；仅在支持底部键位图的页面生效 */
  const keyboardVisible = ref(true)
  /** 当前页面是否有底部键位图（决定顶栏键盘按钮是否出现） */
  const keyboardAvailable = ref(false)
  /** 快捷键帮助浮层 */
  const shortcutHelpVisible = ref(false)
  /** 由练习页注册的底栏内容；App 级 BottomDockHost 只负责生命周期和动效 */
  const dockContent = ref<DockContent | null>(null)

  function setStageLabel(label: string): void {
    stageLabel.value = label
  }

  function clearStageLabel(): void {
    stageLabel.value = ''
  }

  function setKeyboardAvailable(available: boolean): void {
    keyboardAvailable.value = available
  }

  function setDockContent(content: DockContent | null): void {
    dockContent.value = content
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
    dockContent,
    setDockContent,
    toggleKeyboard,
    shortcutHelpVisible,
    openShortcutHelp,
    closeShortcutHelp,
    toggleShortcutHelp,
  }
})
