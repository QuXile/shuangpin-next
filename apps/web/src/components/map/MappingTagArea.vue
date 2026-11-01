<script setup lang="ts">
/** 映射标签区：继续学习与学习路线共用的溢出 / 截断 / 浮层逻辑。 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { FocusAtomView } from '@/lib/lessonView'
import FocusTagList from '@/components/FocusTagList.vue'

const props = defineProps<{ items: readonly FocusAtomView[] }>()

const areaRef = ref<HTMLElement | null>(null)
const scrollRef = ref<HTMLElement | null>(null)
const overflowing = ref(false)
const popupDown = ref(false)
let resizeObserver: ResizeObserver | undefined

function measure(): void {
  const el = scrollRef.value
  if (!el) {
    overflowing.value = false
    return
  }
  overflowing.value = el.scrollHeight > el.clientHeight + 1
}

function observe(): void {
  resizeObserver?.disconnect()
  if (!scrollRef.value) return
  resizeObserver = new ResizeObserver(measure)
  resizeObserver.observe(scrollRef.value)
  measure()
}

function updatePopupPlacement(): void {
  const rect = areaRef.value?.getBoundingClientRect()
  if (!rect) return
  const spaceAbove = rect.top
  const spaceBelow = window.innerHeight - rect.bottom
  popupDown.value = spaceBelow > spaceAbove
}

watch(
  () => props.items,
  () => { void nextTick(observe) },
  { immediate: true, deep: true, flush: 'post' },
)
onMounted(() => { void nextTick(observe) })
onBeforeUnmount(() => { resizeObserver?.disconnect() })
</script>

<template>
  <div
    ref="areaRef"
    class="mapping-tag-area"
    @mouseenter="updatePopupPlacement"
    @focusin="updatePopupPlacement"
  >
    <div ref="scrollRef" class="mapping-tag-scroll" :class="{ 'has-overflow': overflowing }">
      <FocusTagList :items="items" />
    </div>
    <span v-if="overflowing" class="mapping-more">… 共 {{ items.length }} 个映射</span>
    <div v-if="overflowing" class="mapping-popup" :class="{ 'is-down': popupDown }">
      <FocusTagList :items="items" />
    </div>
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
  font-size: 10.5px;
  font-weight: 750;
  line-height: 1.4;
  pointer-events: none;
}
.mapping-popup {
  position: absolute;
  bottom: calc(100% + 8px);
  left: -10px;
  right: -10px;
  display: none;
  z-index: 50;
  max-height: 260px;
  overflow-y: auto;
  scrollbar-gutter: stable;
  padding: 14px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  box-shadow: var(--pop-shadow);
  pointer-events: auto;
  animation: ui-pop-in 160ms var(--ease);
}
.mapping-popup.is-down {
  top: calc(100% + 8px);
  bottom: auto;
}
.mapping-tag-area:hover .mapping-popup,
.mapping-tag-area:focus-within .mapping-popup {
  display: block;
}
</style>
