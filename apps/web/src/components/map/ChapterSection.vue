<script setup lang="ts">
import type { ChapterView } from '@/lib/lessonView'
import LessonCard from './LessonCard.vue'

withDefaults(defineProps<{ chapter: ChapterView; currentId?: string }>(), { currentId: '' })
const emit = defineEmits<{ start: [lessonId: string] }>()
</script>

<template>
  <section class="chapter">
    <header class="chapter-head">
      <div class="chapter-title">
        <span class="chapter-num">{{ String(chapter.order).padStart(2, '0') }}</span>
        <div>
          <h2>{{ chapter.title }}</h2>
        </div>
      </div>
      <div class="chapter-progress">
        <span>{{ chapter.lessons.filter((lesson) => lesson.state === 'passed').length }}/{{ chapter.lessons.length }}</span>
        <div class="mini-bar">
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
.chapter {
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--line-faint);
  border-radius: 0;
  box-shadow: none;
  overflow: hidden;
}
.chapter:last-child {
  border-bottom: 0;
}
.chapter-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 15px 20px;
  background: color-mix(in srgb, var(--surface-2) 65%, transparent);
  border-bottom: 1px solid var(--line-faint);
}
.chapter-title {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.chapter-num {
  flex: none;
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: var(--r-md);
  background: var(--surface-2);
  border: 1px solid var(--line);
  font-family: var(--font-mono);
  font-size: var(--text-md);
  font-weight: 700;
  color: var(--ink-3);
}
.chapter-title h2 {
  font-size: var(--text-lg);
}
.chapter-progress {
  flex: none;
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: var(--text-xs);
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
}
.mini-bar {
  width: 86px;
  height: 6px;
  border-radius: var(--r-pill);
  background: var(--surface-3);
  overflow: hidden;
}
.mini-bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--brand);
  transition: width var(--dur-slow) var(--ease);
}
.lesson-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 14px;
  align-items: start;
}
@media (max-width: 680px) {
  .chapter-head {
    padding: 14px;
  }
  .lesson-grid {
    grid-template-columns: 1fr;
    padding: 12px;
  }
}
</style>
