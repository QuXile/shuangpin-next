<script setup lang="ts">
/**
 * 文本 → 双拼键帽（方案名 / 练习场）。
 * 逻辑全部来自 lib/keyboardView 纯函数；本组件只负责轮次状态机、声音与动效。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createSchemeEngine, type SchemeDef } from '@shuangpin/core'
import { isFallbackCaps, keycapsOf, scatterLayout, splitKeycapLines } from '@/lib/keyboardView'
import { useSoundStore } from '@/stores/sound'
import { useKeyInput } from '@/composables/useKeyInput'

const props = withDefaults(
  defineProps<{
    scheme: SchemeDef
    text: string
    /** 练习页强制单行展示（不参与优先分行）。 */
    singleRow?: boolean
    /** 键帽是否跟随鼠标轻微浮动（触屏与 reduced-motion 下自动关闭）。 */
    pointerMotion?: boolean
  }>(),
  { pointerMotion: true },
)
const sound = useSoundStore()

const engine = computed(() => createSchemeEngine(props.scheme))
const specs = computed(() => keycapsOf(props.text, engine.value))
const caps = computed(() => specs.value.map((spec) => spec.key))
const rows = computed(() => splitKeycapLines(specs.value, { singleRow: props.singleRow }))
const isErrorCaps = computed(() => isFallbackCaps(specs.value))

const rootRef = ref<HTMLElement | null>(null)
/** 指针相对键帽区中心的归一化位置（-1..1），null 表示指针已离开 */
const pointer = ref<{ x: number; y: number } | null>(null)
const hoverIndex = ref(-1)
let pointerRaf = 0
let pendingPoint: { x: number; y: number } | null = null

const reducedMotion = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false

function applyPointer(): void {
  pointerRaf = 0
  const point = pendingPoint
  const el = rootRef.value
  if (!point || !el) return
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return
  pointer.value = {
    x: Math.max(-1, Math.min(1, ((point.x - rect.left) / rect.width) * 2 - 1)),
    y: Math.max(-1, Math.min(1, ((point.y - rect.top) / rect.height) * 2 - 1)),
  }
}

function onPointerMove(event: PointerEvent): void {
  if (!props.pointerMotion || event.pointerType !== 'mouse' || reducedMotion()) return
  pendingPoint = { x: event.clientX, y: event.clientY }
  if (pointerRaf === 0) pointerRaf = requestAnimationFrame(applyPointer)
}

function resetPointer(): void {
  pendingPoint = null
  if (pointerRaf !== 0) cancelAnimationFrame(pointerRaf)
  pointerRaf = 0
  pointer.value = null
  hoverIndex.value = -1
}

