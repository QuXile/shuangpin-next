<script setup lang="ts">
/** 课程 / 练习场四张顶卡的统一卡头：标题位置、字号和左右操作区完全一致。 */
defineProps<{ title: string }>()
</script>

<template>
  <header class="card-header">
    <div class="card-header-main">
      <h2 class="panel-title">{{ title }}</h2>
      <slot name="title-extra" />
    </div>
    <div v-if="$slots.default" class="card-header-actions">
      <slot />
    </div>
  </header>
</template>

<style scoped>
.card-header {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  height: 58px;
  padding: 0;
}
.card-header-main {
  display: flex;
  align-items: center;
  gap: 15px;
  min-width: 0;
}
.card-header-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
