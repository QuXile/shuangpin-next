<script setup lang="ts">
/**
 * 练习总结卡片：课程阶段结束与练习场文章练习完成共用。
 * 纯展示：统计、错误键位、评分标准、可选星级评分与操作按钮。
 */
import type { PassCriteriaLine } from '@shuangpin/core'

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
    class="summary-card"
    :class="{ 'is-success': tone === 'success', 'is-danger': tone === 'danger' }"
  >
    <div class="summary-head">
      <div class="summary-copy">
        <span class="summary-kicker">{{ kicker }}</span>
        <p class="summary-text"><strong>{{ title }}</strong></p>
      </div>
      <div
        v-if="rating"
        class="summary-rating"
        :class="{ 'is-passed': rating.passed }"
        aria-label="本次考核评分"
      >
        <span class="summary-rating-label">本次评分</span>
        <strong class="summary-rating-stars">
          {{ rating.passed ? '★'.repeat(rating.stars) + '☆'.repeat(3 - rating.stars) : '未通过' }}
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
        <p v-for="line in rules" :key="line.label" class="summary-rule">
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
  border: 1px solid var(--line);
  border-radius: var(--r-xl);
  background: var(--surface);
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: ui-fade-up 280ms var(--ease);
}
.summary-card.is-success {
  border-color: var(--state-success-line);
  background: var(--state-success-bg);
}
.summary-card.is-danger {
  border-color: var(--state-danger-line);
  background: var(--state-danger-bg);
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
  color: var(--ink-3);
  background: var(--surface-3);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
}
.summary-card.is-success .summary-kicker {
  color: var(--state-success-ink);
  background: var(--state-success-surface);
}
.summary-card.is-danger .summary-kicker {
  color: var(--state-danger-ink);
  background: var(--state-danger-surface);
}
.summary-text {
  margin: 0;
  color: var(--ink-3);
  font-size: 12px;
  line-height: 1.6;
}
.summary-text strong {
  color: var(--ink);
  font-size: 14px;
  font-weight: 700;
}
.summary-card.is-success .summary-text strong {
  color: var(--state-success-ink);
}
.summary-card.is-danger .summary-text strong {
  color: var(--state-danger-ink);
}
.summary-rating {
  flex: none;
  min-width: 148px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 14px 9px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}
