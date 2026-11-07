<script setup lang="ts">
/**
 * 键位图底部的统一映射行：零声母与兼容编码共用同一套显示逻辑。
 * 标签、内容、溢出计数、hover/focus 浮层和滚动行为都由这里统一决定。
 *
 * 浮层统一走 useHoverPopover：Teleport 到 body + position: fixed，
 * 不再被底栏 DockReveal 的 overflow:hidden 裁剪；悬停/焦点状态由 JS 管理，
 * 离开触发区后有一段宽限期可以移入浮层。
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch, type ComponentPublicInstance } from 'vue'
import { useResizeObserver } from '@/composables/useResizeObserver'
import { useHoverPopover } from '@/composables/useHoverPopover'
import type { MappingItemView, MappingTogglePayload } from '@/lib/keyboardView'

const props = withDefaults(
  defineProps<{
    label: string
    items: readonly MappingItemView[]
    /** 练习场配置页：映射可点击切换 */
    interactive?: boolean
    onToggle?: (payload: MappingTogglePayload) => void
  }>(),
  { interactive: false, onToggle: undefined },
)

function toggle(item: MappingItemView, event: Event): void {
  if (!props.interactive || !props.onToggle || !item.toggle) return
  event.stopPropagation()
  props.onToggle(item.toggle)
}

const contentRef = ref<HTMLElement | null>(null)
const overflow = ref(false)

/** 与原有视觉一致：浮层与触发区无间距、宽度同整条映射行、向上优先、最大高度 240 */
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
} = useHoverPopover({ maxHeight: 240, gap: 0, enabled: () => overflow.value })

/** 模板 ref 的稳定 setter：显式写回 composable 的 ref（模板字符串 ref 不会被静态检查识别为读取）。 */
function setTriggerEl(el: Element | ComponentPublicInstance | null): void {
  triggerRef.value = el instanceof HTMLElement ? el : null
}
function setPopupEl(el: Element | ComponentPublicInstance | null): void {
  popupRef.value = el instanceof HTMLElement ? el : null
}

function measure(): void {
  const el = contentRef.value
  overflow.value = Boolean(el && el.scrollWidth > el.clientWidth + 1)
}

useResizeObserver(contentRef, () => measure())

watch(
  () => props.items,
  () => { void nextTick(measure) },
  { immediate: true, deep: true, flush: 'post' },
)
/** 内容收缩到不再溢出时立即收起浮层，避免留下看不见的全局监听。 */
watch(overflow, (value) => {
  if (!value) closePopover()
})
onMounted(() => {
  measure()
  window.addEventListener('resize', measure)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', measure)
})
</script>

<template>
  <div
    :ref="setTriggerEl"
    class="mapping-strip"
    :tabindex="overflow ? 0 : undefined"
    role="group"
    :aria-label="label"
    @pointerenter="onTriggerPointerEnter"
    @pointerleave="onTriggerPointerLeave"
    @focusin="onTriggerFocusIn"
    @focusout="onTriggerFocusOut"
  >
    <span class="mapping-title">{{ label }}</span>
    <span ref="contentRef" class="mapping-content">
      <span class="mapping-track">
        <span
          v-for="item in items"
          :key="item.label"
          class="mapping-chip"
          :class="{ 'is-emphasized': item.emphasized, 'is-tappable': interactive }"
          :title="item.title"
          :role="interactive ? 'button' : undefined"
          :tabindex="interactive ? 0 : undefined"
          :aria-pressed="interactive ? Boolean(item.emphasized) : undefined"
          @click="toggle(item, $event)"
          @keydown.enter.stop.prevent="toggle(item, $event)"
          @keydown.space.stop.prevent="toggle(item, $event)"
        >
          <b>{{ item.label }}</b>
          <span class="mapping-keys">
            <template v-for="(code, codeIndex) in item.codes" :key="codeIndex"><span v-if="codeIndex > 0" class="mapping-sep">/</span><kbd class="mapping-key" :class="{ 'is-emphasized': item.emphasized }">{{ code.join('') }}</kbd></template>
          </span>
        </span>
      </span>
    </span>
    <span v-if="overflow" class="mapping-count">共 {{ items.length }} 个</span>
    <!-- 浮层 Teleport 到 body：内容与原实现一致（aria-hidden 的重复映射），仅用于指针悬停浏览 -->
    <Teleport to="body">
      <span
        v-if="overflow && popoverOpen"
        :ref="setPopupEl"
        class="mapping-popup"
        aria-hidden="true"
        :style="popupStyle"
        @pointerenter="onPopupPointerEnter"
        @pointerleave="onPopupPointerLeave"
        @focusin="onPopupFocusIn"
        @focusout="onPopupFocusOut"
      >
        <span
          v-for="item in items"
          :key="item.label"
          class="mapping-chip"
          :class="{ 'is-emphasized': item.emphasized, 'is-tappable': interactive }"
          :role="interactive ? 'button' : undefined"
          :tabindex="interactive ? 0 : undefined"
          :aria-pressed="interactive ? Boolean(item.emphasized) : undefined"
          @click="toggle(item, $event)"
          @keydown.enter.stop.prevent="toggle(item, $event)"
          @keydown.space.stop.prevent="toggle(item, $event)"
        >
          <b>{{ item.label }}</b>
          <span class="mapping-keys">
            <template v-for="(code, codeIndex) in item.codes" :key="codeIndex"><span v-if="codeIndex > 0" class="mapping-sep">/</span><kbd class="mapping-key" :class="{ 'is-emphasized': item.emphasized }">{{ code.join('') }}</kbd></template>
          </span>
        </span>
      </span>
    </Teleport>
  </div>
