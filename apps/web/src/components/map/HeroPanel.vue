<script setup lang="ts">
import type { SchemeOption } from '@/stores/course'
import ProgressRing from './ProgressRing.vue'

withDefaults(
  defineProps<{
    currentTitle: string
    schemeOptions: SchemeOption[]
    schemeId: string
    busy?: boolean
    progressPercent: number
    passedCount: number
    lessonTotal: number
    chapterCount: number
    wordCount: number
    canClear: boolean
    unlockedAll?: boolean
  }>(),
  { busy: false, unlockedAll: false },
)

const emit = defineEmits<{
  start: []
  'change-scheme': [id: string]
  'clear-progress': []
  'toggle-unlock': []
}>()
</script>

<template>
  <section class="hero">
    <div class="hero-main">
      <h1>两键一字，<br />练成手感。</h1>

      <div class="hero-actions">
        <button class="btn btn--primary" type="button" aria-keyshortcuts="Enter" @click="emit('start')">
          {{ currentTitle }}
          <kbd>Enter</kbd>
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4.5 12h15" /><path d="m13.5 6 6 6-6 6" />
          </svg>
        </button>
        <div class="hero-aux">
          <button class="clear-progress" type="button" :disabled="!canClear" @click="emit('clear-progress')">
            清除学习进度
          </button>
          <button class="unlock-all" type="button" @click="emit('toggle-unlock')">
            {{ unlockedAll ? '恢复锁定' : '解锁全部课程' }}
          </button>
        </div>
      </div>

      <div v-if="schemeOptions.length > 1" class="scheme-row">
        <label for="scheme-select" class="scheme-label">双拼方案 <kbd>Alt+S</kbd></label>
        <select
          id="scheme-select"
          class="scheme-select"
          :value="schemeId"
          :disabled="busy"
          @change="emit('change-scheme', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="option in schemeOptions" :key="option.id" :value="option.id">
            {{ option.name }}
          </option>
        </select>
      </div>
    </div>

    <aside class="hero-side">
      <ProgressRing :percent="progressPercent" />
      <div class="hero-stats">
        <div class="stat">
          <strong>{{ passedCount }}<em>/{{ lessonTotal }}</em></strong>
          <span>已通过课程</span>
        </div>
        <div class="stat">
          <strong>{{ chapterCount }}</strong>
          <span>课程章节</span>
        </div>
        <div class="stat">
          <strong>{{ wordCount.toLocaleString('zh-CN') }}<em>词</em></strong>
          <span>课程词池</span>
        </div>
      </div>
    </aside>
  </section>
</template>

<style scoped>
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(280px, 0.85fr);
  gap: 22px;
  padding: 32px 30px;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  position: relative;
  z-index: 2;
  overflow: visible;
}
.hero::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(520px 240px at 4% -30%, var(--brand-soft), transparent 65%),
    radial-gradient(420px 200px at 94% 0%, rgba(217, 119, 6, 0.1), transparent 60%);
}
.hero > * {
  position: relative;
}
.hero h1 {
  margin: 16px 0 10px;
  font-size: clamp(28px, 3.4vw, 42px);
  line-height: 1.18;
  font-weight: 750;
  letter-spacing: -0.025em;
}
.hero-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 20px;
}
.hero-actions .btn {
  height: 44px;
  padding: 0 22px;
}
.hero-aux {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
  margin-left: 2px;
}
.scheme-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px dashed var(--line-faint);
  font-size: var(--text-sm);
}
.scheme-label {
  color: var(--ink-3);
}
.scheme-select {
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--ink);
  border-radius: var(--r-sm);
  padding: 6px 9px;
  font-size: var(--text-sm);
}
.clear-progress {
  height: 30px;
  padding: 0 10px;
  border-radius: var(--r-sm);
  border: 1px solid transparent;
  color: var(--ink-4);
  font-size: 11px;
  transition: color var(--dur-fast), background var(--dur-fast), border-color var(--dur-fast);
}
.clear-progress:hover:not(:disabled) {
  color: var(--danger);
  background: var(--danger-soft);
  border-color: color-mix(in srgb, var(--danger) 25%, transparent);
}
.clear-progress:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.unlock-all {
  height: 30px;
  padding: 0 10px;
  border-radius: var(--r-sm);
  border: 1px solid transparent;
  color: var(--brand-ink);
  font-size: 11px;
  transition: color var(--dur-fast), background var(--dur-fast), border-color var(--dur-fast);
}
.unlock-all:hover:not(:disabled) {
  background: var(--brand-soft);
  border-color: var(--brand-soft-2);
}
.unlock-all:disabled {
  opacity: 0.5;
  color: var(--ink-4);
  cursor: not-allowed;
}
.hero-side {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
}
.hero-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  width: 100%;
  text-align: center;
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 4px;
  background: var(--surface-2);
  border-radius: var(--r-md);
}
.stat strong {
  font-size: var(--text-lg);
  font-weight: 700;
}
.stat em {
  font-style: normal;
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--ink-3);
}
.stat span {
  font-size: 10.5px;
  color: var(--ink-3);
}
@media (max-width: 900px) {
  .hero {
    grid-template-columns: 1fr;
    padding: 22px;
  }
  .hero-side {
    flex-direction: row;
    justify-content: flex-start;
    gap: 22px;
    margin-top: 4px;
  }
  .hero-stats {
    grid-template-columns: repeat(3, minmax(0, auto));
    gap: 10px;
  }
}
@media (max-width: 680px) {
  .hero h1 {
    font-size: 27px;
  }
  .hero-actions .btn {
    width: 100%;
  }
  .hero-side {
    flex-wrap: wrap;
  }
}
</style>
