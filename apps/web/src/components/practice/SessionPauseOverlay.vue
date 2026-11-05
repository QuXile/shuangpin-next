<script setup lang="ts">
/**
 * 暂停遮罩：暂停时由遮罩独占视觉层，题目区保持挂载在原位。
 * 这样暂停 / 继续都不需要重新挂载题目、保存或恢复滚动位置。
 */
withDefaults(defineProps<{ show?: boolean }>(), { show: false })
</script>

<template>
  <Transition name="session-pause">
    <div v-if="show" class="session-pause-overlay" role="status" aria-label="练习暂停">
      <div class="session-pause-card">
        <slot />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.session-pause-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  padding: 16px 0 8px;
  background: var(--bg);
}
.session-pause-card {
  width: 100%;
  max-width: var(--content-session);
}
.session-pause-enter-active,
.session-pause-leave-active {
  transition: opacity var(--dur-mid) var(--ease);
}
.session-pause-enter-from,
.session-pause-leave-to {
  opacity: 0;
}
.session-pause-enter-active .session-pause-card,
.session-pause-leave-active .session-pause-card {
  transition: opacity var(--dur-mid) var(--ease), transform var(--dur-mid) var(--ease);
}
.session-pause-enter-from .session-pause-card,
.session-pause-leave-to .session-pause-card {
  opacity: 0;
  transform: translateY(12px) scale(0.985);
}
</style>
