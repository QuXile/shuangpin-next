/**
 * 全局键盘监听：统一注册/清理，内置 IME 组合输入与重复事件防护。
 * 所有页面级快捷键都必须通过本 composable 注册，禁止再直接 window.addEventListener('keydown')。
 */
import { onMounted, onScopeDispose, toValue, type MaybeRefOrGetter } from 'vue'

export interface KeyBinding {
  /** 精确键名（大小写不敏感），例如 'Enter' | 'Escape' | 'Backspace' | 'ArrowLeft' | 't' */
  key?: string
  /** 匹配任意单字母键（a-z）或分号（双拼 ing 键） */
  letter?: boolean
  alt?: boolean
  ctrl?: boolean
  meta?: boolean
  /** 仅当显式给出时才校验 Shift */
  shift?: boolean
  /** 目标为输入类元素时是否仍然触发 */
  allowInInput?: boolean
  /** 额外条件；返回 false 时不拦截事件 */
  when?: (event: KeyboardEvent) => boolean
  run: (event: KeyboardEvent) => void
}

const INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

function isEditableTarget(event: KeyboardEvent): boolean {
  const target = event.target
  if (!(target instanceof HTMLElement)) return false
  if (INPUT_TAGS.has(target.tagName)) return true
  return target.isContentEditable
}

function modifierMatches(event: KeyboardEvent, binding: KeyBinding): boolean {
  if ((binding.alt ?? false) !== event.altKey) return false
  if ((binding.ctrl ?? false) !== event.ctrlKey) return false
  if ((binding.meta ?? false) !== event.metaKey) return false
  if (binding.shift !== undefined && binding.shift !== event.shiftKey) return false
  return true
}

function keyMatches(event: KeyboardEvent, binding: KeyBinding): boolean {
  if (binding.letter) return /^[a-zA-Z;]$/.test(event.key)
  if (binding.key !== undefined) return event.key.toLowerCase() === binding.key.toLowerCase()
  return false
}

/**
 * @param bindings 绑定列表（支持 ref/getter，便于随状态变化）
 * @param enabled 是否启用（默认 true）
 */
export function useGlobalKeys(
  bindings: MaybeRefOrGetter<readonly KeyBinding[]>,
  enabled: MaybeRefOrGetter<boolean> = true,
): void {
  function onKeydown(event: KeyboardEvent): void {
    if (event.isComposing || event.keyCode === 229 || event.repeat) return
    if (!toValue(enabled)) return
    const editable = isEditableTarget(event)
    for (const binding of toValue(bindings)) {
      if (editable && binding.allowInInput !== true) continue
      if (!modifierMatches(event, binding)) continue
      if (!keyMatches(event, binding)) continue
      if (binding.when && !binding.when(event)) continue
      event.preventDefault()
      binding.run(event)
      return
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeydown))
  onScopeDispose(() => window.removeEventListener('keydown', onKeydown))
}
