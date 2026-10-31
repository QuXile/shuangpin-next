<script setup lang="ts">
/** 全局快捷键面板：唯一展示所有上下文快捷键的入口，同时拦截页面快捷键。 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { SHORTCUT_GROUPS } from '@/lib/shortcuts'
import { useLayoutStore } from '@/stores/layout'

const layout = useLayoutStore()
const closeButton = ref<HTMLButtonElement | null>(null)
let previousFocus: HTMLElement | null = null

function close(): void {
  layout.closeShortcutHelp()
}

watch(
  () => layout.shortcutHelpVisible,
  async (open) => {
    if (open) {
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      await nextTick()
      closeButton.value?.focus()
    } else {
      previousFocus?.focus()
      previousFocus = null
    }
  },
)

function onKeydown(event: KeyboardEvent): void {
  if (!layout.shortcutHelpVisible) return
  if (event.key === 'Escape' || event.key === '?') {
    event.preventDefault()
    event.stopPropagation()
    close()
    return
  }
  if (event.key === 'Tab') {
    // 面板只有一个可聚焦元素：把 Tab 也留在面板内。
    event.preventDefault()
    event.stopPropagation()
    closeButton.value?.focus()
    return
  }
  // 阻止快捷键继续落到当前页面。
  event.stopPropagation()
}

onMounted(() => document.addEventListener('keydown', onKeydown, true))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown, true))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="layout.shortcutHelpVisible"
      class="shortcut-overlay"
      @click.self="close"
    >
      <section
        class="shortcut-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcut-help-title"
      >
        <header class="shortcut-head">
          <div>
            <p class="eyebrow">KEYBOARD MAP</p>
            <h2 id="shortcut-help-title">快捷键</h2>
          </div>
          <button ref="closeButton" class="shortcut-close" type="button" title="关闭（Esc）" @click="close">
            关闭
            <kbd>Esc</kbd>
          </button>
        </header>

        <div class="shortcut-groups thin-scroll">
          <section v-for="group in SHORTCUT_GROUPS" :key="group.title" class="shortcut-group">
            <h3>{{ group.title }}</h3>
            <ul>
              <li v-for="item in group.items" :key="`${group.title}-${item.label}`">
                <span class="shortcut-keys">
                  <kbd v-for="key in item.keys" :key="key">{{ key }}</kbd>
                </span>
                <span class="shortcut-label">{{ item.label }}</span>
              </li>
            </ul>
          </section>
        </div>

        <footer class="shortcut-foot">
          输入框聚焦时不会触发页面快捷键；所有其它控件都可以用 <kbd>Tab</kbd> 聚焦，<kbd>Enter</kbd> / <kbd>Space</kbd> 激活。
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.shortcut-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: color-mix(in srgb, var(--bg) 58%, transparent);
  backdrop-filter: blur(7px);
  animation: ui-fade-in 160ms var(--ease);
}
.shortcut-dialog {
  width: min(920px, 100%);
  max-height: min(760px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: var(--r-xl);
  background: var(--surface);
  box-shadow: var(--shadow-md);
  overflow: hidden;
  animation: ui-fade-up 200ms var(--ease);
}
.shortcut-head {
  flex: none;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 22px 16px;
  border-bottom: 1px solid var(--line-faint);
}
.shortcut-head h2 {
  margin: 4px 0 0;
  color: var(--ink);
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.03em;
}
.shortcut-close {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: var(--r-control);
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: var(--text-sm);
  font-weight: 650;
}
.shortcut-close:hover {
  border-color: var(--line-strong);
  color: var(--ink);
}
.shortcut-groups {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 22px 8px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 22px;
}
.shortcut-group {
  min-width: 0;
  break-inside: avoid;
}
.shortcut-group h3 {
  margin: 0 0 8px;
  color: var(--brand-ink);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.09em;
}
.shortcut-group ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.shortcut-group li {
  display: grid;
  grid-template-columns: minmax(92px, auto) minmax(0, 1fr);
  gap: 12px;
  align-items: baseline;
}
.shortcut-keys {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.shortcut-keys kbd {
  min-width: 24px;
  justify-content: center;
}
.shortcut-label {
  color: var(--ink-3);
  font-size: var(--text-sm);
  line-height: 1.55;
}
.shortcut-foot {
  flex: none;
  padding: 12px 22px 16px;
  border-top: 1px solid var(--line-faint);
  color: var(--ink-4);
  font-size: var(--text-xs);
  line-height: 1.7;
}
@media (max-width: 700px) {
  .shortcut-overlay {
    padding: 10px;
    align-items: flex-end;
  }
  .shortcut-dialog {
    max-height: calc(100vh - 20px);
  }
  .shortcut-head {
    padding: 16px;
  }
  .shortcut-groups {
    grid-template-columns: 1fr;
    padding: 14px 16px 6px;
  }
  .shortcut-foot {
    padding: 10px 16px 14px;
  }
}
</style>
