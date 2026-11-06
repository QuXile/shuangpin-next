<script setup lang="ts">
/** 课程技巧的记忆锚点行：声母/韵母/零声母 + 主键/兼用键 + 助记 + 同键示例字。 */
import { computed } from 'vue'
import type { AnchorView } from '@/lib/lessonView'

const props = defineProps<{ rows: readonly AnchorView[] }>()

interface AnchorRowView extends AnchorView {
  /** 展示用：标签/主键/兼用键一次性算好，模板不再每次渲染重新分配字符串与数组 */
  labelText: string
  primaryKey: string
  altKeysText: string
  showAnchors: boolean
}

const viewRows = computed<AnchorRowView[]>(() =>
  props.rows.map((row) => ({
    ...row,
    labelText: row.label.toUpperCase(),
    primaryKey: row.keys[0]?.toUpperCase() ?? '',
    altKeysText: row.keys.length > 1 ? row.keys.slice(1).map((key) => key.toUpperCase()).join(' / ') : '',
    showAnchors:
      row.anchors.length > 0 &&
      !row.mnemonic?.startsWith('同键韵母字：') &&
      !row.mnemonic?.startsWith('同键声母字：'),
  })),
)
</script>

<template>
  <div class="anchors-list">
    <div v-for="row in viewRows" :key="row.atomId" class="anchor-row">
      <span class="anchor-label" :class="`is-${row.type}`">{{ row.labelText }}</span>
      <span v-if="row.keys.length" class="anchor-key">
        <b>{{ row.primaryKey }}</b> 键
        <span v-if="row.keys.length > 1" class="anchor-alt">兼用 {{ row.altKeysText }}</span>
      </span>
      <span v-if="row.mnemonic" class="anchor-mnemonic">{{ row.mnemonic }}</span>
      <span v-if="row.showAnchors" class="anchor-chips">
        <span v-for="anchor in row.anchors" :key="anchor" class="anchor-chip">{{ anchor }}</span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.anchors-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.anchor-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 3px 8px;
  min-width: 0;
}
.anchor-label {
  flex: none;
  padding: 2px 8px;
  border-radius: var(--r-control);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: 800;
  line-height: 1.4;
}
.anchor-label.is-initial {
  color: var(--ini);
  background: color-mix(in srgb, var(--ini) 12%, transparent);
}
.anchor-label.is-final {
  color: var(--fin);
  background: color-mix(in srgb, var(--fin) 14%, transparent);
}
.anchor-label.is-zero {
  color: var(--brand-ink);
  background: var(--brand-soft);
}
.anchor-key {
  flex: none;
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: 650;
}
.anchor-key b {
  color: var(--brand);
  font-weight: 800;
}
.anchor-alt {
  margin-left: 5px;
  color: var(--ink-4);
  font-family: var(--font-ui);
  font-size: var(--text-xs);
}
.anchor-mnemonic {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--ink-2);
  font-size: var(--text-sm);
  font-weight: 600;
  overflow-wrap: anywhere;
}
.anchor-chips {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
}
.anchor-chip {
  padding: 1px 7px;
  border-radius: var(--r-control);
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink-3);
  font-size: var(--text-xs);
  line-height: 1.5;
}
@media (max-width: 1024px) {
  .anchor-mnemonic {
    flex-basis: 100%;
    width: 100%;
  }
}
</style>
