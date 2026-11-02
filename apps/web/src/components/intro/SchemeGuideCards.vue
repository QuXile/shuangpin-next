<script setup lang="ts">
/** 方案选择指南卡片：固定介绍几套主流方案的适用场景。 */
defineProps<{ currentId: string }>()

interface SchemeGuideItem {
  id: string
  name: string
  tag: string
  pros?: string
  cons?: string
  placeholder?: boolean
}

const SCHEMES: readonly SchemeGuideItem[] = [
  { id: 'xiaohe', name: '小鹤双拼', tag: '社区最常见', pros: '教程与输入法支持最多，适合入门。', cons: '需适应 zh / ch / sh 改造键位。' },
  { id: 'weiruan', name: '微软双拼', tag: '系统内置', pros: 'Windows 自带，换设备最省配置。', cons: '分号参与部分韵母，快捷键需适应。' },
  { id: 'ziranma', name: '自然码', tag: '经典方案', pros: '资料多，键位与微软接近。', cons: '各输入法支持不如小鹤统一。' },
  { id: 'pinyinjiajia', name: '拼音加加', tag: '老牌兼容', pros: '布局接近自然码 / 微软，迁移成本低。', cons: '社区教程相对少。' },
  { id: 'sougou', name: '搜狗双拼', tag: '输入法内置', pros: '搜狗输入法自带，上手门槛低。', cons: '跨平台需确认是否内置。' },
  {
    id: 'explore',
    name: '自由探索',
    tag: '随时切换',
    pros: '先用顺手的方案开练；方案可随时在学习路线顶部切换，选错了也不影响进度。',
    placeholder: true,
  },
]
</script>

<template>
  <article
    v-for="item in SCHEMES"
    :key="item.id"
    class="scheme-guide-card"
    :class="{ 'is-current': item.id === currentId, 'is-placeholder': item.placeholder }"
  >
    <header>
      <b>{{ item.name }}</b>
      <span class="count-badge">{{ item.tag }}</span>
    </header>
    <p v-if="!item.placeholder" class="scheme-guide-pros"><span>适合</span>{{ item.pros }}</p>
    <p v-if="!item.placeholder" class="scheme-guide-cons"><span>注意</span>{{ item.cons }}</p>
    <p v-else class="scheme-guide-more">{{ item.pros }}</p>
  </article>
</template>

<style scoped>
.scheme-guide-card {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  padding: 10px 11px;
  border: 1px solid var(--line);
  border-radius: var(--r-control);
  background: var(--surface);
}
.scheme-guide-card.is-current {
  border-color: var(--brand);
  box-shadow: inset 0 0 0 1px var(--brand-line);
}
.scheme-guide-card.is-placeholder {
  border-style: dashed;
  border-color: var(--line-strong);
  background: var(--surface-2);
}
.scheme-guide-card.is-placeholder header b {
  color: var(--ink-3);
}
.scheme-guide-more {
  margin: 0;
  color: var(--ink-3);
  font-size: var(--text-sm);
  line-height: 1.6;
}
.scheme-guide-card header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.scheme-guide-card header b {
  color: var(--ink);
  font-size: var(--text-base);
}
.scheme-guide-card p {
  margin: 0;
  color: var(--ink-2);
  font-size: var(--text-sm);
  line-height: 1.5;
}
.scheme-guide-card p span {
  display: inline-block;
  min-width: 2.6em;
  color: var(--ink-4);
  font-size: var(--text-xs);
  font-weight: 750;
}
.scheme-guide-pros span {
  color: var(--success-strong);
}
.scheme-guide-cons span {
  color: var(--star);
}
@media (max-width: 640px) {
  .scheme-guide-card {
    padding: 11px 12px;
  }
}
</style>
