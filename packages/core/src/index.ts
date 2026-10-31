/**
 * @shuangpin/core 公共入口。
 *
 * 纯 TS 领域层：拼音拆分、方案引擎、练习展示模型、选词、阶段计划、评分、练习会话。
 * 不依赖 Vue/DOM/Node API，可供 Web / 小程序 / 桌面 / CLI 复用。
 */
export type * from './types.ts'

export {
  INITIALS,
  FINALS,
  ZERO_INITIALS,
  JQXY,
  normalizePinyin,
  detectTone,
  splitPinyin,
  splitSyllable,
  toToneMarks,
  parseAtomId,
  atomId,
  atomDisplayLabel,
} from './pinyin.ts'

export { createSchemeEngine } from './scheme.ts'

export { atomMatchesWord, focusHitsOf } from './atoms.ts'

export {
  buildPracticeWord,
  buildPracticeWordFromSyllable,
  buildPracticeSyllable,
  syllableOf,
} from './practice.ts'

export { selectWords, countFocusHits } from './selector.ts'
export { sampleBalancedTargets, calibrateBalancedTargets } from './balancedSampling.ts'

export {
  lessonStages,
  lessonStageMinWords,
  KIND_STAGE_MIN_WORDS,
  stageGate,
  hintTierFor,
  buildSingleCharWords,
  buildWordStageWords,
  buildTutorialWords,
} from './stages.ts'
export type { StageInput, WordStageInput, TutorialInput } from './stages.ts'

export {
  evaluateLesson,
  describePassCriteria,
  accuracyTiers,
  speedTiers,
  tierOf,
} from './scoring.ts'
export type { MetricTier } from './scoring.ts'

export {
  filterTrainingEntries,
  parseArticleText,
  syllableInTrainingScope,
} from './training.ts'
export type { ParsedArticle, TrainingScope } from './training.ts'

export {
  createSession,
  applyKey,
  backspace,
  clearInput,
  appendSessionWords,
  resumeSession,
  sessionMetrics,
  normalizeKeyInput,
} from './session.ts'
export type { ExtendWordsOptions } from './session.ts'

export { mulberry32, shuffle, shuffleSeeded } from './random.ts'
