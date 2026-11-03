/**
 * 文章练习：把任意文本拆成逐字卡片，拼音由 pinyin-pro 实时解析（不依赖词库）。
 * 行结构仍按「每行 ≤5 个汉字」，无法解析为本应用音节的汉字标记为跳过。
 */
import type { ArticlePlan, PracticeWord, SchemeEngine } from '@shuangpin/core'
import { buildPracticeWord, parseArticleText, syllableFromPinyinToken } from '@shuangpin/core'
import { pinyinTokensOf } from './lexicon'

export interface ArticlePractice {
  plan: ArticlePlan
  words: PracticeWord[]
}

export async function buildArticlePractice(engine: SchemeEngine, text: string): Promise<ArticlePractice> {
  const parsed = parseArticleText(text)
  const parsedChars = parsed.chars
  const tokens = await pinyinTokensOf(parsedChars.join(''))

  const words: PracticeWord[] = []
  const wordIndexes: Array<number | null> = []
  for (let index = 0; index < parsedChars.length; index += 1) {
    const char = parsedChars[index]!
    const token = tokens[index]
    const syllable = token ? syllableFromPinyinToken(char, token) : null
    let wordIndex: number | null = null
    if (syllable) {
      try {
        const word = buildPracticeWord(engine, {
          text: char,
          length: 1,
          freq: 0,
          syllables: [syllable],
          chars: [char],
        })
        wordIndex = words.length
        words.push(word)
      } catch {
        wordIndex = null
      }
    }
    wordIndexes.push(wordIndex)
  }

  let cursor = 0
  const cells = parsed.lines.map((line) =>
    line.map((char) => ({ char, wordIndex: wordIndexes[cursor++] ?? null })),
  )
  return {
    plan: { cells, chars: parsedChars, skipped: wordIndexes.filter((value) => value === null).length },
    words,
  }
}
