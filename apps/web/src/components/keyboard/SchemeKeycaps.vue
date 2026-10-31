<script setup lang="ts">
/**
 * 文本 → 双拼键帽（方案名 / 练习场等）。
 * 文本中的汉字先取声母/韵母，再通过当前方案 engine 求实际按键；字母原样作为键帽。
 * 键帽可直接用物理键盘敲击：正确键变绿，全部完成后退场并换一组新的随机排布。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { atomId, createSchemeEngine, type SchemeDef } from '@shuangpin/core'
import { useSoundStore } from '@/stores/sound'

const props = withDefaults(
  defineProps<{
    scheme: SchemeDef
    text: string
    columns?: number
    /** Hero 预留的高度行数；练习场固定 1 行，路线固定 2 行 */
    fixedRows?: number
  }>(),
  { columns: undefined, fixedRows: 2 },
)
const sound = useSoundStore()

/** 键帽文本固定读音表；标题里出现的拉丁字母原样展示。 */
const CHAR_PINYIN: Record<string, [string, string]> = {
  小: ['x', 'iao'],
  鹤: ['h', 'e'],
  双: ['sh', 'uang'],
  拼: ['p', 'in'],
  自: ['z', 'i'],
  然: ['r', 'an'],
  码: ['m', 'a'],
  微: ['w', 'ei'],
  软: ['r', 'uan'],
  搜: ['s', 'ou'],
  狗: ['g', 'ou'],
  智: ['zh', 'i'],
  能: ['n', 'eng'],
  训: ['x', 'un'],
  练: ['l', 'ian'],
  场: ['ch', 'ang'],
  习: ['x', 'i'],
  音: ['y', 'in'],
  加: ['j', 'ia'],
  紫: ['z', 'i'],
  光: ['g', 'uang'],
  蓝: ['l', 'an'],
  天: ['t', 'ian'],
  白: ['b', 'ai'],
  云: ['y', 'un'],
  月: ['y', 'ue'],
  国: ['g', 'uo'],
  标: ['b', 'iao'],
  开: ['k', 'ai'],
  源: ['y', 'uan'],
  鹳: ['g', 'uan'],
  浪: ['l', 'ang'],
  韵: ['y', 'un'],
  块: ['k', 'uai'],
  星: ['x', 'ing'],
  空: ['k', 'ong'],
  大: ['d', 'a'],
  牛: ['n', 'iu'],
  键: ['j', 'ian'],
  道: ['d', 'ao'],
}

const engine = computed(() => createSchemeEngine(props.scheme))

const FALLBACK_CAPS = ['E', 'R', 'R', 'O', 'R'] as const

const caps = computed<string[]>(() => {
  const out: string[] = []
  let mappedChinese = false
  for (const char of props.text) {
    if (/^[A-Za-z]$/.test(char)) {
      out.push(char.toUpperCase())
      continue
    }
    const pinyin = CHAR_PINYIN[char]
    if (!pinyin) continue
    const [initial, final] = pinyin
    for (const id of [atomId('initial', initial), atomId('final', final)]) {
      const key = engine.value.keysForAtom(id)[0]
      if (key) {
        out.push(key.toUpperCase())
        mappedChinese = true
      }
      if (out.length >= 8) break
    }
    if (out.length >= 8) break
  }
  // C 双拼这类 syllable-code 方案没有可展开的声母/韵母，
  // 若方案名里的汉字一个键都生成不出来，用 5 个 ERROR 键帽兜底。
  return mappedChinese ? out : [...FALLBACK_CAPS]
})

const roundCaps = ref<string[]>([])
const doneFlags = ref<boolean[]>([])
const errorIndex = ref<number | null>(null)
const leaving = ref(false)
const roundNonce = ref(0)
const IDLE_REFRESH_MS = 8000

const isErrorCaps = computed(() => roundCaps.value.join('|') === FALLBACK_CAPS.join('|'))

