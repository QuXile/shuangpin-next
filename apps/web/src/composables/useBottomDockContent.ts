/** 页面只负责提供键位图内容；底栏的挂载、显隐与动效统一由 App 级 BottomDockHost 决策。 */
import { watch } from 'vue'
import { useLayoutStore, type DockContent } from '@/stores/layout'

export function useBottomDockContent(read: () => DockContent | null): void {
  const layout = useLayoutStore()
  watch(
    read,
    (content) => layout.setDockContent(content),
    { immediate: true, deep: true, flush: 'post' },
  )
}
