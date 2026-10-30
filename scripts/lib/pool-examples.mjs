/**
 * 教学示例音节枚举（builder 与 validate-all 共用，避免两套规则漂移）。
 *
 * 教学示例与词池规则：
 *   initial:X → 所有 initial==X 的合法音节，按 FINALS 顺序（er 最后）
 *   final:Y   → 所有 final==Y 的合法音节，按 ['', ...INITIALS] 顺序
 *   zero:Z    → [Z]
 * 跨原子按 syllable 去重；char 取 anchors.syllableChars，零声母缺失时回退 zeroExamples.char。
 */
import { FINALS, INITIALS } from '../../packages/core/src/index.ts'

const ZERO_FALLBACK = Symbol('zeroFallback')

/**
 * @param {object} lesson 课程（focusAtoms / zeroExamples）
 * @param {Record<string, string[]>} syllableChars anchors.syllableChars
 * @returns {{ syllable: string, isZero: boolean, zeroExample: object|null }[]}
 */
export function enumerateExampleSyllables(lesson, syllableChars) {
  const syllableSet = new Set(Object.keys(syllableChars ?? {}))
  const zeroBySyllable = new Map((lesson.zeroExamples ?? []).map((item) => [item.syllable, item]))
  const seen = new Set()
  const out = []
  for (const atom of lesson.focusAtoms ?? []) {
    const isZero = atom.startsWith('zero:')
    const candidates = []
    if (atom.startsWith('initial:')) {
      const initial = atom.slice(8)
      for (const final of [...FINALS, 'er']) candidates.push(`${initial}${final}`)
    } else if (atom.startsWith('final:')) {
      const final = atom.slice(6)
      for (const initial of ['', ...INITIALS]) candidates.push(`${initial}${final}`)
    } else if (isZero) {
      candidates.push(atom.slice(5))
    }
    for (const syllable of candidates) {
      if (seen.has(syllable)) continue
      if (!isZero && !syllableSet.has(syllable)) continue
      const zeroExample = isZero ? zeroBySyllable.get(syllable) ?? null : null
      const char = syllableChars[syllable]?.[0] ?? zeroExample?.char
      if (!char) continue
      seen.add(syllable)
      out.push({ syllable, isZero, zeroExample })
    }
  }
  return out
}

export { ZERO_FALLBACK }
