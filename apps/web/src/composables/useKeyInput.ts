/**
 * 统一键输入管线：物理键盘与键位图点击产生同一种输入事件。
 *
 * - 应用只安装一次 window.keydown；
 * - pressedKeys 是全局共享的按下反馈；
 * - 输入层不播放声音，声音由键帽或当前页面按上下文负责；
 * - KeyboardMap / SchemeKeycaps / 页面练习处理器都订阅这里。
 */
import { onScopeDispose, readonly, ref } from 'vue'

export type KeyInputEvent =
  | { type: 'letter'; key: string }
  | { type: 'backspace' }

type KeyInputHandler = (event: KeyInputEvent) => void

const listeners = new Set<KeyInputHandler>()
const pressed = ref<string[]>([])
let pressTimer: number | undefined
let installed = false

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (EDITABLE_TAGS.has(target.tagName)) return true
  return target.isContentEditable
}

function normalizeLetter(raw: string): string | null {
  const key = raw.trim().toLowerCase()
  return /^[a-z;]$/.test(key) ? key : null
}

function flashPressed(key: string): void {
  pressed.value = [key]
  if (pressTimer !== undefined) window.clearTimeout(pressTimer)
  pressTimer = window.setTimeout(() => {
    pressed.value = []
  }, 160)
}

function dispatch(event: KeyInputEvent): void {
  flashPressed(event.type === 'backspace' ? 'backspace' : event.key)
  for (const listener of [...listeners]) listener(event)
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.isComposing || event.keyCode === 229 || event.repeat) return
  if (event.altKey || event.ctrlKey || event.metaKey) return
  if (isEditableTarget(event.target)) return

  let input: KeyInputEvent | null = null
  if (event.key === 'Backspace') {
    input = { type: 'backspace' }
  } else {
    const key = normalizeLetter(event.key)
    if (key) input = { type: 'letter', key }
  }
  if (!input) return

  event.preventDefault()
  dispatch(input)
}

function ensureInstalled(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('keydown', onWindowKeydown)
}

export function useKeyInput(handler?: KeyInputHandler) {
  ensureInstalled()
  if (handler) {
    listeners.add(handler)
    onScopeDispose(() => {
      listeners.delete(handler)
    })
  }

  return {
    pressedKeys: readonly(pressed),
    pressKey(raw: string): void {
      const key = normalizeLetter(raw)
      if (key) dispatch({ type: 'letter', key })
    },
    pressBackspace(): void {
      dispatch({ type: 'backspace' })
    },
  }
}
