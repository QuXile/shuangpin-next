<script setup lang="ts">
import { computed, ref } from 'vue'
import FocusTagList from '@/components/FocusTagList.vue'
import { lessonKindLabel, type LessonView } from '@/lib/lessonView'

const props = withDefaults(defineProps<{ lesson: LessonView; current?: boolean }>(), {
  current: false,
})
const emit = defineEmits<{ start: [lessonId: string] }>()

const cardRef = ref<HTMLButtonElement | null>(null)
const popupDown = ref(false)

/** 映射浮层优先放在空间更大的一侧，避免靠近视口顶部/底部时被裁切。 */
function updatePopupPlacement(): void {
  const rect = cardRef.value?.getBoundingClientRect()
  if (!rect) return
  const spaceAbove = rect.top
  const spaceBelow = window.innerHeight - rect.bottom
  popupDown.value = spaceBelow > spaceAbove
}

const statusClass = computed(() => {
  if (props.lesson.state === 'passed') return 'is-done'
  if (props.current) return 'is-active'
  if (props.lesson.state === 'locked') return 'is-locked'
  return 'is-pending'
})
const manyTags = computed(() => props.lesson.focusKeys.length > 8)
const tagCount = computed(() => props.lesson.focusKeys.length)
</script>

<template>
  <button
    ref="cardRef"
    type="button"
    class="lesson-card"
    :class="statusClass"
    :disabled="lesson.state === 'locked'"
    :title="lesson.state === 'locked' ? '完成前一课后解锁' : '开始练习（Enter）'"
    @click="emit('start', lesson.id)"
    @mouseenter="updatePopupPlacement"
    @focusin="updatePopupPlacement"
  >
    <span class="card-top">
      <span class="card-meta">
        <span class="card-type">
          第 {{ lesson.order + 1 }} 课 · {{ lessonKindLabel(lesson.kind) }}
          <span>{{ lesson.id }}</span>
        </span>
        <span class="card-title">{{ lesson.title }}</span>
      </span>
      <span class="stars" :aria-label="`${lesson.stars} 星`">
        <span v-for="n in 3" :key="n" :class="{ on: n <= lesson.stars }">★</span>
      </span>
    </span>

    <span v-if="lesson.focusKeys.length" class="card-main">
      <span class="card-icon" aria-hidden="true">
        <svg v-if="lesson.state === 'passed'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <svg v-else-if="lesson.state === 'locked'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
      </span>
      <span class="tags-wrap">
        <span class="tags-area" :class="{ 'has-many': manyTags }">
          <FocusTagList :items="lesson.focusKeys" />
        </span>
        <span v-if="manyTags" class="more-hint">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
          共 {{ tagCount }} 个映射
        </span>
        <span v-if="manyTags" class="mapping-popup" :class="{ 'is-down': popupDown }">
          <FocusTagList :items="lesson.focusKeys" />
        </span>
      </span>
    </span>

    <span v-else class="card-main is-empty">
      <span class="card-icon" aria-hidden="true">
        <svg v-if="lesson.state === 'passed'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
      </span>
    </span>
  </button>
</template>

<style scoped>
.lesson-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  min-width: 0;
  padding: 16px 18px;
  text-align: left;
  color: var(--ink);
  border: 1.5px solid var(--line);
  border-radius: var(--r-card);
  background: var(--surface);
  transition: border-color var(--dur-mid) var(--ease), box-shadow var(--dur-mid) var(--ease),
    transform var(--dur-mid) var(--ease), background var(--dur-mid) var(--ease);
}
.lesson-card:hover:not(:disabled) {
  z-index: 10;
  border-color: color-mix(in srgb, var(--brand) 42%, var(--line));
  box-shadow: var(--hover-shadow);
  transform: translateY(-2px);
}
.lesson-card:active:not(:disabled) {
  transform: translateY(-1px) scale(0.995);
}
.lesson-card.is-done {
  background: var(--success-soft);
  border-color: var(--state-success-line);
}
.lesson-card.is-done:hover:not(:disabled) {
  border-color: var(--state-success-line-hover);
}
.lesson-card.is-active {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-soft);
}
.lesson-card.is-locked {
  cursor: not-allowed;
  background: var(--surface-2);
}
.lesson-card.is-locked .card-top,
.lesson-card.is-locked .card-icon,
.lesson-card.is-locked .tags-area,
.lesson-card.is-locked .more-hint {
  opacity: 0.58;
}
.card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.card-meta {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}
.card-type {
  color: var(--ink-3);
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0.02em;
}
.card-type span {
  margin-left: 4px;
  color: var(--ink-4);
  font-family: var(--font-mono);
}
.card-title {
  overflow: hidden;
  color: var(--ink);
  font-size: 15px;
  font-weight: 850;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stars {
  flex: none;
  display: flex;
  gap: 2px;
  color: var(--surface-3);
  font-size: 14px;
  line-height: 1;
}
.stars .on {
  color: var(--star-bright);
}
.card-main {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-height: 30px;
  margin-top: 2px;
}
.card-main.is-empty {
  min-height: 0;
}
.card-icon {
  flex: none;
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
  background: var(--surface);
  color: var(--ink-3);
}
.card-icon svg {
  width: 14px;
  height: 14px;
}
.is-done .card-icon {
  color: var(--success);
  border-color: var(--success);
}
.is-active .card-icon {
  color: var(--brand);
  border-color: transparent;
  background: var(--brand-soft);
}
.tags-wrap {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tags-area {
  display: block;
  min-width: 0;
  max-height: 84px;
  overflow: hidden;
}
.tags-area.has-many {
  mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
}
.more-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--brand);
  font-size: 11px;
  font-weight: 750;
}
.more-hint svg {
  width: 12px;
  height: 12px;
}
.mapping-popup {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  right: 0;
  display: none;
  z-index: 50;
  padding: 14px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  box-shadow: var(--pop-shadow);
  pointer-events: none;
  animation: ui-pop-in 160ms var(--ease);
}
/* 靠近视口顶部时向下展开；靠近底部时保持向上 */
.mapping-popup.is-down {
  top: calc(100% + 8px);
  bottom: auto;
}
.lesson-card:hover .mapping-popup,
.lesson-card:focus-visible .mapping-popup {
  display: block;
}
@media (max-width: 640px) {
  .lesson-card {
    padding: 14px;
  }
  .card-top {
    gap: 8px;
  }
  .card-title {
    font-size: 14px;
  }
  .tags-area {
    max-height: 74px;
  }
}
</style>
