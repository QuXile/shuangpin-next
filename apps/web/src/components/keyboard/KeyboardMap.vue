<script setup lang="ts">
/**
 * 键位图（独立交互组件）：点击按键与物理键盘走同一套 useKeyInput 输入管线。
 * 视图模型在 setup 里一次性预计算，渲染时不再重复遍历 atomIds。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { AtomId, LetterKey } from '@shuangpin/core'
import { parseAtomId } from '@shuangpin/core'
import { useKeyInput } from '@/composables/useKeyInput'

const props = withDefaults(
  defineProps<{
    rows: LetterKey[][]
    /** 键位图右上角显示当前双拼方案（底部 Dock 使用） */
    schemeName?: string
    /** 本课 focus：对应声母/韵母文字反白 + 底色强调 */
    highlightAtomIds?: readonly AtomId[]
    /** true = 词语/考核阶段：隐藏全部映射，只保留按键与按下反馈 */
    conceal?: boolean
    /** 需要显示在键位图上的「改造声母」（由 engine.diff().learnInitials 传入） */
    specialInitials?: readonly string[]
    legend?: boolean
    /** 练习页「练习时隐藏」：不渲染这些原子的声母/韵母映射标签 */
    hiddenAtomIds?: readonly AtomId[]
    /** 零声母映射：底部单独一行展示，最多 12 个 */
    zeroInitials?: Readonly<Record<string, readonly string[]>>
    /** 兼容编码表：整音节兼容拼写，底部零声母行下展示 */
    compatCodes?: Readonly<Record<string, readonly string[]>>
  }>(),
  {
    schemeName: '',
    highlightAtomIds: () => [],
    conceal: false,
    specialInitials: () => [],
    legend: true,
    hiddenAtomIds: () => [],
    zeroInitials: () => ({}),
    compatCodes: () => ({}),
  },
)

const { pressedKeys, pressKey, pressBackspace } = useKeyInput()

interface MappingPartView {
  text: string
  atomId: AtomId
  emphasized: boolean
}

interface KeyView {
  letter: string
  title: string
  initialParts: MappingPartView[]
  finalParts: MappingPartView[]
  focusedKind: 'initial' | 'final' | null
  hasBoth: boolean
}

const highlightSet = computed(() => new Set(props.highlightAtomIds))
const pressedSet = computed(() => new Set(pressedKeys.value.map((key) => key.toLowerCase())))
const specialSet = computed(() => new Set(props.specialInitials))
const hiddenAtomSet = computed(() => new Set(props.hiddenAtomIds))

const zeroViews = computed(() =>
  Object.entries(props.zeroInitials)
    .map(([final, keys]) => {
      const atom = `zero:${final}` as AtomId
      return {
        final,
        keys: keys.map((key) => key.toUpperCase()),
        atom,
        emphasized: highlightSet.value.has(atom),
      }
    })
    .filter((entry) => !hiddenAtomSet.value.has(entry.atom)),
)

const compatViews = computed(() =>
  Object.entries(props.compatCodes)
    .map(([syllable, codes]) => ({
      syllable,
      codes: codes.map((code) => Array.from(code.toUpperCase())),
    }))
    .filter((entry) => entry.codes.length > 0),
)
const compatLine = computed(() =>
  compatViews.value.map((entry) => `${entry.syllable} ${entry.codes.map((code) => code.join('')).join(' ')}`).join('  ·  '),
)
const compatContentRef = ref<HTMLElement | null>(null)
const compatOverflow = ref(false)
let compatResizeObserver: ResizeObserver | undefined

function measureCompatOverflow(): void {
  const el = compatContentRef.value
  if (!el) {
    compatOverflow.value = false
    return
  }
  compatOverflow.value = el.scrollWidth > el.clientWidth + 1
}

watch(
  compatViews,
  () => {
    void nextTick(() => {
      if (compatResizeObserver && compatContentRef.value) {
        compatResizeObserver.disconnect()
        compatResizeObserver.observe(compatContentRef.value)
      }
      measureCompatOverflow()
    })
  },
  { immediate: true, deep: true },
)

onMounted(() => {
  compatResizeObserver = new ResizeObserver(measureCompatOverflow)
  if (compatContentRef.value) compatResizeObserver.observe(compatContentRef.value)
  window.addEventListener('resize', measureCompatOverflow)
})
onBeforeUnmount(() => {
  compatResizeObserver?.disconnect()
  window.removeEventListener('resize', measureCompatOverflow)
})

