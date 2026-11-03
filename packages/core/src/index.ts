/**
 * @shuangpin/core 公共入口。
 *
 * 纯 TS 领域层（8 个源文件）：
 *   types.ts    数据契约 + 运行期模型
 *   pinyin.ts   拼音 / 音节 / 知识点（atom）与匹配谓词
 *   scheme.ts   方案引擎 + free 集合 + 推荐码/兼容码分析
 *   selector.ts 确定性选词 + 随机原语
 *   session.ts  会话状态机 + 输入跟踪 + 练习展示模型
 *   lesson.ts   阶段计划/门槛/评分 + 组卷装配 + 课池派生
 *   training.ts 训练场范围过滤/文章解析/批次与文章装配
 *   progress.ts 课程解锁与进度规则
 *
 * 只导出 core 外有消费者的符号（web / scripts / 测试）。
 */
export type * from './types.ts'

// 拼音 / 知识点
export {
  INITIALS,
  FINALS,
  ZERO_INITIALS,
  splitPinyin,
  splitSyllable,
  toToneMarks,
  atomId,
  parseAtomId,
  atomDisplayLabel,
  parsePinyinToken,
  syllableFromPinyinToken,
  entryFromPinyin,
} from './pinyin.ts'

// 方案引擎
export {
  createSchemeEngine,
  freeAtomsOf,
  analyzeSchemeCodes,
  freeAtomIdsOf,
  isFreeAtom,
} from './scheme.ts'

// 会话状态机 + 展示模型 + 输入跟踪
export {
  createSession,
  applyKey,
  backspace,
  clearInput,
  resumeSession,
  sessionMetrics,
  normalizeKeyInput,
  hasInputError,
  cellKeyOf,
  keyErrorEntries,
  buildPracticeWord,
} from './session.ts'

// 课程生成与加载
export { buildUniversalCurriculum, hydrateCurriculum } from './curriculum.ts'
export type { StoredCurriculum } from './curriculum.ts'

// 阶段 / 评分 / 组卷 / 课池
export {
  PRACTICE_STAGES,
  KIND_STAGE_MIN_WORDS,
  lessonStages,
  lessonStageMinWords,
  stageGate,
  hintTierFor,
  buildSingleCharWords,
  buildWordStageWords,
  buildTutorialWords,
  buildLessonPool,
  buildAtomMemory,
  buildLessonCodeTips,
  CODE_TIP_RECOMMENDED_PREFIX,
  CODE_TIP_COMPAT_PREFIX,
  CODE_TIP_PREFIXES,
  evaluateLesson,
  describePassCriteria,
  accuracyTiers,
  speedTiers,
  tierOf,
} from './lesson.ts'

// 训练场
export {
  atomOptionsOf,
  freeTrainingAtoms,
  filterTrainingEntries,
  parseArticleText,
  buildTrainingBatch,
} from './training.ts'

// 课程进度
export {
  lessonState,
  canStartLesson,
  nextLessonId,
  currentLessonId,
  passedLessonCount,
} from './progress.ts'
