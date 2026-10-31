<script setup lang="ts">
/**
 * 底部键位图的展开/收起容器。
 * 通过测量内容高度来做 height 过渡，保证桌面/移动端收起时页面真实回填；
 * 收起后 inert + aria-hidden，避免隐藏键位仍进入 Tab 顺序。
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{ open: boolean }>()

const inner = ref<HTMLElement | null>(null)
const contentHeight = ref(0)
let observer: ResizeObserver | undefined

function measure(): void {
  contentHeight.value = inner.value?.scrollHeight ?? 0
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
onBeforeUnmount(() => observer?.disconnect())
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
    height 260ms var(--ease),
    opacity 180ms var(--ease);
}
.dock-reveal.is-open {
  opacity: 1;
}
.dock-reveal-inner {
  min-height: 0;
}
@media (prefers-reduced-motion: reduce) {
  .dock-reveal {
    transition-duration: 1e-5s;
  }
}
</style>
