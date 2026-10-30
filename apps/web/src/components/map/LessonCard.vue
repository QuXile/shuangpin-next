<script setup lang="ts">
import FocusTagList from '@/components/FocusTagList.vue'
import { lessonKindLabel, type LessonView } from '@/lib/lessonView'

withDefaults(defineProps<{ lesson: LessonView; current?: boolean }>(), { current: false })
const emit = defineEmits<{ start: [lessonId: string] }>()
</script>

<template>
  <button
    type="button"
    class="lesson"
    :class="[`is-${lesson.state}`, { 'is-current': current }]"
    :disabled="lesson.state === 'locked'"
    :title="lesson.state === 'locked' ? '完成前一课后解锁' : '开始练习（Enter）'"
    @click="emit('start', lesson.id)"
  >
    <span class="state-icon" aria-hidden="true">
      <svg v-if="lesson.state === 'passed'" class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12.5 10 17.5 19 6.8" />
      </svg>
      <svg v-else-if="lesson.state === 'locked'" class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4.8" y="10.4" width="14.4" height="9.8" rx="2.6" /><path d="M8.2 10.4V8a3.8 3.8 0 0 1 7.6 0v2.4" />
      </svg>
      <svg v-else class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8.2 5.4 18.6 12 8.2 18.6z" fill="currentColor" stroke="none" />
      </svg>
    </span>

    <span class="lesson-body">
      <span class="lesson-meta">
        <span class="kind">{{ lessonKindLabel(lesson.kind) }}</span>
        <span class="lesson-id">{{ lesson.id }}</span>
      </span>
      <span class="lesson-title">{{ lesson.title }}</span>
      <span class="lesson-focus">
        <FocusTagList :items="lesson.focusKeys" compact />
      </span>
    </span>

    <span class="lesson-side">
      <span class="stars" :aria-label="`${lesson.stars} 星`">
        <span v-for="n in 3" :key="n" :class="{ on: n <= lesson.stars }">★</span>
      </span>
    </span>
  </button>
</template>

<style scoped>
.lesson {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  text-align: left;
  padding: 13px 14px;
  border-radius: var(--r-lg);
  border: 1px solid var(--line);
  background: var(--surface);
  transition: transform var(--dur-fast) var(--ease), border-color var(--dur-fast),
    box-shadow var(--dur-fast), background var(--dur-fast);
}
.lesson:hover:not(:disabled) {
  transform: translateY(-2px);
  border-color: var(--line-strong);
  box-shadow: var(--shadow-md);
}
.lesson.is-current {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-soft);
}
.lesson.is-passed {
  background: var(--state-success-bg-strong);
  border-color: var(--state-success-line-strong);
}
.lesson.is-passed:hover:not(:disabled) {
  background: var(--state-success-bg-strong-hover);
  border-color: var(--state-success-line-hover);
}
.lesson.is-passed .state-icon {
  color: var(--success);
  background: var(--success-soft);
  border-color: color-mix(in srgb, var(--success) 30%, transparent);
}
.lesson.is-available .state-icon {
  color: var(--brand);
  background: var(--brand-soft);
  border-color: var(--brand-soft-2);
}
.lesson.is-locked {
  opacity: 0.55;
  cursor: not-allowed;
  background: var(--surface-2);
}
.state-icon {
  flex: none;
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 1px solid var(--line);
  color: var(--ink-3);
  background: var(--surface-2);
}
.state-icon .icon {
  width: 16px;
  height: 16px;
}
.lesson-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.lesson-meta {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 10.5px;
  color: var(--ink-4);
}
.kind {
  font-weight: 700;
  color: var(--ink-3);
  background: var(--surface-2);
  border-radius: 5px;
  padding: 0 5px;
}
.lesson-id {
  font-family: var(--font-mono);
}
.lesson-title {
  font-size: var(--text-md);
  font-weight: 650;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lesson-focus {
  display: block;
  min-width: 0;
  margin-top: 3px;
}
.lesson-side {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}
.stars {
  display: inline-flex;
  gap: 1px;
  color: var(--surface-3);
  font-size: 12px;
  line-height: 1;
}
.stars .on {
  color: #f59e0b;
}
</style>
