<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import CardHeader from '@/components/common/CardHeader.vue'

const props = withDefaults(
  defineProps<{
    progressPercent: number
    passedCount: number
    lessonTotal: number
    chapterCount: number
    completedChapterCount: number
    wordCount: number
    canClear: boolean
    unlockedAll?: boolean
    preview?: boolean
  }>(),
  { unlockedAll: false, preview: false },
)

const emit = defineEmits<{
  'clear-progress': []
  'toggle-unlock': []
}>()

const started = computed(() => props.passedCount > 0)
const percentText = computed(() => (started.value ? String(props.progressPercent) : '--'))

const percentWrap = ref<HTMLElement | null>(null)
const percentSize = ref(64)
let observer: ResizeObserver | undefined

/** 数字撑满剩余空间：同时受可用高度和「数字位数 + 右侧标签」宽度约束。 */
function fitPercent(): void {
  const el = percentWrap.value
  if (!el) return
  const width = el.clientWidth
  const height = el.clientHeight
  if (width <= 0 || height <= 0) return
  if (!started.value) {
    // 尚未开始：`--` 只是占位，不应显示成两个大黑块。
    percentSize.value = Math.min(52, Math.max(36, Math.floor(height * 0.8)))
    return
  }
  const digits = Math.max(1, percentText.value.length)
  const labelSpace = 58
  const byHeight = height * 1.02
  const byWidth = (width - labelSpace) / (digits * 0.62)
  percentSize.value = Math.max(40, Math.floor(Math.min(byHeight, byWidth)))
}

onMounted(() => {
  observer = new ResizeObserver(fitPercent)
  if (percentWrap.value) observer.observe(percentWrap.value)
  void nextTick(fitPercent)
})
watch([() => props.progressPercent, () => props.passedCount], () => void nextTick(fitPercent))
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <aside class="learning-card panel" aria-label="学习进度">
    <CardHeader title="学习进度">
      <span v-if="preview" class="count-badge">仅支持练习</span>
      <div v-else class="progress-actions">
        <button
          class="meta-btn"
          type="button"
          :disabled="!canClear"
          aria-keyshortcuts="Alt+C"
          title="清除当前方案进度（Alt+C）"
          @click="emit('clear-progress')"
        >
          清除进度
          <kbd>Alt+C</kbd>
        </button>
        <button
          class="meta-btn is-accent"
          type="button"
          aria-keyshortcuts="Alt+U"
          :title="`${unlockedAll ? '恢复锁定' : '解锁全部课程'}（Alt+U）`"
          @click="emit('toggle-unlock')"
        >
          {{ unlockedAll ? '恢复锁定' : '解锁全部课程' }}
          <kbd>Alt+U</kbd>
        </button>
      </div>
    </CardHeader>

    <div ref="percentWrap" class="learning-percent-wrap" :style="{ '--percent-size': `${percentSize}px` }">
      <div class="learning-percent" :class="{ 'is-empty': !started }">
        <b>{{ percentText }}<span v-if="started">%</span></b>
        <span class="pct-label">已完成</span>
      </div>
    </div>

    <div class="learning-track" role="progressbar" :aria-valuenow="progressPercent" aria-valuemin="0" aria-valuemax="100">
      <i :style="{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }" />
    </div>

    <div class="learning-stats">
      <div><strong>{{ passedCount }}<small> / {{ lessonTotal }}</small></strong><span>通过课程</span></div>
      <div><strong>{{ completedChapterCount }}<small> / {{ chapterCount }}</small></strong><span>课程章节</span></div>
      <div><strong>{{ wordCount.toLocaleString('zh-CN') }}</strong><span>课程词汇</span></div>
    </div>
  </aside>
</template>

<style scoped>
.learning-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 0 22px 16px;
}
.progress-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.learning-percent-wrap {
  flex: 1 1 auto;
  min-height: 96px;
  display: flex;
  align-items: center;
  padding-top: 8px;
}
.learning-percent {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  color: var(--ink);
  font-size: var(--percent-size, 64px);
  font-weight: 900;
  letter-spacing: -0.065em;
  line-height: 0.9;
}
.learning-percent b {
  color: var(--ink);
  font: inherit;
}
.learning-percent b span {
  margin-left: 2px;
  color: var(--ink-3);
  font-size: 0.24em;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.learning-percent.is-empty {
  letter-spacing: 0.03em;
}
.learning-percent.is-empty b {
  color: var(--ink-3);
  font-weight: 800;
}
.pct-label {
  flex: none;
  color: var(--ink-3);
  font-size: 13px;
  font-weight: 750;
  letter-spacing: 0;
  line-height: 1.2;
  text-align: right;
  white-space: nowrap;
}
.learning-stats {
  flex: none;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding-top: 14px;
}
.learning-stats > div {
  min-width: 0;
  padding: 12px 10px;
  border-radius: var(--r-sm);
  background: var(--surface-2);
}
.learning-stats strong {
  display: block;
  color: var(--ink);
  font-size: 20px;
  font-weight: 850;
  line-height: 1.2;
  white-space: nowrap;
}
.learning-stats small {
  color: var(--ink-3);
  font-size: 12px;
  font-weight: 650;
}
.learning-stats span {
  display: block;
  margin-top: 6px;
  color: var(--ink-3);
  font-size: 12px;
  line-height: 1.4;
}
.learning-track {
  flex: none;
  height: 8px;
  margin-top: 10px;
  overflow: hidden;
  border-radius: var(--r-pill);
  background: var(--surface-3);
}
.learning-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--brand);
  transition: width var(--dur-slow) var(--ease);
}
@media (max-width: 1050px) {
  .learning-card {
    padding: 16px;
  }
  .learning-stats {
    gap: 6px;
  }
  .learning-stats > div {
    padding: 10px 8px;
  }
  .learning-stats strong {
    font-size: 18px;
  }
}
@media (max-width: 640px) {
  .learning-card {
    min-height: 260px;
    padding: 16px;
  }
  .learning-percent-wrap {
    min-height: 82px;
  }
  .learning-stats {
    padding-top: 14px;
  }
  .learning-stats > div {
    padding: 9px 7px;
  }
  .learning-stats strong {
    font-size: 17px;
  }
  .learning-stats span {
    font-size: 11px;
  }
}
</style>
