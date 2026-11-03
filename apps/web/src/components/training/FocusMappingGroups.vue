<script setup lang="ts">
/**
 * 练习场「焦点」选择卡：仅专项使用。
 * 焦点是词级约束——每个词至少包含一个选中焦点原子；空集合表示不限。
 */
import type { TrainingSelection } from '@/composables/useTrainingSelection'
import SetupCard from './SetupCard.vue'
import SetupGroup from './SetupGroup.vue'

const props = defineProps<{ selection: TrainingSelection }>()

const {
  focusInitials,
  focusFinals,
  focusZeroFinals,
  focusCandidates,
  focusCount,
  focusInitialGroup,
  focusFinalGroup,
  focusZeroGroup,
  toggleFocus,
  toggleFocusAll,
  clearFocus,
} = props.selection

const hasCandidates = (): boolean =>
  focusCandidates.value.initials.length > 0 ||
  focusCandidates.value.finals.length > 0 ||
  focusCandidates.value.zeroFinals.length > 0
</script>

<template>
  <SetupCard pill="焦点" tone="focus" subtitle="每个词至少包含一个">
    <template #head-extra>
      <div class="focus-actions">
        <span class="focus-count">已选 {{ focusCount }}</span>
        <button
          class="meta-btn"
          type="button"
          :disabled="focusCount === 0"
          title="清空焦点，恢复不限"
          @click="clearFocus"
        >
          清空
        </button>
      </div>
    </template>

    <template v-if="hasCandidates()">
      <SetupGroup
        v-if="focusCandidates.initials.length > 0"
        title="声母"
        :all-checked="focusInitialGroup.all"
        :indeterminate="focusInitialGroup.indeterminate"
        @toggle-all="toggleFocusAll('initial')"
      >
        <template #count>已选 {{ focusInitialGroup.selected }}/{{ focusInitialGroup.total }}</template>
        <button
          v-for="initial in focusCandidates.initials"
          :key="`focus-initial-${initial}`"
          type="button"
          class="chip"
          :class="{ 'is-selected': focusInitials.has(initial) }"
          :aria-pressed="focusInitials.has(initial)"
          @click="toggleFocus('initial', initial)"
        >
          {{ initial }}
        </button>
      </SetupGroup>

      <SetupGroup
        v-if="focusCandidates.finals.length > 0"
        title="韵母"
        :all-checked="focusFinalGroup.all"
        :indeterminate="focusFinalGroup.indeterminate"
        @toggle-all="toggleFocusAll('final')"
      >
        <template #count>已选 {{ focusFinalGroup.selected }}/{{ focusFinalGroup.total }}</template>
        <button
          v-for="final in focusCandidates.finals"
          :key="`focus-final-${final}`"
          type="button"
          class="chip"
          :class="{ 'is-selected': focusFinals.has(final) }"
          :aria-pressed="focusFinals.has(final)"
          @click="toggleFocus('final', final)"
        >
          {{ final }}
        </button>
      </SetupGroup>

      <SetupGroup
        v-if="focusCandidates.zeroFinals.length > 0"
        title="零声母"
        :all-checked="focusZeroGroup.all"
        :indeterminate="focusZeroGroup.indeterminate"
        @toggle-all="toggleFocusAll('zero')"
      >
        <template #count>已选 {{ focusZeroGroup.selected }}/{{ focusZeroGroup.total }}</template>
        <button
          v-for="zero in focusCandidates.zeroFinals"
          :key="`focus-zero-${zero}`"
          type="button"
          class="chip is-special is-zero-chip"
          :class="{ 'is-selected': focusZeroFinals.has(zero) }"
          :aria-pressed="focusZeroFinals.has(zero)"
          @click="toggleFocus('zero', zero)"
        >
          零 {{ zero }}
        </button>
      </SetupGroup>

      <p v-if="focusCount === 0" class="focus-note">不限焦点；选中后每个词至少包含一个。</p>
    </template>

    <p v-else class="setup-empty">先在「出现」中选择声母或韵母。</p>
  </SetupCard>
</template>

<style scoped>
.focus-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
.focus-count {
  color: var(--mapping-focus-ink);
  font-size: var(--text-xs);
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}
.focus-note {
  margin: 0;
  color: var(--ink-4);
  font-size: var(--text-xs);
  line-height: 1.6;
}
</style>
