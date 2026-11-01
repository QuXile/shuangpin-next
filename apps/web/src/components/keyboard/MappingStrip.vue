<script setup lang="ts">
/**
 * 键位图底部的统一映射行：零声母与兼容编码共用同一套显示逻辑。
 * 标签、内容、溢出计数、hover/focus 浮层和滚动行为都由这里统一决定。
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

interface MappingItem {
  label: string
  /** 每个编码拆成单字符，统一渲染成按键小格 */
  codes: string[][]
  title: string
  emphasized?: boolean
}

const props = defineProps<{
  label: string
  items: readonly MappingItem[]
}>()

const contentRef = ref<HTMLElement | null>(null)
const overflow = ref(false)
let observer: ResizeObserver | undefined

function measure(): void {
  const el = contentRef.value
  overflow.value = Boolean(el && el.scrollWidth > el.clientWidth + 1)
}

function observe(): void {
  observer?.disconnect()
  if (!contentRef.value) return
  observer = new ResizeObserver(measure)
  observer.observe(contentRef.value)
  measure()
}

watch(
  () => props.items,
  () => { void nextTick(observe) },
  { immediate: true, deep: true, flush: 'post' },
)
onMounted(() => {
  observe()
  window.addEventListener('resize', measure)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', measure)
})
</script>

<template>
  <div
    class="mapping-strip"
    :tabindex="overflow ? 0 : undefined"
    :aria-label="label"
  >
    <span class="mapping-title">{{ label }}</span>
    <span ref="contentRef" class="mapping-content">
      <span class="mapping-track">
        <span
          v-for="item in items"
          :key="item.label"
          class="mapping-chip"
          :class="{ 'is-emphasized': item.emphasized }"
          :title="item.title"
        >
          <b>{{ item.label }}</b>
          <span class="mapping-keys">
            <kbd
              v-for="(code, codeIndex) in item.codes"
              :key="codeIndex"
              class="mapping-code"
            >
              <span v-for="(key, keyIndex) in code" :key="keyIndex">{{ key }}</span>
            </kbd>
          </span>
        </span>
      </span>
    </span>
    <span v-if="overflow" class="mapping-count">共 {{ items.length }} 个</span>
    <span v-if="overflow" class="mapping-popup" aria-hidden="true">
      <span
        v-for="item in items"
        :key="item.label"
        class="mapping-chip"
        :class="{ 'is-emphasized': item.emphasized }"
      >
        <b>{{ item.label }}</b>
        <span class="mapping-keys">
          <kbd v-for="(code, codeIndex) in item.codes" :key="codeIndex" class="mapping-code">
            <span v-for="(key, keyIndex) in code" :key="keyIndex">{{ key }}</span>
          </kbd>
        </span>
      </span>
    </span>
  </div>
</template>

<style scoped>
.mapping-strip {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 3px 2px;
  min-width: 0;
  border-radius: 5px;
}
.mapping-strip:focus-visible {
  outline: 2px solid var(--brand-line);
  outline-offset: 2px;
}
.mapping-title {
  flex: none;
  color: var(--ink-4);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.04em;
  white-space: nowrap;
}
.mapping-content {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--ink-3);
  font-size: 10px;
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
  border-radius: 5px;
  background: var(--surface);
  color: var(--ink-3);
  font-size: 10px;
  line-height: 1.4;
}
.mapping-chip b {
  color: var(--ink-2);
  font-weight: 700;
}
.mapping-chip.is-emphasized {
  background: var(--state-info-bg, var(--brand-soft));
  color: var(--brand-ink);
  box-shadow: inset 0 0 0 1px var(--brand-line);
}
.mapping-keys {
  display: inline-flex;
  gap: 2px;
}
.mapping-code {
  display: inline-flex;
  gap: 1px;
  padding: 0 3px;
  border: 0;
  border-radius: 3px;
  background: var(--surface-3);
  color: var(--ink-2);
  font-family: var(--font-mono);
  font-size: 8px;
  line-height: 1.4;
  white-space: nowrap;
}
.mapping-code + .mapping-code {
  margin-left: 2px;
}
.mapping-count {
  flex: none;
  color: var(--ink-4);
  font-size: 10px;
  white-space: nowrap;
}
.mapping-popup {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  display: none;
  z-index: 50;
  padding: 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  box-shadow: var(--pop-shadow);
  pointer-events: auto;
  overscroll-behavior: contain;
}
.mapping-strip:hover .mapping-popup,
.mapping-strip:focus-within .mapping-popup {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 12px;
  align-content: flex-start;
  max-height: 240px;
  overflow-y: auto;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
}
</style>
