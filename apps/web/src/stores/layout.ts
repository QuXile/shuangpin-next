/**
 * 顶栏上下文：练习页把自己的阶段标题挂到全局顶栏上。
 * 仅影响展示，不参与课程/判题逻辑。
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useLayoutStore = defineStore('layout', () => {
  const stageLabel = ref('')

  function setStageLabel(label: string): void {
    stageLabel.value = label
  }

  function clearStageLabel(): void {
    stageLabel.value = ''
  }

  return { stageLabel, setStageLabel, clearStageLabel }
})