</template>

<style scoped>
.mapping-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  padding: 2px;
  min-width: 0;
  border-radius: var(--r-xs);
}
.mapping-strip:focus-visible {
  outline: 2px solid var(--brand-line);
  outline-offset: 2px;
}
.mapping-title {
  flex: none;
  color: var(--ink-4);
  font-size: var(--text-2xs);
  font-weight: 800;
  letter-spacing: 0.04em;
  white-space: nowrap;
}
.mapping-content {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--ink-3);
  font-size: var(--text-2xs);
  line-height: 1.5;
}
.mapping-track {
  display: flex;
  align-items: center;
  justify-content: safe center;
  gap: 6px;
  width: max-content;
  min-width: 100%;
  white-space: nowrap;
}
.mapping-chip {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 5px;
  border-radius: var(--r-xs);
  background: var(--surface);
  color: var(--ink-3);
  font-size: var(--text-2xs);
  line-height: 1.4;
}
.mapping-chip.is-tappable {
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease),
    filter var(--dur-fast) var(--ease);
}
/* 普通 chip：hover 提亮底色；已强调 chip 只做明暗反馈，避免把强调色盖成灰色 */
.mapping-chip.is-tappable:not(.is-emphasized):hover {
  background: var(--surface-3);
}
.mapping-chip.is-tappable.is-emphasized:hover {
  filter: brightness(1.08);
}
.mapping-chip.is-tappable:active {
  filter: brightness(0.9);
}
.mapping-chip.is-tappable:focus-visible {
  outline: 2px solid var(--mapping-focus-line);
  outline-offset: 1px;
}
.mapping-chip b {
  color: var(--ink-2);
  font-weight: 700;
}
.mapping-chip.is-emphasized {
  background: var(--mapping-focus-soft);
  color: var(--mapping-focus-ink);
  box-shadow: inset 0 0 0 1px var(--mapping-focus-line);
}
.mapping-keys {
  display: inline-flex;
  gap: 2px;
}
.mapping-key {
  display: inline-grid;
  place-items: center;
  min-width: 16px;
  height: 16px;
  padding: 0 3px;
  border: 1px solid var(--line);
  border-bottom-width: 2px;
  border-radius: var(--r-keycap-xs);
  background: var(--surface-3);
  color: var(--ink-2);
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  font-weight: 650;
  line-height: 1;
  white-space: nowrap;
}
.mapping-key.is-emphasized {
  border-color: var(--mapping-focus);
  background: var(--mapping-focus);
  color: var(--on-accent);
}
.mapping-sep {
  margin: 0 1px;
  color: var(--ink-4);
  font-size: var(--text-2xs);
}
.mapping-count {
  flex: none;
  color: var(--ink-4);
  font-size: var(--text-2xs);
  white-space: nowrap;
}
/* Teleport 到 body 的 fixed 浮层：层级约定与旧实现一致（z-index 50，低于 modal 100） */
.mapping-popup {
  position: fixed;
  z-index: 50;
  display: flex;
  flex-wrap: wrap;
  gap: 5px 12px;
  align-content: flex-start;
  overflow-y: auto;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  padding: 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-card);
  box-shadow: var(--shadow-pop);
  pointer-events: auto;
  overscroll-behavior: contain;
  animation: ui-fade-in var(--dur-fast) var(--ease);
}
</style>
