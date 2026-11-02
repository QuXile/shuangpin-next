<script setup lang="ts">
/** 统一星级渲染：地图课程卡与阶段总结共用，颜色统一 --star。 */
withDefaults(
  defineProps<{
    stars: number
    max?: number
    size?: 'sm' | 'lg'
  }>(),
  { max: 3, size: 'sm' },
)
</script>

<template>
  <span
    class="star-rating"
    :class="`star-rating--${size}`"
    role="img"
    :aria-label="`${stars} 星`"
  >
    <span
      v-for="n in max"
      :key="n"
      class="star"
      :class="{ 'is-on': n <= stars }"
      aria-hidden="true"
    >★</span>
  </span>
</template>

<style scoped>
.star-rating {
  flex: none;
  display: flex;
  gap: 2px;
  color: var(--surface-3);
  line-height: 1;
}
.star-rating--sm {
  font-size: var(--text-base);
}
.star-rating--lg {
  font-size: var(--text-lg);
  gap: 4px;
}
.star.is-on {
  color: var(--star);
}
</style>
