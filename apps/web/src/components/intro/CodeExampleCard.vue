<script setup lang="ts">
/**
 * 推荐码 / 兼容编码示例卡：展示音节、标答（primary）与全部被接受的序列。
 * 卡片只消费模型数据；推荐码是否等于主键组合由模型判定。
 */
import { computed } from 'vue'
import type { CodeExample } from './introLessonModel'
import KeyChip from './KeyChip.vue'

const props = defineProps<{ example: CodeExample }>()

const isCompat = computed(() => props.example.reason === 'compat-extra')
const tag = computed(() => (isCompat.value ? '兼容编码' : '推荐码'))
/** 零声母与同音韵母同名，示例卡统一加「零 」前缀。 */
const label = computed(() => (props.example.zeroInitial ? `零 ${props.example.display}` : props.example.display))
/** 标答与主键组合不同：推荐码覆盖或兼容示例都值得单独列一行。 */
const mainKeysDiff = computed(
  () => Boolean(props.example.mainKeys && props.example.mainKeys !== props.example.primary),
)
const extraVisible = computed(
  () => isCompat.value && props.example.extra !== props.example.primary && props.example.extra !== props.example.mainKeys,
)

function variantOf(sequence: string): 'primary' | 'neutral' | 'compat' {
  if (sequence === props.example.primary) return 'primary'
  if (isCompat.value && sequence === props.example.extra) return 'compat'
  return 'neutral'
}
</script>

<template>
  <article class="code-card" :class="{ 'is-compat': isCompat }">
    <header class="code-head">
      <span class="code-syllable">{{ label }}</span>
      <span class="code-tag">{{ tag }}</span>
    </header>
    <div class="code-row">
      <span class="code-label">标答</span>
      <span class="code-values">
        <KeyChip :text="example.primary" variant="primary" />
      </span>
    </div>
    <div v-if="mainKeysDiff" class="code-row">
      <span class="code-label">主键组合</span>
      <span class="code-values">
        <KeyChip :text="example.mainKeys ?? ''" />
        <span class="code-note">默认组合，同样算对</span>
      </span>
    </div>
    <div v-if="extraVisible" class="code-row">
      <span class="code-label">兼容</span>
      <span class="code-values">
        <KeyChip :text="example.extra" variant="compat" />
        <span class="code-note">额外接受</span>
      </span>
    </div>
    <div class="code-row">
      <span class="code-label">接受</span>
      <span class="code-values">
        <KeyChip
          v-for="sequence in example.accepted"
          :key="sequence"
          :text="sequence"
          :variant="variantOf(sequence)"
        />
      </span>
    </div>
  </article>
</template>

<style scoped>
.code-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border: 1px solid var(--line-faint);
  border-radius: var(--r-md);
  background: var(--surface);
}
.code-card.is-compat {
  border-style: dashed;
}
.code-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 2px;
}
.code-syllable {
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 16px;
  font-weight: 800;
  letter-spacing: -0.01em;
  line-height: 1.2;
}
.code-tag {
  flex: none;
  padding: 2px 7px;
  border-radius: var(--r-pill);
  background: var(--brand-soft);
  color: var(--brand-ink);
  font-size: 10px;
  font-weight: 750;
  line-height: 1.5;
}
.is-compat .code-tag {
  background: var(--surface-3);
  color: var(--ink-3);
}
.code-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}
.code-label {
  flex: none;
  width: 52px;
  padding-top: 4px;
  color: var(--ink-4);
  font-size: 10.5px;
  font-weight: 650;
  line-height: 1.3;
}
.code-values {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.code-note {
  color: var(--ink-4);
  font-size: 10px;
  line-height: 1.4;
}
</style>
