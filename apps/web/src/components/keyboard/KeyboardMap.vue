<script setup lang="ts">
/**
 * 键位图（纯展示）：视图模型在 setup 里一次性预计算，渲染时不再重复遍历 atomIds。
 */
import { computed } from 'vue'
import type { AtomId, LetterKey } from '@shuangpin/core'
import { parseAtomId } from '@shuangpin/core'

const props = withDefaults(
  defineProps<{
    rows: LetterKey[][]
    /** 本课 focus：对应声母/韵母文字反白 + 底色强调 */
    highlightAtomIds?: readonly AtomId[]
    pressed?: readonly string[]
    /** true = 词语/考核阶段：隐藏全部映射，只保留按键与按下反馈 */
    conceal?: boolean
    /** 需要显示在键位图上的「改造声母」（由 engine.diff().learnInitials 传入） */
    specialInitials?: readonly string[]
    legend?: boolean
    /** 退格键是否可用（tutorial/入门课显示但不可用） */
    backspaceDisabled?: boolean
    /** 是否在第三行末尾显示退格键（练习阶段显示，tutorial/intro 不显示） */
    showBackspace?: boolean
    /** 训练页「练习时隐藏」：不渲染这些原子的声母/韵母映射标签 */
    hiddenAtomIds?: readonly AtomId[]
  }>(),
  {
    highlightAtomIds: () => [],
    pressed: () => [],
    conceal: false,
    specialInitials: () => [],
    legend: true,
    showBackspace: false,
    hiddenAtomIds: () => [],
    backspaceDisabled: false,
  },
)

const emit = defineEmits<{
  key: [letter: string]
  backspace: []
}>()

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
const pressedSet = computed(() => new Set(props.pressed.map((key) => key.toLowerCase())))
const specialSet = computed(() => new Set(props.specialInitials))
const hiddenAtomSet = computed(() => new Set(props.hiddenAtomIds))

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
    <div v-if="!conceal && legend" class="kbd-legend">
      <span class="legend-item"><i class="legend-swatch is-initial" />声母</span>
      <span class="legend-item"><i class="legend-swatch is-final" />韵母</span>
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
        @click="emit('key', key.letter)"
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
      <button
        v-if="rowIndex === 2"
        type="button"
        class="kbd-key kbd-key--backspace"
        :class="{ 'is-pressed': pressedSet.has('backspace') }"
        title="退格"
        aria-label="退格"
        @click="emit('backspace')"
      >
        <span class="key-backspace" aria-hidden="true">⌫</span>
        <span class="key-backspace-label" aria-hidden="true">退格</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.keyboard-map {
  width: 100%;
  max-width: 100%;
  margin: 0 auto;
  padding: 12px 16px 10px;
  border-radius: var(--r-lg);
  background: var(--surface);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-sm);
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
  border-radius: 6px;
  background: var(--surface-2);
  border: 1.5px solid var(--line-strong);
  color: var(--ink);
  text-align: left;
  transition: background 100ms, border-color 100ms, transform 70ms var(--ease), box-shadow 70ms;
  user-select: none;
  overflow: hidden;
}
.kbd-key:hover {
  background: var(--surface);
  border-color: var(--brand);
}
.kbd-key.is-pressed {
  transform: translateY(1.5px);
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
  color: var(--ink-2);
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
.kbd-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 16px;
  margin: 0 0 9px;
  padding: 0 2px;
  font-size: 10.5px;
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
.is-concealed .kbd-key {
  background: var(--surface-2);
  border-color: var(--line);
}
.is-concealed .key-letter {
  color: var(--ink-3);
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
    border-radius: 4px;
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
  .kbd-legend {
    gap: 4px 10px;
    font-size: 9px;
  }
}
</style>
