<script setup lang="ts">
/** 地图键位图：直接复用课程 KeyboardMap；输入与按下反馈由 KeyboardMap 自己处理。 */
import type { AtomId, LetterKey } from '@shuangpin/core'
import KeyboardMap from '@/components/keyboard/KeyboardMap.vue'
import CardHeader from '@/components/common/CardHeader.vue'
import KeymapLegend from '@/components/keyboard/KeymapLegend.vue'

withDefaults(
  defineProps<{
    rows: LetterKey[][]
    specialInitials?: readonly string[]
    zeroInitials?: Readonly<Record<string, readonly string[]>>
    compatCodes?: Readonly<Record<string, readonly string[]>>
    freeAtomIds?: readonly AtomId[]
    schemeName: string
  }>(),
  { specialInitials: () => [], zeroInitials: () => ({}), compatCodes: () => ({}), freeAtomIds: () => [] },
)
</script>

<template>
  <section class="map-keymap panel">
    <CardHeader title="键位图">
      <template #title-extra>
        <KeymapLegend />
      </template>
      <span class="count-badge">{{ schemeName }}</span>
    </CardHeader>
    <div class="keymap-stage">
      <KeyboardMap
        :rows="rows"
        :special-initials="specialInitials"
        :zero-initials="zeroInitials"
        :compat-codes="compatCodes"
        :free-atom-ids="freeAtomIds"
        :legend="false"
      />
    </div>
  </section>
</template>

<style scoped>
.map-keymap {
  min-width: 0;
  padding: 0 16px 12px;
}





.keymap-stage {
  min-width: 0;
}
.keymap-stage :deep(.keyboard-map) {
  width: 100%;
  max-width: 100%;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
@media (max-width: 640px) {
  .map-keymap {
    padding: 0 10px 10px;
  }
}
</style>
