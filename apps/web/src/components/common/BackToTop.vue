<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useGlobalKeys } from '@/composables/useGlobalKeys'

const visible = ref(false)
const THRESHOLD = 320

function onScroll(): void {
  visible.value = window.scrollY > THRESHOLD
}

function scrollToTop(): void {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })
}

useGlobalKeys(() => [
  {
    key: 'Home',
    when: () => visible.value,
    run: () => scrollToTop(),
  },
])

onMounted(() => {
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
})
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))
</script>

<template>
  <Transition name="back-top">
    <button
      v-if="visible"
      class="back-top"
      type="button"
      title="回到顶部（Home）"
      aria-label="回到顶部（Home）"
      aria-keyshortcuts="Home"
      @click="scrollToTop"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 19V5" />
        <path d="m6 11 6-6 6 6" />
      </svg>
      <kbd>Home</kbd>
    </button>
  </Transition>
</template>

<style scoped>
.back-top {
  position: fixed;
  right: max(20px, env(safe-area-inset-right));
  bottom: max(20px, env(safe-area-inset-bottom));
  z-index: 30;
  min-width: 78px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 12px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-control);
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  box-shadow: var(--shadow-sm);
  backdrop-filter: blur(8px);
  transition:
    background var(--dur-fast),
    border-color var(--dur-fast),
    color var(--dur-fast),
    transform var(--dur-fast),
    box-shadow var(--dur-fast);
}
.back-top svg {
  width: 15px;
  height: 15px;
}
.back-top kbd {
  padding: 1px 5px;
  font-size: 9px;
  line-height: 1.35;
}
.back-top:hover {
  color: var(--brand);
  border-color: var(--brand-line);
  background: var(--surface);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}
.back-top:active {
  transform: translateY(0) scale(0.94);
}
.back-top-enter-active,
.back-top-leave-active {
  transition: opacity 180ms var(--ease), transform 180ms var(--ease);
}
.back-top-enter-from,
.back-top-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.9);
}
@media (max-width: 640px) {
  .back-top {
    right: max(14px, env(safe-area-inset-right));
    bottom: max(14px, env(safe-area-inset-bottom));
    height: 34px;
    padding: 0 10px;
    font-size: 11px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .back-top,
  .back-top-enter-active,
  .back-top-leave-active {
    transition-duration: 1e-5s;
  }
}
</style>
