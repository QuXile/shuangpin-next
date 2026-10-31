<script setup lang="ts">
import type { AtomId, LetterKey } from '@shuangpin/core'
import KeyboardMap from './KeyboardMap.vue'

withDefaults(
  defineProps<{
    rows: LetterKey[][]
    highlightAtomIds?: readonly AtomId[]
    pressed?: readonly string[]
    conceal?: boolean
    specialInitials?: readonly string[]
    legend?: boolean
    hiddenAtomIds?: readonly AtomId[]
  }>(),
  {
    highlightAtomIds: () => [],
    pressed: () => [],
    conceal: false,
    specialInitials: () => [],
    legend: true,
    hiddenAtomIds: () => [],
  },
)

const emit = defineEmits<{
  key: [letter: string]
  backspace: []
}>()
</script>

<template>
  <div class="keymap-dock" aria-label="键位图区">
    <KeyboardMap
      :rows="rows"
      :highlight-atom-ids="highlightAtomIds"
      :pressed="pressed"
      :conceal="conceal"
      :special-initials="specialInitials"
      :legend="legend"
      :hidden-atom-ids="hiddenAtomIds"
      @key="emit('key', $event)"
      @backspace="emit('backspace')"
    />
  </div>
</template>

<style scoped>
.keymap-dock {
  flex: none;
  width: 100%;
  padding: 12px var(--page-pad-x) 14px;
  border-top: 1px solid var(--line-faint);
  background: color-mix(in srgb, var(--bg) 96%, var(--surface));
}
.keymap-dock :deep(.keyboard-map) {
  max-width: 900px;
  margin: 0 auto;
  box-shadow: var(--shadow-sm);
}
@media (max-width: 640px) {
  .keymap-dock {
    padding: 8px var(--page-pad-x) calc(10px + env(safe-area-inset-bottom));
  }
  .keymap-dock :deep(.kbd-legend) {
    display: none;
  }
}
</style>
