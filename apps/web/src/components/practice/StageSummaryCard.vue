<script setup lang="ts">
/**
 * 练习总结卡片：课程阶段结束与训练场文章练习完成共用。
 * 纯展示：统计、错误键位、评分规则、可选星级评分与操作按钮。
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
    tone?: 'success' | 'neutral'
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
  <article class="summary-card" :class="{ 'is-success': tone === 'success' }">
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
        <header>本课评分规则</header>
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
  padding: 16px 18px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.summary-card.is-success {
  border-color: var(--state-success-line);
  background: linear-gradient(180deg, var(--state-success-bg), var(--surface) 58%);
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
  padding: 2px 8px;
  border-radius: var(--r-pill);
  color: var(--ink-3);
  background: var(--surface-3);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.summary-card.is-success .summary-kicker {
  color: var(--state-success-ink);
  background: var(--surface);
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
.summary-rating {
  flex: none;
  min-width: 148px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 14px 9px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
}
.summary-rating.is-passed {
  border-color: var(--state-success-line);
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
  color: var(--star);
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
  padding: 9px 10px;
  border: 1px solid var(--line-faint);
  border-radius: var(--r-md);
  background: var(--surface);
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
  padding: 11px 12px;
  border: 1px solid var(--line-faint);
  border-radius: var(--r-md);
  background: var(--surface);
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
  height: 32px;
  padding: 0 12px;
  font-size: 12px;
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
