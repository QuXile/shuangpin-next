<script setup lang="ts">
withDefaults(defineProps<{ percent?: number }>(), { percent: 0 })
</script>

<template>
  <div class="progress-ring" :style="{ '--percent': percent }">
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <circle class="ring-track" cx="60" cy="60" r="52" />
      <circle class="ring-fill" cx="60" cy="60" r="52" />
    </svg>
    <div class="ring-text">
      <strong>{{ percent }}%</strong>
      <span>课程进度</span>
    </div>
  </div>
</template>

<style scoped>
.progress-ring {
  position: relative;
  width: 150px;
  height: 150px;
}
.progress-ring svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.ring-track,
.ring-fill {
  fill: none;
  stroke-width: 9;
}
.ring-track {
  stroke: var(--surface-3);
}
.ring-fill {
  stroke: var(--brand);
  stroke-linecap: round;
  stroke-dasharray: 326.7;
  stroke-dashoffset: calc(326.7 - (326.7 * var(--percent)) / 100);
  transition: stroke-dashoffset var(--dur-slow) var(--ease);
}
.ring-text {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
}
.ring-text strong {
  font-size: 30px;
  font-weight: 750;
  letter-spacing: -0.02em;
}
.ring-text span {
  font-size: var(--text-xs);
  color: var(--ink-3);
}
</style>
