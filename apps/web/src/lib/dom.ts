/**
 * 键盘 / 指针输入的 DOM 守卫与焦点工具（唯一实现）。
 * 物理键盘管线（useKeyInput）、全局快捷键（useGlobalKeys）与页面级快捷键共用这里的判定，
 * 避免各页各写一份 isEditableTarget / IME 过滤 / 「交互元素不抢 Enter」。
 * 合法按键的归一化以 core normalizeKeyInput 为唯一口径。
 */
import { normalizeKeyInput } from '@shuangpin/core'

/** 输入类元素：字符输入与全局快捷键默认都应让路。 */
const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

/** 交互元素：页面级 Enter/Space 快捷键不应抢它们的默认行为。 */
const INTERACTIVE_SELECTOR = 'button, a[href], input, textarea, select, [role="button"]'

/** 事件目标是否为可编辑元素（input/textarea/select/contentEditable）。 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (EDITABLE_TAGS.has(target.tagName)) return true
  return target.isContentEditable
}

/** 事件目标是否为按钮/链接/输入类等「自身已处理键盘」的交互元素。 */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return target.closest(INTERACTIVE_SELECTOR) !== null
}

/** 输入法组合输入 / Android IME 的 keyCode 229 / 按住重复：都不应作为一次输入。 */
export function isImeOrRepeat(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229 || event.repeat
}

/** 合法输入键：单个字母（大小写不限）或分号（双拼 ing 键）。 */
export function isLetterKey(key: string): boolean {
  return normalizeKeyInput(key) !== null
}

/** 归一化单个输入键：去空白、转小写；非法返回 null（core 唯一规则）。 */
export function letterKeyOf(raw: string): string | null {
  return normalizeKeyInput(raw)
}

/** 聚焦元素；<select>/<input> 支持时尝试打开原生选择器（不支持则静默忽略）。 */
export function focusElement(target: Element | null | undefined): void {
  if (!(target instanceof HTMLElement)) return
  target.focus()
  const picker = target as HTMLElement & { showPicker?: () => void }
  if (typeof picker.showPicker !== 'function') return
  try {
    picker.showPicker()
  } catch {
    /* 浏览器要求用户手势或未实现：聚焦后仍可用方向键/回车选择 */
  }
}
