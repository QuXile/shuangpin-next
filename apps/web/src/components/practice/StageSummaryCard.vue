<script setup lang="ts">
/**
 * 练习总结卡片：课程阶段结束与练习场文章练习完成共用。
 * 纯展示：统计、错误键位、评分标准、可选星级评分与操作按钮。
 * tone 由 base.css 的 .tone-success / .tone-danger 提供 --tone-* 变量。
 */
import { computed } from 'vue'
import { parseAtomId, type AtomId, type PassCriteriaLine } from '@shuangpin/core'
import StarRating from '@/components/common/StarRating.vue'
import KeyCap from '@/components/common/KeyCap.vue'

export interface SummaryStat {
  value: string | number
  unit?: string
  label: string
}

export interface SummaryKeyError {
  expected: string
  typed: string
  count: number
  /** 应按键位对应的知识点（用于显示声母 / 韵母 / 零声母胶囊） */
  atomId?: AtomId
}

export interface SummaryRating {
  passed: boolean
  stars: 0 | 1 | 2 | 3
}

function atomCapsule(error: SummaryKeyError): { label: string; kind: 'initial' | 'final' | 'zero' } | null {
  if (!error.atomId) return null
  const ref = parseAtomId(error.atomId)
  if (!ref) return null
  return {
    label: ref.type === 'zero' ? `零 ${ref.key}` : ref.key,
    kind: ref.type,
  }
}

const props = withDefaults(
  defineProps<{
    kicker: string
    title: string
    tone?: 'success' | 'neutral' | 'danger'
    stats: SummaryStat[]
    keyErrors?: SummaryKeyError[]
    rules?: PassCriteriaLine[]
    rating?: SummaryRating | null
    /** 父容器可传入基于可用高度的 max-height；缺省使用视口兜底 */
    maxHeight?: string
  }>(),
  {
    tone: 'neutral',
    keyErrors: () => [],
    rules: () => [],
    rating: null,
  },
)

interface ErrorVariant {
  typed: string
  count: number
}

interface ErrorGroup {
  key: string
  expected: string
  atom: { label: string; kind: 'initial' | 'final' | 'zero' } | null
  typed: ErrorVariant[]
  total: number
}

/** 同一个应按音合并为一行，按错的不同键作为行内变体。 */
const errorGroups = computed<ErrorGroup[]>(() => {
  const groups = new Map<string, ErrorGroup>()
  for (const error of props.keyErrors) {
    const key = `${error.expected.toUpperCase()}|${error.atomId ?? ''}`
    const group = groups.get(key) ?? {
      key,
      expected: error.expected.toUpperCase(),
      atom: atomCapsule(error),
      typed: [],
      total: 0,
    }
    group.typed.push({ typed: error.typed.toUpperCase(), count: error.count })
    group.total += error.count
    groups.set(key, group)
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      typed: group.typed.sort(
        (a, b) => b.count - a.count || a.typed.localeCompare(b.typed),
      ),
    }))
    .sort(
      (a, b) =>
        b.total - a.total ||
        a.expected.localeCompare(b.expected) ||
        (a.atom?.label ?? '').localeCompare(b.atom?.label ?? ''),
    )
})
</script>

<template>
  <article
    class="summary-card panel"
    :class="tone === 'success' ? 'tone-success' : tone === 'danger' ? 'tone-danger' : undefined"
    :style="maxHeight ? { maxHeight } : undefined"
  >
    <div class="summary-head">
      <div class="summary-copy">
        <span class="summary-kicker">{{ kicker }}</span>
        <p class="summary-text"><strong>{{ title }}</strong></p>
      </div>
    </div>

    <div v-if="rating || rules.length" class="summary-evaluation">
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

      <section v-if="rules.length" class="summary-rules">
        <p v-for="line in rules" :key="line.label" class="criteria-line">
          <b>{{ line.label }}</b>
          <span>{{ line.text }}</span>
        </p>
        <p v-if="rating && !rating.passed" class="summary-rule-note">
          达到最低标准后即可完成本课。
        </p>
      </section>
    </div>

    <div class="summary-stats">
      <div v-for="stat in stats" :key="stat.label" class="summary-stat">
        <b>{{ stat.value }}<small v-if="stat.unit">{{ stat.unit }}</small></b>
        <span>{{ stat.label }}</span>
      </div>
    </div>

    <section
      v-if="keyErrors.length"
      class="summary-errors thin-scroll"
      aria-label="错误键位"
      tabindex="0"
    >
      <header>错误键位</header>
      <ul class="summary-key-errors">
        <li v-for="group in errorGroups" :key="group.key">
          <span class="summary-key-error-pair">
            <span class="summary-key-error-label">应按</span>
            <KeyCap :text="group.expected" variant="primary" />
            <span
              v-if="group.atom"
              class="summary-atom-capsule"
              :class="`is-${group.atom.kind}`"
            >
              {{ group.atom.label }}
            </span>
            <span class="summary-key-error-label">按成</span>
            <span class="summary-key-error-typed">
              <span
                v-for="variant in group.typed"
                :key="variant.typed"
                class="summary-key-error-typed-item"
              >
                <KeyCap :text="variant.typed" variant="danger" />
                <small>×{{ variant.count }}</small>
              </span>
            </span>
          </span>
        </li>
      </ul>
    </section>

    <div v-if="$slots.actions" class="summary-actions">
      <slot name="actions" />
    </div>
  </article>
