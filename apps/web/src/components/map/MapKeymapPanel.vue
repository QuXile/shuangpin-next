<script setup lang="ts">
/** 地图键位图：直接复用课程 KeyboardMap；输入与按下反馈由 KeyboardMap 自己处理。 */
import type { LetterKey } from '@shuangpin/core'
import KeyboardMap from '@/components/keyboard/KeyboardMap.vue'
import CardHeader from '@/components/common/CardHeader.vue'

withDefaults(
  defineProps<{
    rows: LetterKey[][]
    specialInitials?: readonly string[]
    zeroInitials?: Readonly<Record<string, readonly string[]>>
    compatCodes?: Readonly<Record<string, readonly string[]>>
    schemeName: string
  }>(),
  { specialInitials: () => [], zeroInitials: () => ({}), compatCodes: () => ({}) },
)
</script>

<template>
  <section class="map-keymap panel">
    <CardHeader title="键位图">
      <template #title-extra>
        <div class="map-legend" aria-hidden="true">
          <span><i class="legend-dot initial" />声母</span>
          <span><i class="legend-dot final" />韵母</span>
        </div>
      </template>
      <span class="count-badge">{{ schemeName }}</span>
    </CardHeader>
    <div class="keymap-stage">
      <KeyboardMap
        :rows="rows"
        :special-initials="specialInitials"
        :zero-initials="zeroInitials"
        :compat-codes="compatCodes"
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
.map-legend {
  display: flex;
  align-items: center;
  gap: 15px;
  color: var(--ink-3);
  font-size: 11px;
}
.map-legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}
.legend-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 3px;
}
.legend-dot.initial {
  background: var(--focus-initial);
}
.legend-dot.final {
  background: var(--focus-final);
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
