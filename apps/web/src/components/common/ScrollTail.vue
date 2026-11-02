<script setup lang="ts">
/**
 * 滚动区域「还有内容」提示：未滚到底时显示，到底后隐藏。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  /** 需要监听的滚动容器（通常是 overflow-y:auto 的元素） */
  scroller?: HTMLElement | null
  label?: string
}>()

/** 底部内边距容差 */
const BOTTOM_TOLERANCE = 28

const visible = ref(false)
let observer: ResizeObserver | undefined
let mutation: MutationObserver | undefined

function update(): void {
  const el = props.scroller
  if (!el) {
    visible.value = false
    return
  }
  visible.value = el.scrollHeight - el.scrollTop - el.clientHeight > BOTTOM_TOLERANCE
}

function bind(el: HTMLElement | null | undefined): void {
  unbind()
  if (!el) {
    visible.value = false
    return
  }
  el.addEventListener('scroll', update, { passive: true })
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(update)
    observer.observe(el)
  }
  if (typeof MutationObserver !== 'undefined') {
    mutation = new MutationObserver(update)
    mutation.observe(el, { childList: true, subtree: true, characterData: true })
  }
  update()
}

function unbind(): void {
  props.scroller?.removeEventListener('scroll', update)
  observer?.disconnect()
  observer = undefined
  mutation?.disconnect()
  mutation = undefined
}

watch(() => props.scroller, (el) => bind(el))
onMounted(() => bind(props.scroller))
onBeforeUnmount(unbind)
</script>

<template>
  <span v-if="visible" class="scroll-tail" aria-hidden="true">
    <span class="scroll-tail-dots">…</span>
    <span>{{ label ?? '还有内容' }}</span>
  </span>
</template>

<style scoped>
/* 底部渐隐 + 小字提示；容器底色用 --scroll-tail-bg 覆盖 */
.scroll-tail {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 2;
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  height: 30px;
  padding: 0 0 1px var(--scroll-tail-inset, 8px);
  background: linear-gradient(
    to bottom,
    transparent,
    var(--scroll-tail-bg, var(--surface)) 62%
  );
  color: var(--ink-3);
  font-size: var(--text-2xs);
  line-height: 1.4;
  pointer-events: none;
  animation: ui-fade-in var(--dur-fast) var(--ease);
}
.scroll-tail-dots {
  margin-right: 2px;
  color: var(--ink-4);
  letter-spacing: 1px;
}
</style>
