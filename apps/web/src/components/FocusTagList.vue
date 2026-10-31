<script setup lang="ts">
import type { FocusAtomView } from '@/lib/lessonView'

defineProps<{ items: readonly FocusAtomView[] }>()
</script>

<template>
  <div class="focus-tag-list">
    <span
      v-for="item in items"
      :key="item.atomId"
      class="focus-tag"
      :class="`is-${item.type}`"
      :title="item.mnemonic || ''"
    >
      <span class="focus-badge" :class="item.badge === '新' ? 'is-new' : 'is-contained'">{{ item.badge }}</span>
      <span class="focus-label">{{ item.label }}</span>
      <template v-if="item.keys.length">
        <span class="focus-arrow" aria-hidden="true">→</span>
        <span class="focus-keys">
          <kbd v-for="key in item.keys" :key="key">{{ key.toUpperCase() }}</kbd>
        </span>
      </template>
    </span>
  </div>
</template>

<style scoped>
.focus-tag-list {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 6px;
  padding: 1px 4px 4px 1px;
  min-width: 0;
  scrollbar-width: thin;
}
.focus-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 5px 9px;
  border-radius: var(--r-control);
  border: 1px solid var(--line);
  background: var(--surface);
  font-size: 11px;
  color: var(--ink-2);
}
.focus-badge {
  flex: none;
  min-width: 18px;
  height: 18px;
  display: inline-grid;
  place-items: center;
  border-radius: 5px;
  font-size: 9px;
  font-weight: 800;
  line-height: 1;
}
.focus-badge.is-new {
  color: var(--on-accent);
  background: var(--brand);
}
.focus-badge.is-contained {
  color: var(--ink-3);
  background: var(--surface-3);
}
.focus-label {
  font-weight: 650;
  white-space: nowrap;
}
.focus-arrow {
  color: var(--ink-4);
}
.focus-keys {
  display: inline-flex;
  gap: 2px;
  white-space: nowrap;
}
.focus-keys kbd {
  min-width: 17px;
  height: 17px;
  display: inline-grid;
  place-items: center;
  padding: 0 4px;
  border: 1px solid var(--line);
  border-bottom-width: 2px;
  border-radius: 4px;
  background: var(--surface-2);
  color: var(--brand-ink);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}
</style>