/** 单枚键帽的 transform：基础散落 + 指针视差 + 悬浮抬升。 */
function capStyle(index: number): Record<string, string> {
  const layout = layouts.value[index]
  if (!layout) return {}
  const motion = pointer.value
  const hovered = hoverIndex.value === index
  const depth = layout.depth
  const dx = layout.dx + (motion ? motion.x * 12 * depth : 0)
  const dy = layout.dy + (motion ? motion.y * 10 * depth : 0) - (hovered ? 3 : 0)
  const rot = layout.rot + (motion ? motion.x * 1.6 * depth : 0)
  const scale = hovered ? 1.03 : 1
  return {
    transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) rotate(${rot.toFixed(2)}deg) scale(${scale})`,
    zIndex: hovered ? '99' : layout.zIndex,
  }
}

const roundCaps = ref<string[]>([])
const doneFlags = ref<boolean[]>([])
const errorIndex = ref<number | null>(null)
const leaving = ref(false)
const roundNonce = ref(0)
const layouts = ref<ReturnType<typeof scatterLayout>>([])
const IDLE_REFRESH_MS = 5000

function randomizeLayout(): void {
  // 每次重新排布都重建键帽节点，确保浮现动画从头播放。
  roundNonce.value += 1
  layouts.value = scatterLayout(roundCaps.value)
}

let completeTimer: number | undefined
let resetTimer: number | undefined
let idleTimer: number | undefined

function clearTimers(): void {
  if (completeTimer !== undefined) window.clearTimeout(completeTimer)
  if (resetTimer !== undefined) window.clearTimeout(resetTimer)
  if (idleTimer !== undefined) window.clearTimeout(idleTimer)
  completeTimer = undefined
  resetTimer = undefined
  idleTimer = undefined
}

function armIdleRefresh(): void {
  if (idleTimer !== undefined) window.clearTimeout(idleTimer)
  idleTimer = undefined
  if (!doneFlags.value.some(Boolean) || leaving.value || errorIndex.value !== null) return
  idleTimer = window.setTimeout(() => {
    idleTimer = undefined
    if (leaving.value || errorIndex.value !== null) return
    leaving.value = true
    resetTimer = window.setTimeout(() => startRound(), 320)
  }, IDLE_REFRESH_MS)
}

function scheduleRestart(): void {
  if (idleTimer !== undefined) window.clearTimeout(idleTimer)
  idleTimer = undefined
  completeTimer = window.setTimeout(() => {
    leaving.value = true
    resetTimer = window.setTimeout(() => startRound(), 320)
  }, 420)
}

function pressKey(key: string): void {
  if (leaving.value || errorIndex.value !== null) return
  const normalized = key.toLowerCase()
  if (!/^[a-z;]$/.test(normalized)) return

  const index = doneFlags.value.findIndex((done) => !done)
  if (index < 0) return
  const expected = roundCaps.value[index]
  if (!expected || expected.toLowerCase() !== normalized) {
    // 第一个键错误时不进入失败流程：不标红、不重置。
    if (index === 0) {
      sound.playKey()
      return
    }
    // 已经答对过至少一个键后再错：当前应该敲的键帽变红，随后整组隐去，按原顺序重新开始。
    sound.playError()
    errorIndex.value = index
    scheduleRestart()
    return
  }

  sound.playKey()
  const next = [...doneFlags.value]
  next[index] = true
  doneFlags.value = next
  if (next.every(Boolean)) {
    sound.playComplete()
    scheduleRestart()
  } else {
    armIdleRefresh()
  }
}

/** 外部刷新键帽：重新随机排布，同时清空尚未完成的输入进度。 */
function refreshKeycaps(): void {
  clearTimers()
  leaving.value = false
  errorIndex.value = null
  doneFlags.value = roundCaps.value.map(() => false)
  randomizeLayout()
}

function startRound(): void {
  clearTimers()
  leaving.value = false
  errorIndex.value = null
  roundCaps.value = [...caps.value]
  doneFlags.value = caps.value.map(() => false)
  randomizeLayout()
}

watch(
  () => [props.scheme.id, props.text, caps.value.join(',')] as const,
  () => startRound(),
  { immediate: true },
)

useKeyInput((input) => {
  if (input.type === 'backspace') {
    // 地图/配置页没有判题处理器，退格仍保留按键反馈。
    sound.playKey()
    return
  }
  pressKey(input.key)
})

let resizeTimer: number | undefined
function onResize(): void {
  if (resizeTimer !== undefined) window.clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(refreshKeycaps, 120)
}

onMounted(() => {
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  clearTimers()
  resetPointer()
  if (resizeTimer !== undefined) window.clearTimeout(resizeTimer)
})

defineExpose({ refreshKeycaps })
</script>

<template>
  <div
    ref="rootRef"
    class="scheme-keycaps"
    :class="{ 'is-leaving': leaving, 'is-single-row': rows.length <= 1 }"
    role="group"
    :aria-label="`${text}键帽`"
    @pointermove="onPointerMove"
    @pointerleave="resetPointer"
    @pointercancel="resetPointer"
  >
    <div v-for="(row, rowIndex) in rows" :key="`${rowIndex}-${roundNonce}`" class="cap-row">
      <span
        v-for="(cap, index) in row.caps"
        :key="`${cap}-${index}`"
        class="keycap"
        :class="{
          'is-done': doneFlags[row.offset + index],
          'is-error': errorIndex === row.offset + index,
          'is-hovered': hoverIndex === row.offset + index,
        }"
        :style="[capStyle(row.offset + index), { animationDelay: `${(row.offset + index) * 26}ms` }]"
        @pointerenter="hoverIndex = row.offset + index"
        @pointerleave="hoverIndex = -1"
      >
        <b>{{ cap }}</b>
      </span>
    </div>
  </div>
</template>

<style scoped>
.scheme-keycaps {
  --cap: clamp(46px, 5.2vw, 88px);
  --cap-gap: 13px;
  transition: opacity var(--dur-mid) ease, transform var(--dur-mid) ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--cap-gap);
  width: 100%;
  min-width: calc(var(--cap) * 3 + 24px);
  /* 最多两行（10 个键帽）；单行时由 .is-single-row 收紧。 */
  min-height: calc(var(--cap) * 2.16 + var(--cap-gap));
  padding: 10px;
}
.cap-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.scheme-keycaps.is-single-row {
  min-height: calc(var(--cap) * 1.08);
}
.keycap {
  position: relative;
  flex: 0 0 auto;
  animation: cap-in var(--dur-slow) var(--ease) both;
  transition:
    transform var(--dur-mid) var(--ease),
    background var(--dur-mid) ease,
    border-color var(--dur-mid) ease,
    box-shadow var(--dur-mid) ease;
  width: var(--cap);
  height: calc(var(--cap) * 1.08);
  border: 1px solid var(--keycap-border);
  border-radius: calc(var(--cap) * 0.2);
  background: var(--keycap-face);
  box-shadow: var(--keycap-shadow);
  display: flex;
  align-items: center;
  justify-content: center;
}
.keycap.is-hovered {
  border-color: var(--brand-line);
  box-shadow: var(--keycap-shadow), 0 0 0 3px var(--brand-soft);
}
.keycap.is-done {
  border-color: var(--success);
  background: var(--success-soft);
  box-shadow: 0 6px 0 var(--success-line), 0 9px 16px var(--success-glow);
  animation: cap-correct var(--dur-slow) var(--ease);
}
.keycap.is-done b {
  animation: cap-letter-pop var(--dur-mid) var(--ease);
}
.keycap.is-done b {
  color: var(--success);
}
.keycap.is-error {
  border-color: var(--danger);
  background: var(--danger-soft);
  box-shadow: 0 6px 0 var(--danger-line), 0 9px 16px var(--danger-glow);
}
.keycap.is-error b {
  color: var(--danger);
  animation: cap-letter-shake var(--dur-mid) var(--ease);
}
.scheme-keycaps.is-leaving {
  opacity: 0;
  transform: translateY(-7px) scale(0.985);
}
@keyframes cap-in {
  from {
    opacity: 0;
    translate: 0 10px;
    scale: 0.96;
  }
  to {
    opacity: 1;
    translate: 0 0;
    scale: 1;
  }
}
@keyframes cap-correct {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--success) 30%, transparent), 0 6px 0 var(--success-line), 0 9px 16px var(--success-glow);
  }
  55% {
    box-shadow: 0 0 0 6px var(--success-glow), 0 6px 0 var(--success-line), 0 9px 16px var(--success-glow);
  }
  100% {
    box-shadow: 0 6px 0 var(--success-line), 0 9px 16px var(--success-glow);
  }
}
@keyframes cap-letter-pop {
  0% {
    transform: scale(0.82);
  }
  55% {
    transform: scale(1.12);
  }
  100% {
    transform: scale(1);
  }
}
@keyframes cap-letter-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-4px); }
  40% { transform: translateX(4px); }
  60% { transform: translateX(-3px); }
  80% { transform: translateX(2px); }
}
.keycap b {
  color: var(--ink);
  font-size: calc(var(--cap) * 0.5);
  font-weight: 850;
  line-height: 1;
  letter-spacing: 0.01em;
}
@media (max-width: 1024px) {
  .scheme-keycaps {
    --cap: clamp(46px, 12vw, 72px);
    min-height: 170px;
    gap: 10px;
  }
  .cap-row {
    gap: 10px;
  }
}
@media (max-width: 640px) {
  .scheme-keycaps {
    --cap: clamp(40px, 13vw, 58px);
    min-height: 140px;
  }
  .cap-row {
    gap: 8px;
  }
}
</style>
