<script setup lang="ts">
import type { ChapterView, LessonView } from '@/lib/lessonView'
import { lessonKindLabel } from '@/lib/lessonView'
import MappingTagArea from './MappingTagArea.vue'
import CardHeader from '@/components/common/CardHeader.vue'

const props = withDefaults(
  defineProps<{
    lesson?: LessonView | null
    chapter?: ChapterView | null
    currentTitle: string
    passedCount: number
    lessonTotal: number
    emptyMessage?: string
  }>(),
  { lesson: null, chapter: null, emptyMessage: '课程已全部完成，可以选择任意课程继续练习。' },
)

const emit = defineEmits<{ start: [] }>()

</script>

<template>
  <section class="practice-card panel">
    <CardHeader title="继续学习" />

    <div
      v-if="lesson"
      class="current-card"
      tabindex="0"
      @click="emit('start')"
      @keydown.enter="emit('start')"
    >
      <div class="card-top">
        <div class="card-meta">
          <div class="card-type">
            第 {{ lesson.order + 1 }} 课 · {{ lessonKindLabel(lesson.kind) }}
            <span>{{ lesson.id }}</span>
          </div>
          <h3 class="card-title">{{ lesson.title }}</h3>
        </div>
        <div class="stars" :aria-label="`${lesson.stars} 星`">
          <span v-for="n in 3" :key="n" :class="{ on: n <= lesson.stars }">★</span>
        </div>
      </div>

      <div class="card-main">
        <span class="card-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        </span>
        <MappingTagArea :items="lesson.focusKeys" />
      </div>

      <div class="current-foot">
        <span class="current-progress">
          已完成 {{ passedCount }} / {{ lessonTotal }} 课
          <template v-if="chapter"> · 本章 {{ chapter.lessons.filter((item) => item.state === 'passed').length }} / {{ chapter.lessons.length }} 小节</template>
        </span>
        <button class="continue" type="button" @click.stop="emit('start')">
          {{ currentTitle }}
          <kbd>Enter</kbd>
        </button>
      </div>
    </div>

    <div v-else class="current-empty">{{ emptyMessage }}</div>
  </section>
</template>

<style scoped>
.practice-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: 0 20px 20px;
}
.current-card {
  --mapping-more-bg: var(--surface);
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 20px;
  border: 1.5px solid var(--brand);
  border-radius: var(--r-card);
  background: var(--surface);
  box-shadow: 0 0 0 3px var(--brand-soft);
  cursor: pointer;
  transition: transform var(--dur-mid) var(--ease), box-shadow var(--dur-mid) var(--ease);
}
.current-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 0 0 3px var(--brand-soft), var(--hover-shadow);
}
.current-card:active {
  transform: translateY(-1px) scale(0.995);
}
.card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
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
  margin: 0;
  color: var(--ink);
  font-size: 16px;
  font-weight: 850;
  line-height: 1.3;
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
  align-items: stretch;
  gap: 12px;
  min-height: 0;
  flex: 1;
}
.card-icon {
  flex: none;
  align-self: flex-start;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--brand-soft);
  color: var(--brand);
}
.card-icon svg {
  width: 14px;
  height: 14px;
}
.current-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: auto;
  padding-top: 2px;
}
.current-progress {
  min-width: 0;
  overflow: hidden;
  color: var(--ink-3);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.continue {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 15px;
  border-radius: var(--r-control);
  background: var(--brand);
  color: var(--on-accent);
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
  box-shadow: var(--brand-glow);
  transition: background var(--dur-fast), transform var(--dur-fast);
}
.continue:hover {
  background: var(--brand-fill-hover);
  transform: translateY(-1px);
}
.continue:active {
  transform: translateY(0) scale(0.97);
}
.current-empty {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px 16px;
  color: var(--ink-3);
  font-size: 12px;
  text-align: center;
}
/* 1440 宽时继续学习卡高度由有数据状态驱动；空态补足相同主体高度，
   避免 hero-overview grid 行高缩短导致 Hero 跳 12px。 */
@media (min-width: 1400px) {
  .current-empty {
    min-height: 187.4px;
  }
}
@media (max-width: 640px) {
  .practice-card {
    padding: 16px;
  }
  .current-card {
    padding: 15px;
  }
  .current-foot {
    align-items: stretch;
    flex-direction: column;
  }
  .current-progress {
    white-space: normal;
  }
  .continue {
    width: 100%;
  }
}
</style>
