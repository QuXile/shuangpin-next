<script setup lang="ts">
import SessionBar from '@/components/layout/SessionBar.vue'
/** 入门课页壳：会话顶栏 + 进度点 + 页面标题行。 */
withDefaults(
  defineProps<{
    success?: boolean
    canPrevious?: boolean
    stepNumber: string
    totalSteps: string
    steps: readonly string[]
    stepIndex: number
    stepTitle: string
    stepBadge: string
    nextDisabled?: boolean
    nextLabel: string
  }>(),
  { success: false, canPrevious: false, nextDisabled: false },
)

const emit = defineEmits<{ previous: []; next: [] }>()
</script>

<template>
  <SessionBar :success="success">
    <template #left>
      <button class="session-btn" type="button" :disabled="!canPrevious" @click="emit('previous')">
        <svg class="icon session-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19.5 12h-15" /><path d="m10.5 6-6 6 6 6" />
        </svg>
        上一页
        <kbd>Alt+←</kbd>
      </button>
    </template>

    <span class="session-item">第 {{ stepNumber }} / {{ totalSteps }} 页</span>

    <template #right>
      <button
        class="btn btn--primary session-primary"
        type="button"
        :disabled="nextDisabled"
        @click="emit('next')"
      >
        {{ nextLabel }}
        <kbd>Enter</kbd>
      </button>
    </template>
  </SessionBar>

  <nav class="intro-progress" aria-label="入门课进度">
    <span
      v-for="(item, index) in steps"
      :key="item"
      class="intro-progress-dot"
      :class="{ 'is-active': index === stepIndex, 'is-done': index < stepIndex }"
    />
  </nav>

  <header class="intro-page-head">
    <div>
      <p class="eyebrow intro-kicker">{{ stepNumber }} / {{ totalSteps }} · 入门课</p>
      <h1>{{ stepTitle }}</h1>
    </div>
    <span class="count-badge">{{ stepBadge }}</span>
  </header>
</template>

<style scoped>
.intro-progress {
  flex: none;
  width: 100%;
  display: flex;
  gap: 6px;
  padding: 0 36px;
  margin-bottom: 10px;
}
.intro-progress-dot {
  flex: 1;
  height: 3px;
  border-radius: var(--r-pill);
  background: var(--surface-3);
  transition: background var(--dur-fast) var(--ease);
}
.intro-progress-dot.is-done {
  background: var(--brand-soft-2);
}
.intro-progress-dot.is-active {
  background: var(--brand);
}
.intro-page-head {
  flex: none;
  width: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 0 36px 12px;
}
.intro-page-head h1 {
  margin: 4px 0 0;
  color: var(--ink);
  font-size: var(--text-display-sm);
  font-weight: 800;
  letter-spacing: -0.035em;
  line-height: 1.2;
}
.intro-kicker {
  margin: 0;
}
@media (max-width: 640px) {
  .intro-progress,
  .intro-page-head {
    padding-right: 16px;
    padding-left: 16px;
  }
  .intro-page-head {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
    padding-bottom: 8px;
  }
  .intro-page-head h1 {
    font-size: var(--text-xl);
  }
}
</style>
