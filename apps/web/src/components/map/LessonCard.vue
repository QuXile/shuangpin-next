<script setup lang="ts">
import { computed } from 'vue'
import MappingTagArea from './MappingTagArea.vue'
import StarRating from '@/components/common/StarRating.vue'
import { lessonKindLabel, type LessonView } from '@/lib/lessonView'

const props = withDefaults(defineProps<{ lesson: LessonView; current?: boolean }>(), {
  current: false,
})
const emit = defineEmits<{ start: [lessonId: string] }>()

const statusClass = computed(() => {
  if (props.lesson.state === 'passed') return 'is-done'
  if (props.current) return 'is-active'
  if (props.lesson.state === 'locked') return 'is-locked'
  return 'is-pending'
})
</script>

<template>
  <button
    type="button"
    class="lesson-card"
    :class="statusClass"
    :disabled="lesson.state === 'locked'"
    :title="lesson.state === 'locked' ? '完成前一课后解锁' : '开始练习 Enter'"
    @click="emit('start', lesson.id)"
  >
    <span class="card-top">
      <span class="card-meta">
        <span class="card-type">
          第 {{ lesson.order + 1 }} 课 · {{ lessonKindLabel(lesson.kind) }}
          <span>{{ lesson.id }}</span>
        </span>
        <span class="card-title">{{ lesson.title }}</span>
      </span>
      <StarRating :stars="lesson.stars" />
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
      <MappingTagArea :items="lesson.focusKeys" />
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
  --mapping-more-bg: var(--surface);
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  height: 160px;
  min-width: 0;
  padding: 16px 18px;
  text-align: left;
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: var(--r-card);
  background: var(--surface);
  transition: border-color var(--dur-mid) var(--ease), box-shadow var(--dur-mid) var(--ease),
    transform var(--dur-mid) var(--ease), background var(--dur-mid) var(--ease);
}
.lesson-card:hover:not(:disabled) {
  z-index: 10;
  border-color: color-mix(in srgb, var(--brand) 42%, var(--line));
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}
.lesson-card:active:not(:disabled) {
  transform: translateY(-1px) scale(0.995);
}
.lesson-card.is-done {
  --mapping-more-bg: var(--success-soft);
  background: var(--success-soft);
  border-color: var(--success-line);
}
.lesson-card.is-done:hover:not(:disabled) {
  border-color: var(--success-line-hover);
}
.lesson-card.is-active {
  border-color: var(--brand);
  box-shadow: var(--ring-brand);
}
.lesson-card.is-locked {
  --mapping-more-bg: var(--surface-2);
  cursor: not-allowed;
  background: var(--surface-2);
}
.lesson-card.is-locked .card-top,
.lesson-card.is-locked .card-icon,
.lesson-card.is-locked .mapping-tag-area {
  opacity: 0.58;
}
.card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.card-title {
  overflow: hidden;
  color: var(--ink);
  font-size: var(--text-md);
  font-weight: 850;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card-main {
  display: flex;
  flex: 1;
  align-items: stretch;
  gap: 12px;
  min-height: 0;
  margin-top: 2px;
}
.card-main.is-empty {
  min-height: 0;
}
.card-icon {
  flex: none;
  align-self: flex-start;
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
@media (max-width: 640px) {
  .lesson-card {
    padding: 14px;
  }
  .card-top {
    gap: 8px;
  }
  .card-title {
    font-size: var(--text-base);
  }
}
</style>
