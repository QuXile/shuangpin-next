/**
 * 练习展示模型：WordEntry / Syllable + 方案引擎 → Web 可直接渲染/判题的 PracticeWord。
 *
 * 展示约定（docs/ARCHITECTURE.md）：
 * - 键帽 = 方案主键序列（声母 1 枚 + 韵母 1 枚；飞键/多解只展示主键，判题接受全部序列）；
 * - 零声母音节全部键帽 role='final'，atomId='zero:xx'；
 * - j/q/x/y + u 的主键取 U 键（全拼写作 u）；n/l 后的 ü 取方案 ü 键。
 */
import type {
  AtomId,
  Initial,
  PracticeCap,
  PracticeSyllable,
  PracticeWord,
  SchemeEngine,
  Syllable,
  SyllableFinal,
  SyllableSpec,
  WordEntry,
  WordSyllable,
} from './types.ts'
import { normalizePinyin, toToneMarks } from './pinyin.ts'

function buildCaps(
  syllable: SyllableSpec,
  primary: readonly string[],
): PracticeCap[] {
  const zeroInitial = syllable.zeroInitial === true || syllable.initial === ''
  const caps: PracticeCap[] = primary.map((key, index) => ({
    key,
    role: !zeroInitial && index === 0 ? 'initial' : 'final',
    atomId: (zeroInitial
      ? `zero:${syllable.final}`
      : index === 0
        ? `initial:${syllable.initial}`
        : `final:${syllable.final}`) as AtomId,
  }))
  return caps
}

/** 单音节 → 展示模型（caps 基于主键序列；缺数据时显式抛错） */
export function buildPracticeSyllable(
  engine: SchemeEngine,
  syllable: WordSyllable | Syllable,
): PracticeSyllable {
  const zeroInitial = syllable.initial === '' || (syllable as Syllable).zeroInitial === true
  const spec: SyllableSpec = { initial: syllable.initial, final: syllable.final, zeroInitial }
  const accepted = engine.acceptedSequences(spec)
  const primary = engine.primarySequence(spec)
  if (primary.length === 0) {
    throw new Error(
      `方案「${engine.def.name}」缺少音节 ${syllable.initial || '零声母'}${syllable.final} 的键位数据`,
    )
  }
  const pinyin = normalizePinyin(syllable.pinyin)
  return {
    text: syllable.text,
    pinyin,
    pinyinTone: toToneMarks(pinyin, syllable.tone),
    initial: syllable.initial,
    final: syllable.final as SyllableFinal,
    zeroInitial,
    caps: buildCaps(spec, primary),
    accepted: accepted.map((sequence) => sequence.join('')),
  }
}

/** 单音节（一个字）→ PracticeWord：用于「单字练习」阶段与教学示例 */
export function buildPracticeWordFromSyllable(engine: SchemeEngine, syllable: Syllable): PracticeWord {
  const built = buildPracticeSyllable(engine, syllable)
  return {
    text: syllable.text || built.pinyinTone,
    chars: [built.text],
    syllables: [built],
    caps: built.caps,
  }
}

/** 词条 → PracticeWord（逐字展示 + 扁平键帽序列 + 判题用可接受键序列） */
export function buildPracticeWord(engine: SchemeEngine, word: WordEntry): PracticeWord {
  const syllables = word.syllables.map((syllable) => buildPracticeSyllable(engine, syllable))
  const practiceWord: PracticeWord = {
    text: word.text,
    chars: word.chars.length > 0 ? [...word.chars] : syllables.map((syllable) => syllable.text),
    syllables,
    caps: syllables.flatMap((syllable) => syllable.caps),
    freq: word.freq,
  }
  if (word.polyphone) practiceWord.polyphone = true
  return practiceWord
}

/** 便捷构造：声母 + 韵母 + 可选声调（数据管线/测试用） */
export function syllableOf(
  text: string,
  initial: Initial,
  final: SyllableFinal,
  pinyin: string,
  tone?: number,
): Syllable {
  const syllable: Syllable = { text, pinyin, initial, final, zeroInitial: initial === '' }
  if (tone !== undefined) syllable.tone = tone as Syllable['tone']
  return syllable
}
