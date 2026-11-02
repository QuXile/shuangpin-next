<script setup lang="ts">
/** 拼音基础页的解剖视觉：声母 + 韵母 + 声调拆分示意。 */
</script>

<template>
  <div class="anatomy-word">shuāng</div>
  <div class="anatomy-parts">
    <span class="anatomy-part is-initial"><b>sh</b><small>声母</small></span>
    <span class="anatomy-op" aria-hidden="true">+</span>
    <span class="anatomy-part is-final"><b>uang</b><small>韵母</small></span>
    <span class="anatomy-op" aria-hidden="true">+</span>
    <span class="anatomy-part is-tone"><b>ˉ</b><small>声调</small></span>
  </div>
  <p class="anatomy-caption">拼音音节 = 声母 + 韵母 + 声调</p>
</template>

<style scoped>
.anatomy-word {
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: var(--text-display-lg);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.1;
}
.anatomy-parts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.anatomy-part {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 14px;
  border: 1px solid var(--line);
  border-radius: var(--r-control);
  background: var(--surface);
}
.anatomy-part b {
  font-family: var(--font-mono);
  font-size: var(--text-lg);
  font-weight: 750;
  line-height: 1.2;
}
.anatomy-part small {
  color: var(--ink-4);
  font-size: var(--text-2xs);
  line-height: 1.4;
}
.anatomy-part.is-initial {
  border-color: var(--ini-soft);
  background: color-mix(in srgb, var(--ini) 8%, var(--surface));
}
.anatomy-part.is-initial b {
  color: var(--ini);
}
.anatomy-part.is-final {
  border-color: var(--fin-soft);
  background: color-mix(in srgb, var(--fin) 9%, var(--surface));
}
.anatomy-part.is-final b {
  color: var(--fin);
}
.anatomy-part.is-tone b {
  color: var(--brand-ink);
}
.anatomy-op {
  color: var(--ink-4);
  font-family: var(--font-mono);
  font-size: var(--text-md);
}
.anatomy-caption {
  color: var(--ink-3);
  font-size: var(--text-sm);
}
@media (max-width: 640px) {
  .anatomy-word {
    font-size: var(--text-xl);
  }
}
</style>
