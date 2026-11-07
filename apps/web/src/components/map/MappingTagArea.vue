<script setup lang="ts">
/**
 * 映射标签区：继续学习与学习路线共用的溢出 / 截断 / 浮层逻辑。
 *
 * 浮层统一走 useHoverPopover：Teleport 到 body + position: fixed，脱离卡片的
 * stacking context（卡片 hover transform）与滚动容器裁剪；悬停/焦点状态由 JS 管理，
 * 鼠标离开触发区后有一段宽限期可以移入浮层。
 */
import { nextTick, onMounted, ref, watch, type ComponentPublicInstance } from 'vue'
import { useResizeObserver } from '@/composables/useResizeObserver'
import { useHoverPopover } from '@/composables/useHoverPopover'
import type { FocusAtomView } from '@/lib/lessonView'
import FocusTagList from '@/components/FocusTagList.vue'

const props = defineProps<{ items: readonly FocusAtomView[] }>()

const scrollRef = ref<HTMLElement | null>(null)
const overflowing = ref(false)

/** 与原有视觉一致：浮层左右各外扩 10px、向上优先、最大高度 260 */
const {
  triggerRef,
  popupRef,
  open: popoverOpen,
  popupStyle,
  onTriggerPointerEnter,
  onTriggerPointerLeave,
  onTriggerFocusIn,
  onTriggerFocusOut,
  onPopupPointerEnter,
  onPopupPointerLeave,
  onPopupFocusIn,
  onPopupFocusOut,
  close: closePopover,
} = useHoverPopover({
  maxHeight: 260,
  horizontalOverflow: 20,
  enabled: () => overflowing.value,
})

/** 模板 ref 的稳定 setter：显式写回 composable 的 ref（模板字符串 ref 不会被静态检查识别为读取）。 */
function setTriggerEl(el: Element | ComponentPublicInstance | null): void {
  triggerRef.value = el instanceof HTMLElement ? el : null
}
function setPopupEl(el: Element | ComponentPublicInstance | null): void {
  popupRef.value = el instanceof HTMLElement ? el : null
}

function measure(): void {
  const el = scrollRef.value
  if (!el) {
    overflowing.value = false
    return
  }
  overflowing.value = el.scrollHeight > el.clientHeight + 1
}

useResizeObserver(scrollRef, () => measure())

watch(
  () => props.items,
  () => { void nextTick(measure) },
  { immediate: true, deep: true, flush: 'post' },
)
onMounted(() => { void nextTick(measure) })
/** 内容收缩到不再溢出时立即收起浮层，避免留下看不见的全局监听。 */
watch(overflowing, (value) => {
  if (!value) closePopover()
})
</script>

<template>
  <div
    :ref="setTriggerEl"
    class="mapping-tag-area"
    role="group"
    :tabindex="overflowing ? 0 : undefined"
    :aria-label="`${items.length} 个映射`"
    @pointerenter="onTriggerPointerEnter"
    @pointerleave="onTriggerPointerLeave"
    @focusin="onTriggerFocusIn"
    @focusout="onTriggerFocusOut"
  >
    <div ref="scrollRef" class="mapping-tag-scroll" :class="{ 'has-overflow': overflowing }">
      <FocusTagList :items="items" />
    </div>
    <span v-if="overflowing" class="mapping-more">… 共 {{ items.length }} 个映射</span>
    <Teleport to="body">
      <div
        v-if="overflowing && popoverOpen"
        :ref="setPopupEl"
        class="mapping-popup"
        :style="popupStyle"
        @pointerenter="onPopupPointerEnter"
        @pointerleave="onPopupPointerLeave"
        @focusin="onPopupFocusIn"
        @focusout="onPopupFocusOut"
      >
        <FocusTagList :items="items" />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.mapping-tag-area {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.mapping-tag-scroll {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.mapping-tag-scroll.has-overflow {
  mask-image: linear-gradient(to bottom, black 58%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, black 58%, transparent 100%);
}
.mapping-more {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  padding-top: 12px;
  color: var(--brand);
  background: linear-gradient(transparent, var(--mapping-more-bg, var(--surface)) 58%);
  font-size: var(--text-2xs);
  font-weight: 750;
  line-height: 1.4;
  pointer-events: none;
}
/* Teleport 到 body 的 fixed 浮层：层级约定与旧实现一致（z-index 50，低于 modal 100） */
.mapping-popup {
  position: fixed;
  z-index: 50;
  overflow-y: auto;
  scrollbar-gutter: stable;
  padding: 14px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-card);
  box-shadow: var(--shadow-pop);
  pointer-events: auto;
  animation: ui-pop-in var(--dur-mid) var(--ease);
}
</style>
