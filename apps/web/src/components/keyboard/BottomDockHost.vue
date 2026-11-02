<script setup lang="ts">
/**
 * App 级底部键位图宿主：显隐、高度测量、动画与键位图外框都在这里。
 * 页面只通过 useBottomDockContent 注册内容；会话/阶段切换不会重播底栏动画。
 */
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import DockReveal from './DockReveal.vue'
import KeyboardMap from './KeyboardMap.vue'
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
      <div v-if="layout.dockContent" class="keymap-dock" role="group" aria-label="键位图区">
        <KeyboardMap v-bind="layout.dockContent" />
      </div>
    </DockReveal>
  </div>
</template>

<style scoped>
.bottom-dock-host {
  flex: none;
  width: 100%;
  min-height: 0;
}
.keymap-dock {
  flex: none;
  width: 100%;
  padding: 12px var(--page-pad-x) 14px;
  border-top: 1px solid var(--line);
  background: color-mix(in srgb, var(--bg) 96%, var(--surface));
}
.keymap-dock :deep(.keyboard-map) {
  max-width: var(--content-session);
  margin: 0 auto;
  box-shadow: var(--shadow-sm);
}
@media (max-width: 640px) {
  .keymap-dock {
    padding: 8px var(--page-pad-x) calc(10px + env(safe-area-inset-bottom));
  }
  .keymap-dock :deep(.kbd-legend) {
    display: none;
  }
}
</style>
