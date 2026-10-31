<script setup lang="ts">
import type { ChapterView } from '@/lib/lessonView'
import LessonCard from './LessonCard.vue'

withDefaults(defineProps<{ chapter: ChapterView; currentId?: string }>(), { currentId: '' })
const emit = defineEmits<{ start: [lessonId: string] }>()
</script>

<template>
  <section class="chapter-group">
    <header class="chapter-head">
      <div class="chapter-title-wrap">
        <span class="chapter-num">{{ String(chapter.order).padStart(2, '0') }}</span>
        <span class="chapter-name">{{ chapter.title }}</span>
      </div>
      <div class="chapter-progress">
        <span>{{ chapter.lessons.filter((lesson) => lesson.state === 'passed').length }}/{{ chapter.lessons.length }}</span>
        <div class="progress-bar-mini">
          <i :style="{ width: (chapter.lessons.filter((lesson) => lesson.state === 'passed').length / Math.max(chapter.lessons.length, 1)) * 100 + '%' }" />
        </div>
      </div>
    </header>

    <div class="lesson-grid">
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 26px 14px;
  background: var(--surface-2);
  border-bottom: 1px solid var(--line);
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
  font-size: 13px;
  font-weight: 850;
  box-shadow: var(--shadow-sm);
}
.chapter-name {
  overflow: hidden;
  color: var(--ink);
  font-size: 17px;
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
  font-size: 12px;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
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
.lesson-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  padding: 16px 26px 24px;
}
@media (max-width: 1050px) {
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
    font-size: 15px;
  }
  .chapter-num {
    width: 28px;
    height: 28px;
    font-size: 12px;
  }
  .chapter-progress {
    gap: 8px;
    font-size: 11px;
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
