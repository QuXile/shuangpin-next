/**
 * 鼠标/触摸点击后清除按钮类元素的焦点，避免之后按 Space/Enter 误触刚点过的按钮。
 * - 只处理指针产生的 click（detail > 0）；键盘激活（detail === 0）不处理，保留键盘焦点。
 * - 输入框、文本域、下拉框和勾选框不在此列，它们仍需要保留焦点继续编辑/勾选。
 */
import { onBeforeUnmount, onMounted } from 'vue'

const POINTER_CONTROL_SELECTOR = 'button, [role="button"], [role="tab"], a[href]'

function blurPointerActivatedControl(event: MouseEvent): void {
  if (event.detail === 0) return
  const target = event.target
  if (!(target instanceof Element)) return
  const control = target.closest(POINTER_CONTROL_SELECTOR)
  if (!(control instanceof HTMLElement)) return
  control.blur()
}

export function usePointerBlur(): void {
  onMounted(() => document.addEventListener('click', blurPointerActivatedControl))
  onBeforeUnmount(() => document.removeEventListener('click', blurPointerActivatedControl))
}