const keyViews = computed<KeyView[][]>(() =>
  props.rows.map((row) =>
    row.map((key) => {
      const initialParts: MappingPartView[] = []
      const finalParts: MappingPartView[] = []
      for (const atomId of key.atomIds) {
        if (hiddenAtomSet.value.has(atomId)) continue
        const ref = parseAtomId(atomId)
        if (!ref) continue
        const part: MappingPartView = {
          text: ref.key,
          atomId,
          emphasized: highlightSet.value.has(atomId),
        }
        if (ref.type === 'initial' && specialSet.value.has(ref.key)) initialParts.push(part)
        else if (ref.type === 'final') finalParts.push(part)
      }
      const focusedParts = [...initialParts, ...finalParts].filter((part) => part.emphasized)
      const focusedKind = focusedParts.some((part) => initialParts.includes(part)) ? 'initial' : focusedParts.length > 0 ? 'final' : null
      const allParts = [...initialParts, ...finalParts]
      const title = props.conceal
        ? `按键 ${key.letter.toUpperCase()}`
        : allParts.length > 0
          ? `${key.letter.toUpperCase()}：${allParts.map((part) => part.text).join(' / ')}`
          : `按键 ${key.letter.toUpperCase()}`
      return {
        letter: key.letter,
        title,
        initialParts,
        finalParts,
        focusedKind,
        hasBoth: initialParts.length > 0 && finalParts.length > 0,
      }
    }),
  ),
)
</script>

