/** 从统一 Lexicon 派生某一课所需的词/字/教学示例（不依赖每课独立词池）。 */
import { FINALS, INITIALS, toToneMarks, type LessonPool, type LessonDef } from '@shuangpin/core'
import type { LexiconFile } from './data'

type Example = LessonPool['examples'][number]

/**
 * 按 lesson.focusAtoms 枚举音节，并从 Lexicon 的全局音节示例表取代表字。
 * 规则与原构建器一致：initial 展开全部韵母；final 展开全部声母；zero 只取自身。
 */
export function buildLessonPool(lesson: LessonDef, lexicon: LexiconFile): LessonPool {
  const examples: Example[] = []
  const seen = new Set<string>()
  const zeroBySyllable = new Map((lesson.zeroExamples ?? []).map((item) => [item.syllable, item]))
  const add = (syllable: string, zero: boolean) => {
    if (seen.has(syllable)) return
    const example = lexicon.syllableExamples[syllable]
    const zeroExample = zero ? zeroBySyllable.get(syllable) : undefined
    if (example) examples.push(example)
    else if (zeroExample) {
      const syllable = zeroExample.syllable
      examples.push({
        char: zeroExample.char,
        pinyin: syllable,
        pinyinTone: zeroExample.tone === undefined ? syllable : toToneMarks(syllable, zeroExample.tone as 1 | 2 | 3 | 4 | 5),
        initial: '' as Example['initial'],
        final: syllable as Example['final'],
        ...(zeroExample.tone !== undefined ? { tone: zeroExample.tone } : {}),
      } as Example)
    } else return
    seen.add(syllable)
  }
  for (const atom of lesson.focusAtoms) {
    if (atom.startsWith('initial:')) {
      const initial = atom.slice('initial:'.length)
      for (const final of [...FINALS, 'er']) add(`${initial}${final}`, false)
    } else if (atom.startsWith('final:')) {
      const final = atom.slice('final:'.length)
      for (const initial of ['', ...INITIALS]) add(`${initial}${final}`, initial === '')
    } else if (atom.startsWith('zero:')) {
      add(atom.slice('zero:'.length), true)
    }
  }
  return {
    lessonId: lesson.id,
    words: lexicon.words,
    chars: lexicon.chars,
    examples,
  }
}
