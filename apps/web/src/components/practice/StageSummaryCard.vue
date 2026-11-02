<script setup lang="ts">
/**
 * 练习总结卡片：课程阶段结束与练习场文章练习完成共用。
 * 纯展示：统计、错误键位、评分标准、可选星级评分与操作按钮。
 * tone 由 base.css 的 .tone-success / .tone-danger 提供 --tone-* 变量。
 */
import type { PassCriteriaLine } from '@shuangpin/core'
import StarRating from '@/components/common/StarRating.vue'

export interface SummaryStat {
  value: string | number
  unit?: string
  label: string
}

export interface SummaryKeyError {
  expected: string
  typed: string
  count: number
}

export interface SummaryRating {
  passed: boolean
  stars: 0 | 1 | 2 | 3
}

withDefaults(
  defineProps<{
    kicker: string
    title: string
    tone?: 'success' | 'neutral' | 'danger'
    stats: SummaryStat[]
    keyErrors?: SummaryKeyError[]
    rules?: PassCriteriaLine[]
    rating?: SummaryRating | null
  }>(),
  {
    tone: 'neutral',
    keyErrors: () => [],
    rules: () => [],
    rating: null,
  },
)
</script>

<template>
  <article
    class="summary-card panel"
    :class="tone === 'success' ? 'tone-success' : tone === 'danger' ? 'tone-danger' : undefined"
  >
    <div class="summary-head">
      <div class="summary-copy">
        <span class="summary-kicker">{{ kicker }}</span>
        <p class="summary-text"><strong>{{ title }}</strong></p>
      </div>
      <div
        v-if="rating"
        class="summary-rating"
        role="group"
        :aria-label="rating.passed ? `本次评分 ${rating.stars} 星` : '本次评分未通过'"
      >
        <span class="summary-rating-label">本次评分</span>
        <strong class="summary-rating-stars">
          <StarRating v-if="rating.passed" :stars="rating.stars" size="lg" />
          <template v-else>未通过</template>
        </strong>
        <span v-if="rating.passed" class="summary-rating-note">{{ rating.stars }} 星</span>
      </div>
    </div>

    <div class="summary-stats">
      <div v-for="stat in stats" :key="stat.label" class="summary-stat">
        <b>{{ stat.value }}<small v-if="stat.unit">{{ stat.unit }}</small></b>
        <span>{{ stat.label }}</span>
      </div>
    </div>

    <div
      v-if="keyErrors.length || rules.length"
      class="summary-details"
      :class="{ 'is-single': !keyErrors.length || !rules.length }"
    >
      <section v-if="keyErrors.length" class="summary-block">
        <header>错误键位</header>
        <ul class="summary-key-errors">
          <li v-for="error in keyErrors" :key="`${error.expected}-${error.typed}`">
            <span>应敲 <b>{{ error.expected }}</b>，按成 <em>{{ error.typed }}</em></span>
            <strong>×{{ error.count }}</strong>
          </li>
        </ul>
      </section>

      <section v-if="rules.length" class="summary-block">
        <header>本课评分标准</header>
        <p v-for="line in rules" :key="line.label" class="criteria-line">
          <b>{{ line.label }}</b>
          <span>{{ line.text }}</span>
        </p>
        <p v-if="rating && !rating.passed" class="summary-rule-note">
          达到最低标准后即可完成本课。
        </p>
      </section>
    </div>

    <div v-if="$slots.actions" class="summary-actions">
      <slot name="actions" />
    </div>
  </article>
</template>

<style scoped>
.summary-card {
  width: 100%;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: ui-fade-up var(--dur-slow) var(--ease);
}
.summary-card.tone-success,
.summary-card.tone-danger {
  background: var(--tone-bg);
  border-color: var(--tone-line);
}

.summary-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.summary-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.summary-kicker {
  width: fit-content;
  padding: 3px 9px;
  border-radius: var(--r-control);
  color: var(--tone-ink, var(--ink-3));
  background: var(--tone-surface, var(--surface-3));
  font-size: var(--text-2xs);
  font-weight: 800;
  letter-spacing: 0.08em;
}
.summary-text {
  margin: 0;
  color: var(--ink-3);
  font-size: var(--text-sm);
  line-height: 1.6;
}
.summary-text strong {
  color: var(--tone-ink, var(--ink));
  font-size: var(--text-base);
  font-weight: 700;
}

.summary-rating {
  flex: none;
  min-width: 148px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 14px 9px;
  border: 1px solid var(--tone-line, var(--line));
  border-radius: var(--r-card);
  background: var(--tone-surface, var(--surface));
  box-shadow: var(--shadow-sm);
}
.summary-rating-label,
.summary-rating-note {
  color: var(--ink-4);
  font-size: var(--text-2xs);
  font-weight: 650;
  letter-spacing: 0.06em;
}
.summary-rating-stars {
  color: var(--danger);
  font-size: var(--text-lg);
  font-weight: 800;
  line-height: 1.25;
}
.summary-rating.is-passed .summary-rating-stars {
  color: var(--star);
}

.summary-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 8px;
}
.summary-stat {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--tone-line, var(--line)) 55%, transparent);
  border-radius: var(--r-card);
  background: var(--tone-surface, var(--surface-2));
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.summary-stat b {
  color: var(--ink);
  font-size: var(--text-lg);
  font-weight: 780;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
.summary-stat b small {
  margin-left: 2px;
  color: var(--ink-3);
  font-size: var(--text-2xs);
  font-weight: 600;
}
.summary-stat > span {
  color: var(--ink-3);
  font-size: var(--text-2xs);
  font-weight: 600;
}

.summary-details {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  gap: 10px;
}
.summary-details.is-single {
  grid-template-columns: 1fr;
}
.summary-block {
  min-width: 0;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--tone-line, var(--line)) 55%, transparent);
  border-radius: var(--r-card);
  background: var(--tone-surface, color-mix(in srgb, var(--surface) 86%, transparent));
}
.summary-block > header {
  margin-bottom: 7px;
  color: var(--ink-2);
  font-size: var(--text-xs);
  font-weight: 700;
}
.summary-key-errors {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.summary-key-errors li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 5px 8px;
  border-radius: var(--r-control);
  background: var(--surface-2);
  color: var(--ink-3);
  font-size: var(--text-xs);
}
.summary-key-errors b,
.summary-key-errors em {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-style: normal;
}
.summary-key-errors b {
  color: var(--ink);
  font-weight: 700;
}
.summary-key-errors em,
.summary-key-errors strong {
  color: var(--danger);
  font-weight: 700;
}
.summary-key-errors strong {
  flex: none;
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}
.summary-rule-note {
  margin: 6px 0 0;
  color: var(--ink-4);
  font-size: var(--text-2xs);
}
.summary-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.summary-actions :slotted(.btn) {
  height: var(--h-control);
  padding: 0 13px;
  font-size: var(--text-sm);
}

@media (max-width: 640px) {
  .summary-card {
    padding: 12px;
  }
  .summary-head {
    flex-direction: column;
    gap: 10px;
  }
  .summary-rating {
    align-items: flex-start;
    width: 100%;
  }
  .summary-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .summary-details {
    grid-template-columns: 1fr;
  }
  .summary-actions :slotted(.btn) {
    flex: 1;
    justify-content: center;
  }
}
</style>
