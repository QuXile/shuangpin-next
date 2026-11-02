<script setup lang="ts">
/**
 * 练习场「隐藏映射」选择卡：专项（drill）与文章（article）两个作用域共用同一套渲染，
 * 只有作用域不同。选择/组选状态全部来自 useTrainingSelection。
 */
import { computed } from 'vue'
import type { TrainingSelection } from '@/composables/useTrainingSelection'
import SetupCard from './SetupCard.vue'
import SetupGroup from './SetupGroup.vue'
import CommonCapsule from './CommonCapsule.vue'

const props = defineProps<{
  scope: 'drill' | 'article'
  selection: TrainingSelection
}>()

const {
  hiddenInitials,
  hiddenFinals,
  hiddenZeroFinals,
  hiddenGroupAllChecked,
  hiddenGroupPartial,
  hiddenGroupSelected,
  hiddenGroupTotal,
  hiddenGroupDisabled,
  toggleHiddenAll,
  toggleHidden,
  toggleHiddenZeroFinal,
  commonEntriesFor,
  commonAllChecked,
  toggleCommonAll,
} = props.selection

const candidates = computed(() => props.selection.hiddenCandidatesOf(props.scope))
</script>

<template>
  <SetupCard pill="隐藏" tone="hidden" subtitle="练习时不显示映射">
    <SetupGroup
      v-if="hiddenGroupTotal(scope, 'initial') > 0"
      title="声母"
      :all-checked="hiddenGroupAllChecked(scope, 'initial')"
      :indeterminate="hiddenGroupPartial(scope, 'initial')"
      :all-disabled="hiddenGroupDisabled(scope, 'initial')"
      @toggle-all="toggleHiddenAll(scope, 'initial')"
    >
      <template #count>
        已隐藏 {{ hiddenGroupSelected(scope, 'initial') }}/{{ hiddenGroupTotal(scope, 'initial') }}
      </template>
      <CommonCapsule
        v-if="commonEntriesFor(scope, 'initial').length > 0"
        :selected="commonAllChecked(scope, 'initial')"
        @toggle="toggleCommonAll(scope, 'initial')"
      />
      <button
        v-for="initial in candidates.initials"
        :key="initial"
        type="button"
        class="chip"
        :class="{ 'is-selected': hiddenInitials.has(initial) }"
        :aria-pressed="hiddenInitials.has(initial)"
        @click="toggleHidden(scope, 'initial', initial)"
      >
        {{ initial }}
      </button>
    </SetupGroup>

    <SetupGroup
      v-if="hiddenGroupTotal(scope, 'final') > 0"
      title="韵母"
      :all-checked="hiddenGroupAllChecked(scope, 'final')"
      :indeterminate="hiddenGroupPartial(scope, 'final')"
      :all-disabled="hiddenGroupDisabled(scope, 'final')"
      @toggle-all="toggleHiddenAll(scope, 'final')"
    >
      <template #count>
        已隐藏 {{ hiddenGroupSelected(scope, 'final') }}/{{ hiddenGroupTotal(scope, 'final') }}
      </template>
      <CommonCapsule
        v-if="commonEntriesFor(scope, 'final').length > 0"
        :selected="commonAllChecked(scope, 'final')"
        @toggle="toggleCommonAll(scope, 'final')"
      />
      <button
        v-for="final in candidates.finals"
        :key="final"
        type="button"
        class="chip"
        :class="{ 'is-selected': hiddenFinals.has(final) }"
        :aria-pressed="hiddenFinals.has(final)"
        @click="toggleHidden(scope, 'final', final)"
      >
        {{ final }}
      </button>
    </SetupGroup>

    <SetupGroup
      v-if="hiddenGroupTotal(scope, 'zero') > 0"
      title="零声母"
      :all-checked="hiddenGroupAllChecked(scope, 'zero')"
      :indeterminate="hiddenGroupPartial(scope, 'zero')"
      :all-disabled="hiddenGroupDisabled(scope, 'zero')"
      @toggle-all="toggleHiddenAll(scope, 'zero')"
    >
      <template #count>
        已隐藏 {{ hiddenGroupSelected(scope, 'zero') }}/{{ hiddenGroupTotal(scope, 'zero') }}
      </template>
      <CommonCapsule
        v-if="commonEntriesFor(scope, 'zero').length > 0"
        :selected="commonAllChecked(scope, 'zero')"
        @toggle="toggleCommonAll(scope, 'zero')"
      />
      <button
        v-for="zero in candidates.zeroFinals"
        :key="`hidden-zero-${zero}`"
        type="button"
        class="chip is-special is-zero-chip"
        :class="{ 'is-selected': hiddenZeroFinals.has(zero) }"
        :aria-pressed="hiddenZeroFinals.has(zero)"
        @click="toggleHiddenZeroFinal(scope, zero)"
      >
        零 {{ zero }}
      </button>
    </SetupGroup>

    <p
      v-if="
        hiddenGroupTotal(scope, 'initial') === 0 &&
        hiddenGroupTotal(scope, 'final') === 0 &&
        hiddenGroupTotal(scope, 'zero') === 0
      "
      class="setup-empty"
    >
      先在「出现」中选择声母或韵母。
    </p>
  </SetupCard>
</template>
