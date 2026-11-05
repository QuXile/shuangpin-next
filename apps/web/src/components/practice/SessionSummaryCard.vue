<script setup lang="ts">
/**
 * 练习会话统一总结卡：阶段完成 / 暂停 / 主动结束共用。
 * 练习模式只展示统计、评分标准与错误键位，不显示星级；阶段考核的星级由 stage 模式透传。
 */
import { computed } from 'vue'
import type { PassCriteriaLine } from '@shuangpin/core'
import StageSummaryCard from './StageSummaryCard.vue'
import type { SessionRating, SessionSummary } from '@/lib/sessionSummary'

type CardMode = 'stage' | 'pause' | 'end'

const props = withDefaults(
  defineProps<{
    mode: CardMode
    summary: Pick<SessionSummary, 'accuracy' | 'cpm' | 'errors' | 'durationSec' | 'keyErrorRows'>
    title?: string
    rules?: PassCriteriaLine[]
    /** 仅 stage 模式使用；练习模式不显示星级 */
    rating?: SessionRating | null
    passedAttempt?: boolean
    maxHeight?: string
  }>(),
  {
    title: '',
    rules: () => [],
    rating: null,
    passedAttempt: true,
    maxHeight: '',
  },
)

const stats = computed(() => [
  { value: props.summary.accuracy, unit: '%', label: '正确率' },
  { value: props.summary.cpm, unit: 'WPM', label: '速度' },
  { value: props.summary.errors, label: '错误次数' },
  { value: props.summary.durationSec, unit: '秒', label: '用时' },
])

const kicker = computed(() => {
  if (props.mode === 'pause') return '练习暂停'
  if (props.mode === 'end') return '练习结束'
  return props.passedAttempt ? '阶段完成' : '暂未达标'
})

const displayTitle = computed(() => {
  if (props.title) return props.title
  if (props.mode === 'pause') return '练习已暂停。'
  return '本次练习已结束。'
})
</script>

<template>
  <StageSummaryCard
    :kicker="kicker"
    :title="displayTitle"
    :tone="mode === 'pause' ? 'neutral' : mode === 'stage' && !passedAttempt ? 'danger' : 'success'"
    :stats="stats"
    :key-errors="summary.keyErrorRows"
    :rules="rules"
    :rating="rating"
    :max-height="maxHeight"
  >
    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>
  </StageSummaryCard>
</template>