const rows = computed<Array<{ offset: number; caps: string[] }>>(() => {
  const list = roundCaps.value
  if (list.length === 0) return []
  const perRow = isErrorCaps.value
    ? list.length
    : props.columns && props.columns > 0
      ? props.columns
      : list.length <= 4
        ? 2
        : 4
  return Array.from({ length: Math.ceil(list.length / perRow) }, (_, row) => ({
    offset: row * perRow,
    caps: list.slice(row * perRow, row * perRow + perRow),
  }))
})

interface CapLayout {
  transform: string
  zIndex: string
}

const layouts = ref<CapLayout[]>([])

/** 借鉴 Demo：每次渲染重新随机散落，带轻微旋转和层级。 */
function randomizeLayout(): void {
  // 每次重新排布都重建键帽节点，确保浮现动画从头播放。
  roundNonce.value += 1
  layouts.value = roundCaps.value.map((_, index) => {
    const dx = (Math.random() * 2 - 1) * 5
    const dy = (Math.random() * 2 - 1) * 7
    const rot = (Math.random() * 2 - 1) * 5
    return {
      transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(${rot.toFixed(1)}deg)`,
      // 保持原来的随机离位/旋转，只把层叠顺序固定成阅读顺序：
      // 同一行右侧键帽压住左侧，下一行压住上一行。
      zIndex: String(index + 1),
    }
  })
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

watch(() => caps.value.join(','), () => startRound(), { immediate: true })

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable))
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

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.ctrlKey || event.metaKey || event.altKey) return
  if (isEditableTarget(event.target)) return
  pressKey(event.key)
}

let resizeTimer: number | undefined
function onResize(): void {
  if (resizeTimer !== undefined) window.clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(refreshKeycaps, 120)
}

onMounted(() => {
  window.addEventListener('keydown', onWindowKeydown)
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown)
  window.removeEventListener('resize', onResize)
  clearTimers()
  if (resizeTimer !== undefined) window.clearTimeout(resizeTimer)
})

defineExpose({ refreshKeycaps, pressKey })
</script>

<template>
  <div
    class="scheme-keycaps"
    :class="{ 'is-leaving': leaving, 'is-single-row': fixedRows <= 1 }"
    :aria-label="`${text}键帽`"
  >
    <div v-for="(row, rowIndex) in rows" :key="`${rowIndex}-${roundNonce}`" class="cap-row">
      <span
        v-for="(cap, index) in row.caps"
        :key="`${cap}-${index}`"
        class="keycap"
        :class="{ 'is-done': doneFlags[row.offset + index], 'is-error': errorIndex === row.offset + index }"
        :style="[layouts[row.offset + index] ?? {}, { animationDelay: `${(row.offset + index) * 26}ms` }]"
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
  transition: opacity 220ms ease, transform 220ms ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--cap-gap);
  width: 100%;
  min-width: calc(var(--cap) * 3 + 24px);
  /* 默认预留两行高度；练习场通过 fixedRows=1 固定为一行。 */
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
  animation: cap-in 360ms var(--ease) both;
  transition: background 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
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
.keycap.is-done {
  border-color: var(--success);
  background: var(--success-soft);
  box-shadow: 0 6px 0 var(--state-success-line-strong), 0 9px 16px var(--success-glow);
  animation: cap-correct 340ms var(--ease);
}
.keycap.is-done b {
  animation: cap-letter-pop 300ms var(--ease);
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
  animation: cap-letter-shake 300ms var(--ease);
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
    box-shadow: 0 0 0 0 var(--success-glow-soft), 0 6px 0 var(--state-success-line-strong), 0 9px 16px var(--success-glow);
  }
  55% {
    box-shadow: 0 0 0 6px var(--success-glow), 0 6px 0 var(--state-success-line-strong), 0 9px 16px var(--success-glow);
  }
  100% {
    box-shadow: 0 6px 0 var(--state-success-line-strong), 0 9px 16px var(--success-glow);
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
@media (max-width: 800px) {
  .scheme-keycaps {
    --cap: clamp(46px, 12vw, 72px);
    min-height: 170px;
    gap: 10px;
  }
  .cap-row {
    gap: 10px;
  }
}
@media (max-width: 560px) {
  .scheme-keycaps {
    --cap: clamp(40px, 13vw, 58px);
    min-height: 140px;
  }
  .cap-row {
    gap: 8px;
  }
}
</style>
