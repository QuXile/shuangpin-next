#!/usr/bin/env node
/**
 * 课程词池构建器：从共享词库为 40 课生成 300–500 词（5 套方案共用，以 xiaohe 课程为规范课程）。
 *
 * 生成规则：
 *   - WordEntry: tone ∈ 1..5、pinyin = initial+final、freqRank = 全量词表全局排名、polyphone 保留；
 *   - free/learn 来自 @shuangpin/core createSchemeEngine(xiaohe).diff()；
 *   - index 记录 sources { curriculum, dict } 与 pools-<12hex> 版本；
 *   - 单课保持单行压缩 JSON。
 *
 * 输入：data/raw/jieba-dict.txt、data/curriculum/xiaohe.curriculum.json、data/schemes/xiaohe.json
 * 输出：data/pools/<lessonId>.json + data/pools/index.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { pinyin } from 'pinyin-pro'
import {
  createSchemeEngine,
  FINALS,
  INITIALS,
  splitPinyin,
  toToneMarks,
} from '../../packages/core/src/index.ts'
import {
  ANCHORS_FILE,
  CURRICULUM_DIR,
  POOLS_DIR,
  POOLS_INDEX_FILE,
  SCHEME_DIR,
  readJSON,
  writeJSON,
  replaceDirAtomically,
  poolFileNames,
  poolsVersionOf,
  canonicalCurriculumVersion,
} from '../lib/data-contract.mjs'
import { loadDictionary, markPolyphone, toWordEntry, charTone, BLOCKED_POS, WORD_POLICY } from './lib/wordbank.mjs'
import { enumerateExampleSyllables } from '../lib/pool-examples.mjs'

const POLICY = WORD_POLICY
const TARGET = POLICY.pools?.targetWordsPerLesson ?? 500
const MIN_TARGET = POLICY.pools?.minWordsPerLesson ?? 300
const QUALITY_MAX_CHAR_RANK = POLICY.pools?.qualityMaxCharRank ?? 4000
const EXAMPLE_MAX_CHAR_RANK = POLICY.examples?.maxRepresentativeCharRank ?? 3000
const INTRO_SEED_WORDS = POLICY.intro?.seedWords ?? ['双拼']
const CURRICULUM_FILE = path.join(CURRICULUM_DIR, 'xiaohe.curriculum.json')
const SCHEME_FILE = path.join(SCHEME_DIR, 'xiaohe.json')


function main() {
  if (!fs.existsSync(CURRICULUM_FILE)) {
    throw new Error(`缺少 ${CURRICULUM_FILE}，请先运行 pnpm data:curriculum`)
  }
  const curriculum = readJSON(CURRICULUM_FILE)
  if (curriculum.lessons.length !== 40) throw new Error(`课程节点应为 40，实际 ${curriculum.lessons.length}`)
  const scheme = readJSON(SCHEME_FILE)
  const anchors = readJSON(ANCHORS_FILE)
  const engine = createSchemeEngine(scheme)
  const diff = engine.diff()
  const freeInitials = new Set(diff.freeInitials)
  const freeFinals = new Set(diff.freeFinals)

  const dictionary = loadDictionary()
  const { entries, posByText, singles, charRank, dictSha256 } = dictionary
  const isQuality = (word) =>
    !BLOCKED_POS.has(posByText.get(word.text)) && word.minCharRank <= QUALITY_MAX_CHAR_RANK

  // 单字池多音字风险：按 8000 词上下文统计每个汉字的读音集合（toneless pinyin）。
  const readingsByChar = new Map()
  for (const word of entries) {
    for (const syllable of word.syllables) {
      const readings = readingsByChar.get(syllable.text) ?? new Set()
      readings.add(syllable.pinyin)
      readingsByChar.set(syllable.text, readings)
    }
  }
  const isSingleReadingChar = (char) => (readingsByChar.get(char)?.size ?? 0) <= 1

  // 全局词使用计数：review/exam 池优先选低使用词，降低跨课重复。
  const globalWordUsage = new Map()

  // ── 原子判定 ────────────────────────────────────────────────
  function wordAtoms(word) {
    const atoms = []
    for (const syllable of word.syllables) {
      if (syllable.initial === '') atoms.push({ type: 'zero', atom: `zero:${syllable.final}` })
      else {
        atoms.push({ type: 'initial', atom: `initial:${syllable.initial}` })
        atoms.push({ type: 'final', atom: `final:${syllable.final}` })
      }
    }
    return atoms
  }

  function lessonState(lesson) {
    const focus = new Set(lesson.blockingAtoms)
    const learned = new Set([...lesson.prerequisites, ...lesson.focusAtoms])
    return { focus, learned }
  }

  /** 0 = 严格可练（未知阻塞原子全为本课 focus）；null = 不可用。 */
  function classifyWord(word, state) {
    const { focus, learned } = state
    let hit = false
    let unknown = 0
    for (const syllable of word.syllables) {
      if (syllable.initial === '') {
        const zeroAtom = `zero:${syllable.final}`
        if (!focus.has(zeroAtom) && !learned.has(zeroAtom)) return null
        continue
      }
      for (const atom of [`initial:${syllable.initial}`, `final:${syllable.final}`]) {
        if (focus.has(atom)) {
          hit = true
          continue
        }
        const free = atom.startsWith('initial:')
          ? freeInitials.has(syllable.initial)
          : freeFinals.has(syllable.final)
        if (!free && !learned.has(atom)) unknown += 1
      }
    }
    if (!hit) return null
    return unknown
  }

  function isKnownWord(word, state) {
    const { focus, learned } = state
    for (const syllable of word.syllables) {
      if (syllable.initial === '') {
        const zeroAtom = `zero:${syllable.final}`
        if (!focus.has(zeroAtom) && !learned.has(zeroAtom)) return false
        continue
      }
      if (!freeInitials.has(syllable.initial) && !learned.has(`initial:${syllable.initial}`)) return false
      if (!freeFinals.has(syllable.final) && !learned.has(`final:${syllable.final}`)) return false
    }
    return true
  }

  /** 本课是否以零声母为教学重点（规则课/含 zero 原子的复习课）。 */
  function hasZeroFocus(lesson) {
    return lesson.focusAtoms.some((atom) => atom.startsWith('zero:'))
  }

  function classifyChar(char, state, zeroFocus) {
    const syllable = char.syllables[0]
    if (!syllable) return false
    if (syllable.initial === '') {
      return zeroFocus && state.focus.has(`zero:${syllable.final}`)
    }
    const atoms = [`initial:${syllable.initial}`, `final:${syllable.final}`]
    if (!atoms.some((atom) => state.focus.has(atom))) return false
    return atoms.every(
      (atom) =>
        state.focus.has(atom) ||
        state.learned.has(atom) ||
        (atom.startsWith('initial:') ? freeInitials.has(syllable.initial) : freeFinals.has(syllable.final)),
    )
  }

  function isKnownChar(char, state, zeroFocus) {
    const syllable = char.syllables[0]
    if (!syllable) return false
    // 非零声母课：单字池不塞零声母字（避免挤占本课目标字）。
    if (syllable.initial === '') {
      const zeroAtom = `zero:${syllable.final}`
      return zeroFocus && (state.focus.has(zeroAtom) || state.learned.has(zeroAtom))
    }
    return (
      (freeInitials.has(syllable.initial) || state.learned.has(`initial:${syllable.initial}`)) &&
      (freeFinals.has(syllable.final) || state.learned.has(`final:${syllable.final}`))
    )
  }

  // ── 选择 ────────────────────────────────────────────────────
  const compareQualityThenFreq = (a, b) =>
    Number(isQuality(b)) - Number(isQuality(a)) ||
    b.freq - a.freq ||
    (a.text < b.text ? -1 : a.text > b.text ? 1 : 0)

  function pickPool(strict, target) {
    const picked = []
    for (const word of strict) {
      picked.push(word)
      if (picked.length >= target) break
    }
    return picked
  }

  /** review/exam：质量优先 + 全局低使用优先，保持每课 500 词并压低跨课重复。 */
  function pickReviewPool(strict, target) {
    const quality = []
    const other = []
    for (const word of strict) (isQuality(word) ? quality : other).push(word)
    const byUsageThenFreq = (a, b) =>
      (globalWordUsage.get(a.text) ?? 0) - (globalWordUsage.get(b.text) ?? 0) || b.freq - a.freq
    quality.sort(byUsageThenFreq)
    other.sort(byUsageThenFreq)
    return [...quality, ...other].slice(0, target)
  }

  function recordUsage(words) {
    for (const word of words) globalWordUsage.set(word.text, (globalWordUsage.get(word.text) ?? 0) + 1)
  }

  // 单字词条（用于单字池与教学示例）
  const charEntries = []
  for (const single of singles) {
    const entry = toWordEntry(single.text, single.freq, charRank, charRank.size)
    if (entry) charEntries.push(entry)
  }

  /**
   * 全量教学示例：按 lesson.focusAtoms 学习顺序，枚举所有包含该 focus 音节的合法音节
   * （anchors.syllableChars 为 404 音节全集），跨原子按 syllable 去重，每个音节一张卡。
   *   initial:X  → 按 FINALS 顺序（er 最后）枚举 X+final
   *   final:Y    → 按 ['', ...INITIALS] 顺序枚举 initial+Y
   *   zero:Z     → [Z]
   * 无数量上限；综合课覆盖全量约 404 张。
   */
  function makeExamples(lesson, syllableChars) {
    const examples = []
    for (const item of enumerateExampleSyllables(lesson, syllableChars)) {
      const { syllable, zeroExample } = item
      const candidates = syllableChars[syllable] ?? []
      // 示例代表字优先取常用字（rank ≤ EXAMPLE_MAX_CHAR_RANK），不足时按序回退。
      const char =
        candidates.find((candidate) => (charRank.get(candidate) ?? Infinity) <= EXAMPLE_MAX_CHAR_RANK) ??
        zeroExample?.char ??
        candidates[0]
      if (!char) continue
      const split = splitPinyin(syllable)
      if (!split) continue
      const tone = charTone(char) ?? zeroExample?.tone
      const pinyinText = `${split.initial}${split.final}`
      const example = {
        char,
        pinyin: pinyinText,
        pinyinTone: tone === undefined ? pinyinText : toToneMarks(pinyinText, tone),
        initial: split.initial,
        final: split.final,
      }
      if (tone !== undefined) example.tone = tone
      examples.push(example)
    }
    return examples
  }

  function buildLessonPool(lesson) {
    const state = lessonState(lesson)
    const focusValues = new Set(lesson.focusAtoms)
    const hasNonZeroFocus = [...focusValues].some(
      (atom) => atom.startsWith('initial:') || atom.startsWith('final:'),
    )
    if (lesson.kind === 'intro') {
      // 入门课：常用短词池；试打词来自 word-policy.json 的 intro.seedWords（数据配置）。
      const introWords = entries.filter((word) => isQuality(word) && word.length <= 3).slice(0, TARGET)
      for (const seed of INTRO_SEED_WORDS) {
        if (introWords.some((word) => word.text === seed)) continue
        const seedWord = entries.find((word) => word.text === seed)
        if (seedWord) introWords[introWords.length - 1] = seedWord
      }
      recordUsage(introWords)
      return { lessonId: lesson.id, words: introWords, chars: [], examples: [] }
    }

    const strict = []
    for (const word of entries) {
      // 专名/地名等 blocked POS 不进入任何词池。
      if (BLOCKED_POS.has(posByText.get(word.text))) continue
      const unknown = classifyWord(word, state)
      if (unknown === 0) strict.push(word)
    }
    const reviewLike = lesson.kind === 'review' || lesson.kind === 'exam'
    strict.sort(compareQualityThenFreq)
    let picked = reviewLike
      ? pickReviewPool(strict, Math.max(MIN_TARGET, TARGET))
      : pickPool(strict, Math.max(MIN_TARGET, TARGET))
    if (lesson.zeroExamples?.length && !hasNonZeroFocus) {
      const zeroWords = entries
        .filter(
          (word) =>
            !BLOCKED_POS.has(posByText.get(word.text)) &&
            word.syllables.some((syllable) => syllable.initial === ''),
        )
        .sort((a, b) => b.freq - a.freq)
      const merged = []
      const seen = new Set()
      for (const word of [...zeroWords, ...picked]) {
        if (seen.has(word.text)) continue
        seen.add(word.text)
        merged.push(word)
        if (merged.length >= Math.max(MIN_TARGET, TARGET)) break
      }
      picked = merged
    }
    if (picked.length === 0 && lesson.zeroExamples?.length) {
      const free = entries
        .filter((word) => isKnownWord(word, state))
        .sort((a, b) => Number(isQuality(b)) - Number(isQuality(a)) || b.freq - a.freq)
      picked = pickPool(free, Math.max(MIN_TARGET, TARGET))
    }
    if (
      lesson.kind === 'drill' &&
      lesson.focusAtoms.includes('final:ue') &&
      lesson.focusAtoms.includes('final:ve')
    ) {
      // ü 家族课同时教 final:v（n/l 后的 ü）与 üe/ve，词池需提供含 final:v 的词。
      const [minLength, maxLength] = lesson.wordPlan.lengthRange
      const vWords = entries
        .filter(
          (word) =>
            isQuality(word) &&
            word.length >= minLength &&
            word.length <= maxLength &&
            word.syllables.some((syllable) => syllable.final === 'v'),
        )
        .sort((a, b) => b.freq - a.freq)
      const merged = []
      const seen = new Set()
      for (const word of [...vWords.slice(0, 120), ...picked]) {
        if (seen.has(word.text)) continue
        seen.add(word.text)
        merged.push(word)
        if (merged.length >= Math.max(MIN_TARGET, TARGET)) break
      }
      picked = merged
    }
    recordUsage(picked)

    const zeroFocus = hasZeroFocus(lesson)
    const focusedChars = charEntries
      .filter((char) => classifyChar(char, state, zeroFocus))
      .sort((a, b) => b.freq - a.freq)
    const knownChars = charEntries
      .filter((char) => isKnownChar(char, state, zeroFocus))
      .sort((a, b) => b.freq - a.freq)
    const charPool = []
    const charSeen = new Set()
    const singleCharTarget = POLICY.pools?.singleChar?.targetPerLesson ?? 40
    const singleCharMin = POLICY.pools?.singleChar?.minPerLesson ?? 5
    const allowPolyphoneFallback = POLICY.pools?.singleChar?.allowPolyphoneFallback !== false
    const orderedChars = [...focusedChars, ...knownChars]
    // 第一轮：只用词表上下文中单读音的字；不足最低数量且允许回退时再补多音字。
    for (const char of orderedChars) {
      if (!isSingleReadingChar(char.text)) continue
      if (charSeen.has(char.text)) continue
      charSeen.add(char.text)
      charPool.push(char)
      if (charPool.length >= singleCharTarget) break
    }
    if (allowPolyphoneFallback && charPool.length < singleCharMin) {
      for (const char of orderedChars) {
        if (charSeen.has(char.text)) continue
        charSeen.add(char.text)
        charPool.push(char)
        if (charPool.length >= singleCharTarget) break
      }
    }
    if (lesson.zeroExamples?.length) {
      for (const example of lesson.zeroExamples) {
        if (charSeen.has(example.char)) continue
        charSeen.add(example.char)
        charPool.push({
          text: example.char,
          length: 1,
          freq: 10_000_000,
          syllables: [
            {
              text: example.char,
              pinyin: example.syllable,
              initial: '',
              final: example.syllable,
              tone: example.tone ?? 5,
            },
          ],
          chars: [example.char],
          minCharRank: charRank.get(example.char) ?? charRank.size,
        })
      }
    }
    return {
      lessonId: lesson.id,
      words: picked,
      chars: charPool,
      examples: makeExamples(lesson, anchors.syllableChars),
    }
  }

  const pools = []
  for (const lesson of curriculum.lessons) pools.push(buildLessonPool(lesson))

  // 多音字标记（池词共享同一批词条对象，统一标记后再落盘）
  const selectedWords = new Map()
  for (const pool of pools) for (const word of pool.words) selectedWords.set(word.text, word)
  for (const word of selectedWords.values()) markPolyphone(word)

  const generatedAt = new Date().toISOString()
  let summary = null
  replaceDirAtomically(POOLS_DIR, (tmpDir) => {
    const indexLessons = []
    const uniqueTexts = new Set()
    let totalEntries = 0
    for (const pool of pools) {
      const words = pool.words.map((word) => {
        const entry = {
          text: word.text,
          length: word.length,
          freq: word.freq,
          freqRank: word.freqRank,
          syllables: word.syllables,
          chars: word.chars,
          minCharRank: word.minCharRank,
        }
        if (word.polyphone) entry.polyphone = true
        return entry
      })
      const lesson = curriculum.lessons.find((item) => item.id === pool.lessonId)
      const doc = { lessonId: pool.lessonId, words, chars: pool.chars, examples: pool.examples }
      writeJSON(path.join(tmpDir, `${pool.lessonId}.json`), doc, { pretty: false })
      for (const word of words) uniqueTexts.add(word.text)
      totalEntries += words.length
      indexLessons.push({
        id: pool.lessonId,
        title: lesson?.title ?? pool.lessonId,
        kind: lesson?.kind ?? 'drill',
        words: words.length,
        chars: pool.chars.length,
        file: `${pool.lessonId}.json`,
      })
    }
    const dataVersion = poolsVersionOf(tmpDir, poolFileNames(tmpDir))
    const index = {
      dataVersion,
      generatedAt,
      sources: {
        curriculum: canonicalCurriculumVersion(),
        dict: dictSha256.slice(0, 12),
      },
      targetWordsPerLesson: TARGET,
      minWordsPerLesson: MIN_TARGET,
      totalEntries,
      uniqueWords: uniqueTexts.size,
      lessons: indexLessons,
    }
    writeJSON(path.join(tmpDir, 'index.json'), index)
    summary = { dataVersion, totalEntries, uniqueWords: uniqueTexts.size, lessons: indexLessons.length }
  })

  console.log(
    `[pools] ${summary.lessons} 课 / ${summary.totalEntries} 条 / ${summary.uniqueWords} 唯一词 · ` +
      `${summary.dataVersion} · sources=${JSON.stringify({ curriculum: canonicalCurriculumVersion(), dict: dictSha256.slice(0, 12) })}`,
  )
  if (!fs.existsSync(POOLS_INDEX_FILE)) throw new Error('词池 index 写入失败')
}

main()
