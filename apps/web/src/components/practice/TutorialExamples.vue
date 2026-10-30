<script setup lang="ts">
import type { AtomId, PracticeWord } from '@shuangpin/core'
import CharacterCard from './CharacterCard.vue'

withDefaults(
  defineProps<{
    words: PracticeWord[]
    focusAtoms?: readonly AtomId[]
    focusBadge?: string
  }>(),
  { focusAtoms: () => [], focusBadge: '新' },
)
</script>

<template>
  <div class="example-grid">
    <CharacterCard
      v-for="(word, index) in words"
      :key="`${word.text}-${index}`"
      :char="word.chars[0] ?? word.text"
      :pinyin="word.syllables[0]?.pinyinTone ?? ''"
      :initial-text="word.syllables[0]?.initial ?? ''"
      :caps="word.syllables[0]?.caps ?? []"
      :input="[]"
      :focus-atoms="focusAtoms"
      :focus-badge="focusBadge"
      :tier="1"
      :show-input="false"
    />
    <p v-if="words.length === 0" class="example-empty">本课暂无示例</p>
  </div>
</template>

<style scoped>
.example-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  align-content: start;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  padding: 1px 4px 26px 1px;
  border-radius: var(--r-md);
  -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 24px), transparent 100%);
  mask-image: linear-gradient(to bottom, #000 calc(100% - 24px), transparent 100%);
  clip-path: inset(0 round var(--r-md));
}
.example-grid :deep(.char-card) {
  box-shadow: none;
  /* 示例卡比练习卡更紧凑：再次略降高度，内容保持垂直居中、上下留白对称 */
  aspect-ratio: 340 / 392;
  padding-top: 7px;
  padding-bottom: 7px;
  /* 全量示例（综合课可达 400+ 张）按需渲染，滚动时不卡顿 */
  content-visibility: auto;
  contain-intrinsic-size: 190px;
}
.example-empty {
  grid-column: 1 / -1;
  padding: 12px;
  color: var(--ink-3);
  font-size: var(--text-sm);
}
@media (max-width: 640px) {
  .example-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    overflow-y: visible;
  }
}
</style>
