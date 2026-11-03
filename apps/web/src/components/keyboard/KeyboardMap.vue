<script setup lang="ts">
/**
 * 键位图（独立交互组件）：点击按键与物理键盘走同一套 useKeyInput 输入管线。
 * 视图模型来自 lib/keyboardView 纯函数；本组件只负责渲染与按下反馈。
 */
import { computed } from 'vue'
import type { AtomId, LetterKey } from '@shuangpin/core'
import { keyboardMapViewOf, type MappingTogglePayload } from '@/lib/keyboardView'
import { useKeyInput } from '@/composables/useKeyInput'
import MappingStrip from './MappingStrip.vue'
import KeymapLegend from './KeymapLegend.vue'

const props = withDefaults(
  defineProps<{
    rows: LetterKey[][]
    /** 键位图右上角显示当前双拼方案（底部 Dock 使用） */
    schemeName?: string
    /** 本课 focus：对应声母/韵母文字反白 + 底色强调 */
    highlightAtomIds?: readonly AtomId[]
    /** true = 无提示：隐藏全部映射、图例、零声母与兼容编码，只保留按键与按下反馈 */
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
    /** 与全拼一致的 free 原子：键位图不显示它们的映射标签 */
    freeAtomIds?: readonly AtomId[]
    /** 练习场配置页：映射标签可点击（切换出现范围 / 兼容编码显示） */
    interactiveMappings?: boolean
    /** 练习场：映射点击回调 */
    onMappingToggle?: (payload: MappingTogglePayload) => void
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
    freeAtomIds: () => [],
    interactiveMappings: false,
    onMappingToggle: undefined,
  },
)

const { pressedKeys, pressKey, pressBackspace } = useKeyInput()

const view = computed(() =>
  keyboardMapViewOf({
    rows: props.rows,
    highlightAtomIds: props.highlightAtomIds,
    conceal: props.conceal,
    specialInitials: props.specialInitials,
    hiddenAtomIds: props.hiddenAtomIds,
    zeroInitials: props.zeroInitials,
    compatCodes: props.compatCodes,
    freeAtomIds: props.freeAtomIds,
  }),
)

function toggleAtom(atomId: AtomId, event?: Event): void {
  if (!props.interactiveMappings || !props.onMappingToggle) return
  event?.stopPropagation()
  props.onMappingToggle({ kind: 'atom', atomId })
}

const showMappings = computed(() => view.value.showMappings)
const keyViews = computed(() => view.value.keyRows)
const zeroMappingItems = computed(() => view.value.zeroItems)
const compatMappingItems = computed(() => view.value.compatItems)
const pressedSet = computed(() => new Set(pressedKeys.value.map((key) => key.toLowerCase())))
</script>

<template>
  <div class="keyboard-map" :class="{ 'is-concealed': conceal }" role="group" aria-label="双拼键位图">
    <div v-if="(showMappings && legend) || schemeName" class="kbd-head">
      <KeymapLegend v-if="showMappings && legend" class="kbd-head-legend" />
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
        <span v-if="showMappings" class="key-initials">
          <span
            v-for="part in key.initialParts"
            :key="part.atomId"
            class="key-initial"
            :class="{ 'is-emphasized': part.emphasized, 'is-tappable': interactiveMappings }"
            :role="interactiveMappings ? 'button' : undefined"
            :tabindex="interactiveMappings ? 0 : undefined"
            :aria-pressed="interactiveMappings ? part.emphasized : undefined"
            @click="toggleAtom(part.atomId, $event)"
            @keydown.enter.stop.prevent="toggleAtom(part.atomId, $event)"
            @keydown.space.stop.prevent="toggleAtom(part.atomId, $event)"
          >{{ part.text }}</span>
        </span>
        <span v-if="showMappings" class="key-finals">
          <span
            v-for="part in key.finalParts"
            :key="part.atomId"
            class="key-final"
            :class="{ 'is-emphasized': part.emphasized, 'is-tappable': interactiveMappings }"
            :role="interactiveMappings ? 'button' : undefined"
            :tabindex="interactiveMappings ? 0 : undefined"
            :aria-pressed="interactiveMappings ? part.emphasized : undefined"
            @click="toggleAtom(part.atomId, $event)"
            @keydown.enter.stop.prevent="toggleAtom(part.atomId, $event)"
            @keydown.space.stop.prevent="toggleAtom(part.atomId, $event)"
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
    <MappingStrip
      v-if="showMappings && zeroMappingItems.length > 0"
      label="零声母"
      :items="zeroMappingItems"
      :interactive="interactiveMappings"
      :on-toggle="onMappingToggle"
    />
    <MappingStrip
      v-if="showMappings && compatMappingItems.length > 0"
      label="兼容编码"
      :items="compatMappingItems"
    />
  </div>
</template>

