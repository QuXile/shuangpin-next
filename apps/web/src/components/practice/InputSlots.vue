<script setup lang="ts">
import { computed } from 'vue'
import type { PracticeCap } from '@shuangpin/core'

const props = withDefaults(
  defineProps<{
    caps: PracticeCap[]
    input: string[]
    state?: 'idle' | 'wrong' | 'correct'
  }>(),
  { state: 'idle' },
)

const slots = computed(() =>
  props.caps.map((_cap, index) => ({
    typed: props.input[index] ?? '',
    filled: index < props.input.length,
  })),
)
</script>

<template>
  <div class="input-slots" :class="`is-${state}`" aria-hidden="true">
    <span v-for="(slot, index) in slots" :key="index" class="input-slot" :class="{ 'is-filled': slot.filled }">
      {{ slot.filled ? slot.typed.toUpperCase() : '' }}
    </span>
  </div>
</template>

<style scoped>
.input-slots {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  margin-top: 4px;
  min-height: 18cqw;
}
.input-slot {
  width: 21.5cqw;
  height: 20cqw;
  border-radius: 4cqw;
  display: grid;
  place-items: center;
  font-family: var(--font-mono);
  font-size: 9.5cqw;
  font-weight: 700;
  color: var(--brand-ink);
  background: var(--brand-soft);
  border: 1px dashed var(--line-strong);
  transition: background var(--dur-fast), border-color var(--dur-fast), color var(--dur-fast);
}
.input-slot.is-filled {
  color: var(--brand-ink);
  background: var(--surface);
  border-style: solid;
  border-color: var(--brand-soft-2);
  box-shadow: 0 2px 0 var(--brand-soft-2);
}
.input-slots.is-wrong .input-slot {
  color: var(--danger);
  background: var(--danger-soft);
  border-color: var(--danger-line);
  border-style: solid;
}
.input-slots.is-correct .input-slot {
  color: var(--state-success-ink);
  background: var(--success-soft);
  border-color: var(--success-strong);
  border-style: solid;
}
</style>
