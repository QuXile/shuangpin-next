<script setup lang="ts">
import { computed } from 'vue'
import type { ChapterView } from '@/lib/lessonView'
import LessonCard from './LessonCard.vue'

const props = withDefaults(
  defineProps<{ chapter: ChapterView; currentId?: string; collapsed?: boolean }>(),
  { currentId: '', collapsed: false },
)
const emit = defineEmits<{ start: [lessonId: string]; toggle: [chapterId: string] }>()

const passedCount = computed(
  () => props.chapter.lessons.filter((lesson) => lesson.state === 'passed').length,
)
const percent = computed(
  () => (passedCount.value / Math.max(props.chapter.lessons.length, 1)) * 100,
)
const lessonsId = computed(() => `chapter-lessons-${props.chapter.id}`)
</script>

<template>
  <section class="chapter-group" :class="{ 'is-collapsed': collapsed }">
    <button
      class="chapter-head"
      type="button"
      :aria-expanded="!collapsed"
      :aria-controls="lessonsId"
      @click="emit('toggle', chapter.id)"
    >
      <span class="chapter-title-wrap">
        <span class="chapter-num">{{ String(chapter.order).padStart(2, '0') }}</span>
        <span class="chapter-name">{{ chapter.title }}</span>
      </span>
      <span class="chapter-progress">
        <span class="chapter-count">{{ passedCount }}/{{ chapter.lessons.length }}</span>
        <span class="progress-bar-mini" aria-hidden="true">
          <i :style="{ width: percent + '%' }" />
        </span>
        <svg class="chapter-chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
    </button>

    <div v-show="!collapsed" :id="lessonsId" class="lesson-grid">
      <LessonCard
        v-for="lesson in chapter.lessons"
        :key="lesson.id"
        :lesson="lesson"
        :current="lesson.id === currentId"
        @start="emit('start', $event)"
      />
    </div>
  </section>
</template>

<style scoped>
.chapter-group {
  margin: 0;
}
.chapter-head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 22px 10px;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: var(--surface-2);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease);
}
.chapter-head:hover {
  background: var(--surface-3);
}
.chapter-title-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.chapter-num {
  flex: none;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
  background: var(--surface);
  color: var(--ink);
  font-size: var(--text-base);
  font-weight: 850;
  box-shadow: var(--shadow-sm);
}
.chapter-name {
  overflow: hidden;
  color: var(--ink);
  font-size: var(--text-md);
  font-weight: 850;
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chapter-progress {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--ink-3);
  font-size: var(--text-sm);
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}
.chapter-count {
  min-width: 34px;
  text-align: right;
}
.progress-bar-mini {
  width: 100px;
  height: 6px;
  overflow: hidden;
  border-radius: var(--r-pill);
  background: var(--surface-3);
}
.progress-bar-mini i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--brand);
  transition: width var(--dur-slow) var(--ease);
}
.chapter-chevron {
  width: 16px;
  height: 16px;
  flex: none;
  color: var(--ink-4);
  transition: transform var(--dur-fast) var(--ease);
}
.is-collapsed .chapter-chevron {
  transform: rotate(-90deg);
}
.lesson-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding: 12px 22px 18px;
}
@media (max-width: 1024px) {
  .lesson-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 640px) {
  .chapter-head {
    padding: 16px 16px 12px;
  }
  .chapter-title-wrap {
    gap: 8px;
  }
  .chapter-name {
    font-size: var(--text-md);
  }
  .chapter-num {
    width: 28px;
    height: 28px;
    font-size: var(--text-sm);
  }
  .chapter-progress {
    gap: 8px;
    font-size: var(--text-xs);
  }
  .progress-bar-mini {
    width: 60px;
  }
  .lesson-grid {
    grid-template-columns: 1fr;
    padding: 12px 16px 16px;
    gap: 10px;
  }
}
</style>
