<script setup lang="ts">
import type { AtomId, LetterKey } from '@shuangpin/core'
import KeyboardMap from './KeyboardMap.vue'

withDefaults(
  defineProps<{
    rows: LetterKey[][]
    schemeName?: string
    highlightAtomIds?: readonly AtomId[]
    conceal?: boolean
    specialInitials?: readonly string[]
    legend?: boolean
    hiddenAtomIds?: readonly AtomId[]
    zeroInitials?: Readonly<Record<string, readonly string[]>>
    compatCodes?: Readonly<Record<string, readonly string[]>>
  }>(),
  {
    schemeName: '',
    highlightAtomIds: () => [],
    conceal: false,
    specialInitials: () => [],
    legend: true,
    hiddenAtomIds: () => [],
    zeroInitials: () => ({}),
    compatCodes: () => ({}),
  },
)
</script>

<template>
  <div class="keymap-dock" aria-label="键位图区">
    <KeyboardMap
      :rows="rows"
      :scheme-name="schemeName"
      :highlight-atom-ids="highlightAtomIds"
      :conceal="conceal"
      :special-initials="specialInitials"
      :legend="legend"
      :hidden-atom-ids="hiddenAtomIds"
      :zero-initials="zeroInitials"
      :compat-codes="compatCodes"
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
