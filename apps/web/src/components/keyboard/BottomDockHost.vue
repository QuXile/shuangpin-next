<script setup lang="ts">
/**
 * App 级底部键位图宿主。
 * 页面只通过 useBottomDockContent 注册内容；这里统一决定显隐、高度测量和动画，
 * 因此配置/会话切换、下一阶段切换都不会重新挂载或重播底栏动画。
 */
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import DockReveal from './DockReveal.vue'
import KeyboardDock from './KeyboardDock.vue'
import { useLayoutStore } from '@/stores/layout'

const route = useRoute()
const layout = useLayoutStore()

const practiceRoute = computed(
  () => route.path.startsWith('/practice') || route.path === '/training',
)
const open = computed(
  () => practiceRoute.value && layout.keyboardVisible && layout.dockContent !== null,
)

watch(
  practiceRoute,
  (available) => {
    layout.setKeyboardAvailable(available)
    if (!available) layout.setDockContent(null)
  },
  { immediate: true },
)
</script>

<template>
  <div class="bottom-dock-host">
    <DockReveal :open="open">
      <KeyboardDock v-if="layout.dockContent" v-bind="layout.dockContent" />
    </DockReveal>
  </div>
</template>

<style scoped>
.bottom-dock-host {
  flex: none;
  width: 100%;
  min-height: 0;
}
</style>
