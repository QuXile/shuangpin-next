<script setup lang="ts">
/**
 * 「全拼沿用」小胶囊：整组公共键位只显示这一个胶囊。
 * 颜色完全由所在 SetupCard 的 tone 变量决定，组件不维护独立配色。
 */
withDefaults(defineProps<{ selected?: boolean }>(), { selected: false })

const emit = defineEmits<{ toggle: [] }>()
</script>

<template>
  <button
    type="button"
    class="chip common-capsule"
    :class="{ 'is-selected': selected }"
    :aria-pressed="selected"
    title="全拼沿用的公共键位"
    @click="emit('toggle')"
  >
    全拼沿用
  </button>
</template>

<style scoped>
.common-capsule {
  font-family: var(--font-ui);
  font-weight: 700;
  letter-spacing: 0.02em;
}
</style>
