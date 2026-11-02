<script setup lang="ts">
/**
 * 底部键位图的展开/收起容器：测量内容高度做 height 过渡，
 * 收起后 inert + aria-hidden，避免隐藏键位进入 Tab 顺序。
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{ open: boolean }>()

/** 内容自然高度 */
const contentHeight = ref(0)
const inner = ref<HTMLElement | null>(null)
let observer: ResizeObserver | undefined

function measure(): void {
  const height = inner.value?.scrollHeight ?? 0
  if (height !== contentHeight.value) contentHeight.value = height
}

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    await nextTick()
    measure()
  },
)

onMounted(() => {
  measure()
  if (inner.value && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(measure)
    observer.observe(inner.value)
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = undefined
})
</script>

<template>
  <div
    class="dock-reveal"
    :class="{ 'is-open': open }"
    :style="{ height: open ? `${contentHeight}px` : '0px' }"
    :aria-hidden="open ? undefined : 'true'"
    :inert="open ? undefined : true"
  >
    <div ref="inner" class="dock-reveal-inner">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.dock-reveal {
  flex: none;
  overflow: hidden;
  opacity: 0;
  transition:
    height var(--dur-mid) var(--ease),
    opacity var(--dur-mid) var(--ease);
}
.dock-reveal.is-open {
  opacity: 1;
}
.dock-reveal-inner {
  min-height: 0;
}
</style>