<style scoped>
.keyboard-map {
  width: 100%;
  max-width: 100%;
  margin: 0 auto;
  padding: 10px 16px 8px;
  border-radius: var(--r-panel);
  background: var(--surface);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-sm);
}
.kbd-row {
  --kbd-gap: 6px;
  display: flex;
  justify-content: center;
  gap: var(--kbd-gap);
  margin-top: 4px;
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
  border-radius: var(--r-control);
  background: var(--surface-2);
  border: 1px solid var(--line-strong);
  color: var(--ink);
  text-align: left;
  transition: background var(--dur-fast), border-color var(--dur-fast), transform var(--dur-press) var(--ease), box-shadow var(--dur-press);
  user-select: none;
  overflow: hidden;
}/* 无提示阶段只隐藏映射文字，不改变键帽外观。 */
.kbd-key:hover {
  background: var(--surface);
  border-color: var(--brand-line);
}
/* focus 键的紫色描边不能被 hover 的通用描边覆盖 */
.kbd-key.is-focused-initial:hover,
.kbd-key.is-focused-final:hover {
  border-color: var(--mapping-focus);
}
.kbd-key:focus-visible {
  outline: 2px solid var(--brand-line);
  outline-offset: 2px;
}
.kbd-key.is-pressed {
  transform: translateY(1.5px) scale(0.985);
  background: var(--success-soft);
  border-color: var(--success);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--success) 20%, transparent);
}
.kbd-key.is-focused-initial,
.kbd-key.is-focused-final {
  border-color: var(--mapping-focus);
  box-shadow: 0 0 0 3px var(--mapping-focus-soft);
}
.kbd-key.is-pressed.is-focused-initial,
.kbd-key.is-pressed.is-focused-final {
  border-color: var(--success);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--success) 20%, transparent);
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
  font-size: var(--text-md);
  font-weight: 600;
  line-height: 1;
  color: var(--ink-3);
}
.key-backspace-label {
  font-size: var(--text-2xs);
  font-weight: 650;
  line-height: 1.1;
  color: var(--ink-4);
}
.key-letter {
  position: absolute;
  top: 6px;
  left: 9px;
  font-family: var(--font-ui);
  font-size: var(--text-md);
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
  font-size: var(--text-sm);
  font-weight: 700;
  line-height: 1.15;
  color: var(--ini);
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
  font-size: var(--text-sm);
  font-weight: 500;
  line-height: 1.2;
  color: var(--fin);
}
.key-initial.is-tappable,
.key-final.is-tappable {
  cursor: pointer;
  border-radius: var(--r-xs);
  transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease),
    filter var(--dur-fast) var(--ease);
}
/* 普通映射：hover 用描边提示可点，不改变底色 */
.key-initial.is-tappable:not(.is-emphasized):hover,
.key-final.is-tappable:not(.is-emphasized):hover {
  outline: 1px solid var(--line-strong);
  outline-offset: 1px;
}
/* 已强调（选中）映射：hover/按下只做明暗反馈，保留角色色底与白字 */
.key-initial.is-emphasized.is-tappable:hover,
.key-final.is-emphasized.is-tappable:hover {
  filter: brightness(1.14);
}
.key-initial.is-tappable:active,
.key-final.is-tappable:active {
  filter: brightness(0.88);
}
.key-initial.is-tappable:focus-visible,
.key-final.is-tappable:focus-visible {
  outline: 2px solid var(--mapping-focus-line);
  outline-offset: 1px;
}
.key-initial.is-emphasized {
  color: var(--on-accent);
  background: var(--mapping-fill-initial);
  border-radius: var(--r-xs);
  padding: 0 5px;
}
.key-final.is-emphasized {
  color: var(--on-accent);
  background: var(--mapping-fill-final);
  border-radius: var(--r-xs);
  padding: 0 5px;
}
.kbd-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 20px;
  margin: 0 0 6px;
  padding: 0 2px;
}

/* 无提示阶段图例隐藏，但方案胶囊必须仍然靠右，不能掉到左上角。 */
.kbd-head > .count-badge {
  margin-left: auto;
}





/* 无提示模式也要显示按下反馈（覆盖 conceal 的默认底色/边框） */
.is-concealed .kbd-key.is-pressed,
.is-concealed .kbd-key--backspace.is-pressed {
  background: var(--success-soft);
  border-color: var(--success);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--success) 20%, transparent);
}
.is-concealed .kbd-key.is-pressed .key-letter,
.is-concealed .kbd-key--backspace.is-pressed .key-backspace,
.is-concealed .kbd-key--backspace.is-pressed .key-backspace-label {
  color: var(--ink);
}
@media (max-width: 640px) {
  .keyboard-map {
    padding: 10px 8px 8px;
  }
  .kbd-row {
    --kbd-gap: 4px;
    margin-top: 4px;
  }
  .key-backspace {
    font-size: var(--text-base);
  }
  .kbd-key {
    height: 46px;
    border-radius: var(--r-control);
  }
  .key-letter {
    top: 4px;
    left: 5px;
    font-size: var(--text-sm);
  }
  .key-initials {
    top: 4px;
    right: 4px;
  }
  .key-initial {
    font-size: var(--text-2xs);
  }
  .key-finals {
    right: 4px;
    bottom: 4px;
  }
  .key-final {
    font-size: var(--text-2xs);
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
  .kbd-head-legend {
    gap: 4px 10px;
  }
}
</style>
