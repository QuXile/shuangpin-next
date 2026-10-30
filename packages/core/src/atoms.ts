/**
 * 知识点（Atom）与词/音节的匹配谓词：把课程焦点原子映射为「这个词是否练到它」。
 * 课程范围只包含具体键位知识点：initial / final / zero。
 */
import type { AtomId, PracticeWord, WordEntry } from './types.ts'
import { parseAtomId } from './pinyin.ts'

type MatchableWord = WordEntry | PracticeWord

/** 该知识点是否在本词中命中（含 rule 谓词） */
export function atomMatchesWord(atom: AtomId, word: MatchableWord): boolean {
  const ref = parseAtomId(atom)
  if (!ref) return false
  switch (ref.type) {
    case 'initial':
      return word.syllables.some((syllable) => syllable.initial === ref.key)
    case 'final':
      return word.syllables.some((syllable) => syllable.final === ref.key)
    case 'zero':
      return word.syllables.some((syllable) => syllable.initial === '' && syllable.final === ref.key)
    default:
      return false
  }
}

/** 本词命中的全部 focus 原子（保持 focus 顺序） */
export function focusHitsOf(word: MatchableWord, focusAtoms: readonly AtomId[]): AtomId[] {
  return focusAtoms.filter((atom) => atomMatchesWord(atom, word))
}