.summary-rating.is-passed {
  border-color: var(--state-success-line);
}
.summary-card.is-success .summary-rating {
  background: var(--state-success-surface);
  border-color: color-mix(in srgb, var(--state-success-line) 72%, transparent);
}
.summary-card.is-danger .summary-rating {
  background: var(--state-danger-surface);
  border-color: color-mix(in srgb, var(--state-danger-line) 72%, transparent);
}
.summary-rating-label {
  color: var(--ink-4);
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.06em;
}
.summary-rating-stars {
  color: var(--danger);
  font-size: 21px;
  font-weight: 800;
  letter-spacing: 2px;
  line-height: 1.25;
}
.summary-rating.is-passed .summary-rating-stars {
  color: var(--star-bright);
}
.summary-rating-note {
  color: var(--ink-3);
  font-size: 10px;
  font-weight: 650;
}
.summary-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 8px;
}
.summary-stat {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--line-faint);
  border-radius: var(--r-sm);
  background: var(--surface-2);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.summary-stat b {
  color: var(--ink);
  font-size: 18px;
  font-weight: 780;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
.summary-stat b small {
  margin-left: 2px;
  color: var(--ink-3);
  font-size: 9px;
  font-weight: 600;
}
.summary-stat > span {
  color: var(--ink-3);
  font-size: 10px;
  font-weight: 600;
}
.summary-card.is-success .summary-stat,
.summary-card.is-success .summary-block {
  background: var(--state-success-surface);
  border-color: color-mix(in srgb, var(--state-success-line) 55%, transparent);
}
.summary-card.is-danger .summary-stat,
.summary-card.is-danger .summary-block {
  background: var(--state-danger-surface);
  border-color: color-mix(in srgb, var(--state-danger-line) 55%, transparent);
}
.summary-card.is-danger .summary-key-errors li {
  background: color-mix(in srgb, var(--state-danger-surface) 72%, var(--surface));
}
.summary-card.is-danger .summary-rule b {
  color: var(--state-danger-ink);
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
  border: 1px solid var(--line-faint);
  border-radius: var(--r-sm);
  background: color-mix(in srgb, var(--surface) 86%, transparent);
}
.summary-block > header {
  margin-bottom: 7px;
  color: var(--ink-2);
  font-size: 11px;
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
  border-radius: var(--r-sm);
  background: var(--surface-2);
  color: var(--ink-3);
  font-size: 11px;
}
.summary-key-errors b,
.summary-key-errors em {
  font-family: var(--font-mono);
  font-size: 12px;
  font-style: normal;
}
.summary-key-errors b {
  color: var(--ink);
  font-weight: 700;
}
.summary-key-errors em {
  color: var(--danger);
  font-weight: 700;
}
.summary-key-errors strong {
  flex: none;
  color: var(--danger);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.summary-rule {
  margin: 0;
  display: grid;
  grid-template-columns: 2.6em minmax(0, 1fr);
  column-gap: 7px;
  color: var(--ink-3);
  font-size: 10px;
  line-height: 1.55;
}
.summary-rule + .summary-rule {
  margin-top: 3px;
}
.summary-rule b {
  color: var(--brand-ink);
  font-weight: 800;
  letter-spacing: 0.04em;
}
.summary-rule-note {
  margin: 6px 0 0;
  color: var(--ink-4);
  font-size: 10px;
}
.summary-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.summary-actions :slotted(.btn) {
  height: 34px;
  padding: 0 13px;
  font-size: var(--text-sm);
}
.summary-actions :slotted(.btn--primary) {
  transition: background var(--dur-fast), border-color var(--dur-fast), transform var(--dur-fast);
}
.summary-card.is-success .summary-actions :slotted(.btn--primary) {
  background: var(--state-success-fill);
  border-color: var(--state-success-fill);
  box-shadow: 0 2px 0 var(--state-success-fill-hover);
}
.summary-card.is-success .summary-actions :slotted(.btn--primary:hover:not(:disabled)) {
  background: var(--state-success-fill-hover);
  border-color: var(--state-success-fill-hover);
}
.summary-card.is-success .summary-actions :slotted(.btn:not(.btn--primary)) {
  background: var(--state-success-surface);
  border-color: color-mix(in srgb, var(--state-success-line) 72%, transparent);
  color: var(--state-success-ink);
}
.summary-card.is-success .summary-actions :slotted(.btn:not(.btn--primary):hover:not(:disabled)) {
  background: color-mix(in srgb, var(--state-success-surface) 82%, var(--state-success-fill) 18%);
  border-color: var(--state-success-line);
  color: var(--state-success-ink);
}
.summary-card.is-danger .summary-actions :slotted(.btn--primary) {
  background: var(--danger);
  border-color: var(--danger);
  color: var(--on-accent);
}
.summary-card.is-danger .summary-actions :slotted(.btn:not(.btn--primary)) {
  background: var(--state-danger-surface);
  border-color: color-mix(in srgb, var(--state-danger-line) 72%, transparent);
  color: var(--state-danger-ink);
}
.summary-card.is-danger .summary-actions :slotted(.btn:not(.btn--primary):hover:not(:disabled)) {
  background: color-mix(in srgb, var(--state-danger-surface) 82%, var(--danger) 18%);
  border-color: var(--state-danger-line);
  color: var(--state-danger-ink);
}
.summary-actions :slotted(.btn kbd) {
  margin-left: 2px;
}
@media (max-width: 700px) {
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