</template>

<style scoped>
.summary-card {
  width: 100%;
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  /* 高度上限：视口内留出顶栏、会话栏与页面边距；超出时只让错误键位区滚动 */
  max-height: min(720px, calc(100vh - 180px));
  max-height: min(720px, calc(100dvh - 180px));
  overflow: hidden;
  animation: ui-fade-up var(--dur-slow) var(--ease);
}
.summary-head,
.summary-stats,
.summary-actions {
  flex: none;
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
.summary-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 8px;
}
.summary-stat {
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--tone-line, var(--line)) 55%, transparent);
  border-radius: var(--r-card);
  background: var(--tone-surface, var(--surface-2));
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
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
  white-space: nowrap;
}

.summary-evaluation {
  flex: none;
  display: flex;
  align-items: stretch;
  gap: 8px;
}
.summary-rules {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px 10px;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--tone-line, var(--line)) 55%, transparent);
  border-radius: var(--r-card);
  background: var(--tone-surface, color-mix(in srgb, var(--surface) 86%, transparent));
}
.summary-rules .criteria-line {
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: 5px;
  font-size: var(--text-xs);
}
.summary-errors {
  flex: 1 1 auto;
  min-height: 0;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--tone-line, var(--line)) 55%, transparent);
  border-radius: var(--r-card);
  background: var(--tone-surface, color-mix(in srgb, var(--surface) 86%, transparent));
  max-height: min(300px, 42dvh);
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-gutter: stable;
}
.summary-errors > header {
  margin-bottom: 5px;
  color: var(--ink-2);
  font-size: var(--text-xs);
  font-weight: 700;
}
.summary-key-errors {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 5px 8px;
  min-width: 0;
}
.summary-key-errors li {
  flex: 0 1 auto;
  max-width: 100%;
  min-width: 0;
  padding: 4px 7px;
  border-radius: var(--r-control);
  background: var(--surface-2);
  color: var(--ink-3);
  font-size: var(--text-xs);
}
.summary-key-error-pair {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  flex-wrap: wrap;
}
.summary-key-error-typed {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
  min-width: 0;
}
.summary-key-error-typed-item {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.summary-key-error-typed-item small {
  color: var(--danger);
  font-size: var(--text-2xs);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.summary-key-error-label {
  color: var(--ink-3);
  font-size: var(--text-2xs);
  white-space: nowrap;
}
.summary-atom-capsule {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border: 1px solid transparent;
  border-radius: var(--r-pill);
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  font-weight: 700;
  line-height: 1.5;
  white-space: nowrap;
}
.summary-atom-capsule.is-initial {
  border-color: color-mix(in srgb, var(--ini) 24%, transparent);
  background: color-mix(in srgb, var(--ini) 12%, transparent);
  color: var(--ini);
}
.summary-atom-capsule.is-final {
  border-color: color-mix(in srgb, var(--fin) 30%, transparent);
  background: var(--fin-soft);
  color: var(--fin-strong);
}
.summary-atom-capsule.is-zero {
  border-color: var(--mapping-focus-line);
  background: var(--mapping-focus-soft);
  color: var(--mapping-focus-ink);
}
.summary-rule-note {
  grid-column: 1 / -1;
  margin: 0;
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
  .summary-rating {
    align-items: flex-start;
    width: 100%;
  }
  .summary-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .summary-evaluation {
    flex-direction: column;
  }
  .summary-rules {
    grid-template-columns: 1fr;
  }
  .summary-actions :slotted(.btn) {
    flex: 1;
    justify-content: center;
  }
}
</style>