<template>
  <div class="keyboard-map" :class="{ 'is-concealed': conceal }" aria-label="双拼键位图">
    <div v-if="(!conceal && legend) || schemeName" class="kbd-head">
      <div v-if="!conceal && legend" class="kbd-legend">
        <span class="legend-item"><i class="legend-swatch is-initial" />声母</span>
        <span class="legend-item"><i class="legend-swatch is-final" />韵母</span>
      </div>
      <span v-if="schemeName" class="count-badge">{{ schemeName }}</span>
    </div>
    <div v-for="(row, rowIndex) in keyViews" :key="rowIndex" class="kbd-row" :class="`kbd-row--${rowIndex}`">
      <button
        v-for="key in row"
        :key="key.letter"
        type="button"
        class="kbd-key"
        :class="{
          'is-pressed': pressedSet.has(key.letter),
          'is-focused-initial': key.focusedKind === 'initial',
          'is-focused-final': key.focusedKind === 'final',
          'has-both': key.hasBoth,
        }"
        :title="key.title"
        :aria-label="key.title"
        @click="pressKey(key.letter)"
      >
        <span class="key-letter">{{ key.letter.toUpperCase() }}</span>
        <span v-if="!conceal" class="key-initials">
          <span
            v-for="part in key.initialParts"
            :key="part.atomId"
            class="key-initial"
            :class="{ 'is-emphasized': part.emphasized }"
          >{{ part.text }}</span>
        </span>
        <span v-if="!conceal" class="key-finals">
          <span
            v-for="part in key.finalParts"
            :key="part.atomId"
            class="key-final"
            :class="{ 'is-emphasized': part.emphasized }"
          >{{ part.text }}</span>
        </span>
      </button>
      <!-- 退格键始终显示（教学页 / 练习 / 练习场共用同一套键位图） -->
      <button
        v-if="rowIndex === 2"
        type="button"
        class="kbd-key kbd-key--backspace"
        :class="{ 'is-pressed': pressedSet.has('backspace') }"
        title="退格"
        aria-label="退格"
        @click="pressBackspace()"
      >
        <span class="key-backspace" aria-hidden="true">⌫</span>
        <span class="key-backspace-label" aria-hidden="true">退格</span>
      </button>
    </div>
    <div v-if="!conceal && zeroViews.length > 0" class="kbd-zero-row" aria-label="零声母">
      <span class="kbd-zero-title">零声母</span>
      <div class="kbd-zero-list">
        <div class="kbd-zero-track">
          <span
            v-for="entry in zeroViews"
            :key="entry.final"
            class="kbd-zero"
            :class="{ 'is-emphasized': entry.emphasized }"
            :title="`${entry.final} → ${entry.keys.join(' ')}`"
          >
            <b>{{ entry.final }}</b>
            <span class="kbd-zero-keys">
              <kbd v-for="key in entry.keys" :key="key">{{ key }}</kbd>
            </span>
          </span>
        </div>
      </div>
    </div>
    <div
      v-if="!conceal && compatViews.length > 0"
      class="kbd-compat-row"
      tabindex="0"
      aria-label="兼容编码"
    >
      <span class="kbd-compat-title">兼容编码</span>
      <span ref="compatContentRef" class="kbd-compat-content" :title="compatOverflow ? compatLine : undefined">
        <span class="kbd-compat-track">
          <span v-for="entry in compatViews" :key="entry.syllable" class="kbd-zero">
            <b>{{ entry.syllable }}</b>
            <span class="kbd-zero-keys">
              <kbd v-for="(code, codeIndex) in entry.codes" :key="codeIndex" class="kbd-compat-code">
                <span v-for="(key, keyIndex) in code" :key="keyIndex">{{ key }}</span>
              </kbd>
            </span>
          </span>
        </span>
      </span>
      <span v-if="compatOverflow" class="kbd-compat-count">共 {{ compatViews.length }} 个</span>
      <span v-if="compatOverflow" class="kbd-compat-popup" aria-hidden="true">
        <span v-for="entry in compatViews" :key="entry.syllable" class="kbd-zero">
          <b>{{ entry.syllable }}</b>
          <span class="kbd-zero-keys">
            <kbd v-for="(code, codeIndex) in entry.codes" :key="codeIndex" class="kbd-compat-code">
              <span v-for="(key, keyIndex) in code" :key="keyIndex">{{ key }}</span>
            </kbd>
          </span>
        </span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.keyboard-map {
  width: 100%;
  max-width: 100%;
  margin: 0 auto;
  padding: 14px 16px 12px;
  border-radius: var(--r-lg);
  background: var(--surface);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-sm);
}
.kbd-zero-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 0 2px;
  min-width: 0;
}
.kbd-zero-title {
  flex: none;
  color: var(--ink-4);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.04em;
  white-space: nowrap;
}
.kbd-zero-list {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: thin;
}
.kbd-zero-track {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: max-content;
  min-width: 100%;
}
.kbd-zero {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 5px;
  border-radius: 5px;
  background: var(--surface);
  color: var(--ink-3);
  font-size: 10px;
  line-height: 1.4;
}
.kbd-zero b {
  color: var(--ink-2);
  font-weight: 700;
}
.kbd-zero kbd {
  padding: 0 3px;
  border: 0;
  background: var(--surface-3);
  font-size: 8px;
  line-height: 1.4;
}
.kbd-zero.is-emphasized {
  background: var(--state-info-bg, var(--brand-soft));
  color: var(--brand-ink);
  box-shadow: inset 0 0 0 1px var(--brand-line);
}
.kbd-compat-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  padding: 3px 2px;
  min-width: 0;
  border-radius: 5px;
}
.kbd-compat-row:focus-visible {
  outline: 2px solid var(--brand-line);
  outline-offset: 2px;
}
.kbd-compat-title {
  flex: none;
  color: var(--ink-4);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.04em;
  white-space: nowrap;
}
.kbd-compat-content {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--ink-3);
  font-size: 10px;
  line-height: 1.5;
}
.kbd-compat-track {
  display: flex;
  align-items: center;
  justify-content: safe center;
  gap: 6px;
  width: max-content;
  min-width: 100%;
  white-space: nowrap;
}
.kbd-compat-content .kbd-zero {
  gap: 3px;
}
.kbd-compat-content .kbd-zero-keys {
  gap: 2px;
}
.kbd-compat-code {
  display: inline-flex;
  gap: 1px;
  padding: 0 2px;
}
.kbd-compat-code + .kbd-compat-code {
  margin-left: 2px;
}
.kbd-compat-count {
  flex: none;
  color: var(--ink-4);
  font-size: 10px;
  white-space: nowrap;
}
.kbd-compat-popup {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  display: none;
  z-index: 50;
  padding: 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  box-shadow: var(--pop-shadow);
  pointer-events: auto;
  overscroll-behavior: contain;
}
.kbd-compat-popup .kbd-zero {
  gap: 3px;
}
.kbd-compat-row:hover .kbd-compat-popup,
.kbd-compat-row:focus-within .kbd-compat-popup {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 12px;
  align-content: flex-start;
  max-height: 240px;
  overflow-y: auto;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
}
.kbd-row {
  --kbd-gap: 6px;
  display: flex;
  justify-content: center;
  gap: var(--kbd-gap);
  margin-top: 6px;
}
.kbd-row:first-child {
  margin-top: 0;
}
.kbd-key {
  position: relative;
  flex: 0 0 auto;
  width: calc((100% - 9 * var(--kbd-gap)) / 10);
  min-width: 0;
  height: 60px;
  padding: 0;
  border-radius: 8px;
  background: var(--surface-2);
  border: 1px solid var(--line-strong);
  color: var(--ink);
  text-align: left;
  transition: background 100ms, border-color 100ms, transform 70ms var(--ease), box-shadow 70ms;
  user-select: none;
  overflow: hidden;
}
/* 遮挡阶段只隐藏映射文字，不改变键帽外观。 */
.kbd-key:hover {
  background: var(--surface);
  border-color: var(--brand-line);
}
.kbd-key:focus-visible {
  outline: 2px solid var(--brand-line);
  outline-offset: 2px;
}
.kbd-key.is-pressed {
  transform: translateY(1.5px) scale(0.985);
  background: var(--pressed-bg);
  border-color: var(--pressed-line);
  box-shadow: 0 0 0 3px var(--pressed-ring);
}
.kbd-key.is-focused-initial {
  border-color: var(--focus-initial);
  box-shadow: 0 0 0 3px var(--focus-initial-soft);
}
.kbd-key.is-focused-final {
  border-color: var(--focus-final);
  box-shadow: 0 0 0 3px var(--focus-final-soft);
}
.kbd-key.is-pressed.is-focused-initial,
.kbd-key.is-pressed.is-focused-final {
  border-color: var(--pressed-line);
  box-shadow: 0 0 0 3px var(--pressed-ring);
}
.kbd-key--backspace {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
}
.key-backspace {
  font-family: var(--font-ui);
  font-size: 16px;
  font-weight: 600;
  line-height: 1;
  color: var(--ink-3);
}
.key-backspace-label {
  font-size: 9.5px;
  font-weight: 650;
  line-height: 1.1;
  color: var(--ink-4);
}
.key-letter {
  position: absolute;
  top: 6px;
  left: 9px;
  font-family: var(--font-ui);
  font-size: 16px;
  font-weight: 700;
  line-height: 1;
  color: var(--ink);
}
.key-initials {
  position: absolute;
  top: 6px;
  right: 8px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
}
/* 同一键既有声母又有韵母时，把声母移到左下，避免和右侧韵母重叠。 */
.kbd-key.has-both .key-initials {
  top: 28px;
  left: 9px;
  right: auto;
  align-items: flex-start;
}
.key-initial {
  font-family: var(--font-mono);
  font-size: 12.5px;
  font-weight: 700;
  line-height: 1.15;
  color: var(--focus-initial);
}
.key-finals {
  position: absolute;
  right: 8px;
  bottom: 7px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
}
.key-final {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.2;
  color: var(--focus-final);
}
.key-initial.is-emphasized {
  color: var(--on-accent);
  background: var(--focus-initial);
  border-radius: 4px;
  padding: 0 5px;
}
.key-final.is-emphasized {
  color: var(--on-accent);
  background: var(--focus-final-strong);
  border-radius: 4px;
  padding: 0 5px;
}
.kbd-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 24px;
  margin: 0 0 10px;
  padding: 0 2px;
}
.kbd-head .kbd-legend {
  margin: 0;
}
/* 遮挡阶段图例隐藏，但方案胶囊必须仍然靠右，不能掉到左上角。 */
.kbd-head > .count-badge {
  margin-left: auto;
}
.kbd-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 16px;
  margin: 0 0 10px;
  padding: 0 2px;
  font-size: var(--text-xs);
  color: var(--ink-3);
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.legend-swatch {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  border: 1px solid var(--line);
}
.legend-swatch.is-initial {
  background: var(--focus-initial);
  border-color: var(--focus-initial);
}
.legend-swatch.is-final {
  background: var(--focus-final);
  border-color: var(--focus-final);
}
/* 全遮挡模式也要显示按下反馈（覆盖 conceal 的默认底色/边框） */
.is-concealed .kbd-key.is-pressed,
.is-concealed .kbd-key--backspace.is-pressed {
  background: var(--pressed-bg);
  border-color: var(--pressed-line);
  box-shadow: 0 0 0 3px var(--pressed-ring);
}
.is-concealed .kbd-key.is-pressed .key-letter,
.is-concealed .kbd-key--backspace.is-pressed .key-backspace,
.is-concealed .kbd-key--backspace.is-pressed .key-backspace-label {
  color: var(--ink);
}
@media (max-width: 760px) {
  .keyboard-map {
    padding: 10px 8px 8px;
  }
  .kbd-row {
    --kbd-gap: 4px;
    margin-top: 4px;
  }
  .key-backspace {
    font-size: 14px;
  }
  .kbd-key {
    height: 46px;
    border-radius: 8px;
  }
  .key-letter {
    top: 4px;
    left: 5px;
    font-size: 12px;
  }
  .key-initials {
    top: 4px;
    right: 4px;
  }
  .key-initial {
    font-size: 9.5px;
  }
  .key-finals {
    right: 4px;
    bottom: 4px;
  }
  .key-final {
    font-size: 9px;
  }
  /* 窄键帽上「声母 + 韵母」不能同时挤在下半区：韵母上移右侧，声母固定左下。 */
  .kbd-key.has-both .key-finals {
    top: 4px;
    bottom: auto;
    align-items: flex-end;
  }
  .kbd-key.has-both .key-initials {
    top: auto;
    bottom: 3px;
    left: 4px;
    right: auto;
    align-items: flex-start;
  }
  .kbd-head {
    margin-bottom: 8px;
  }
  .kbd-legend {
    gap: 4px 10px;
    font-size: 9px;
  }
}
</style>
