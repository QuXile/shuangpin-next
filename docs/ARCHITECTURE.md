# 架构说明

[← 文档导航](../README.md#文档导航)

> 本文讲**结构与规则口径**：代码分层、模块边界、会话/评分/选词规则、数据契约。
> 数据的生产、同步与校验流程见[数据说明](DATA.md)，不在这里重复。

## 架构原则

- **领域规则唯一来源**：拼音、方案、判题、会话、阶段、评分、选词、训练场装配、课程解锁全部在 `packages/core`，是纯 TS、无框架 / DOM / Node 依赖的领域层；Web 不复制任何规则。
- **Web 只做编排与渲染**：数据加载、响应式状态、路由与输入事件、组件渲染；判题/统计/评分/解锁一律调用 core。
- **数据驱动**：19 套方案的键位、推荐码、兼容编码、课程内容全部来自 `data/`；代码不硬编码任何一套方案的键位，free / learn 划分由 `SchemeEngine` 现算。
- **公共 API 最小化**：`packages/core/src/index.ts` 只导出**有真实消费者**的符号（当前 52 个值导出，按模块分组见下）；类型契约从 `types.ts` 统一导出。内部模块（如 `selector.ts` 的随机原语）不透过包入口暴露，不为「未来扩展」预留导出。
- **单向数据流**：`data/`（唯一权威）→ `pnpm data:sync` → `apps/web/public/data/`（紧凑 JSON，gitignored）→ `lib/data.ts` 的 4 个 loader → core 纯函数 → stores / composables → 组件。
- **契约与校验分离**：`types.ts` 与真实 JSON 结构对齐；`scripts/lib/data-contract.mjs` 提供路径、原子写盘、内容 hash 与 JSON 深比较；`pnpm validate` 分五个域校验。

## 仓库结构

```text
apps/web/src/            App.vue / main.ts / router.ts
  pages/                 LearnMapPage / PracticePage / TrainingPage
  composables/           useSessionRuntime / usePractice / useTrainingSelection / useSchemeView /
                         useKeyInput / useGlobalKeys / useBottomDockContent / usePointerBlur / useResizeObserver
  components/            common / keyboard / layout / map / practice / intro / training
  stores/                course / progress / settings / sound / layout
  lib/                   data / lexicon / article / storage / dom / sessionSummary /
                         keyboardView / lessonView / trainingSelection / audio / shortcuts
  styles/                tokens.css + base.css（单一设计系统）
packages/core/src/       types / pinyin / scheme / session / lesson / selector / training / progress / index
packages/core/tests/     领域单元测试 + data/ 源数据契约测试
apps/web/tests/          Web 纯函数与 store 测试
data/                    schemes/index.json、schemes/<id>/{scheme,curriculum}.json、lexicon/lexicon.json
scripts/                 生成 / 同步 / 五域校验 / 静态包启动器 / UI 约定守卫
docs/                    文档（5 篇，统一入口见 README）
```

## 领域层（packages/core）

### 模块职责

| 文件 | 职责 |
|---|---|
| `types.ts` | 数据契约（index / scheme / curriculum / lexicon，与真实 JSON 对齐）+ 运行期模型（Practice / Session / Stage）；无死字段 |
| `pinyin.ts` | 拼音常量、规范化、音节拆分、声调显示、外部拼音 token → 规范音节、AtomId 与 atom / 词的匹配谓词 |
| `scheme.ts` | 方案引擎：判题、主键、键位图、free/learn 划分；编码分析（推荐码 / 兼容码）唯一口径 |
| `session.ts` | 会话状态机 + 输入跟踪（错误锁定 / 揭示 / keyErrors）+ 练习展示模型（键帽、可接受序列） |
| `lesson.ts` | 阶段计划与门槛、评分与星级、组卷装配、单课词池派生 |
| `selector.ts` | 确定性选词算法与随机原语（内部模块，由 `lesson.ts` 组卷调用） |
| `training.ts` | 练习场范围过滤、文章拆字、条目 → 练习词批次、方案键位选项 |
| `progress.ts` | 课程解锁与进度规则（课状态 / 当前课 / 下一课 / 已通过数） |
| `index.ts` | 公共入口：52 个值导出 + `types.ts` 类型契约 |

### 公共 API（52 个值导出，按模块分组）

```text
pinyin   (12)  INITIALS FINALS ZERO_INITIALS splitPinyin splitSyllable toToneMarks
               atomId parseAtomId atomDisplayLabel
               parsePinyinToken syllableFromPinyinToken entryFromPinyin
scheme    (5)  createSchemeEngine freeAtomsOf analyzeSchemeCodes isFreeAtom freeAtomIdsOf
session  (11)  createSession applyKey backspace clearInput resumeSession sessionMetrics
               normalizeKeyInput hasInputError cellKeyOf keyErrorEntries buildPracticeWord
lesson   (15)  PRACTICE_STAGES KIND_STAGE_MIN_WORDS lessonStages lessonStageMinWords
               stageGate hintTierFor buildSingleCharWords buildWordStageWords
               buildTutorialWords buildLessonPool evaluateLesson describePassCriteria
               accuracyTiers speedTiers tierOf
training  (5)  atomOptionsOf freeTrainingAtoms filterTrainingEntries parseArticleText
               buildTrainingBatch
progress  (5)  lessonState canStartLesson nextLessonId currentLessonId passedLessonCount
```

边界说明：
- `cellKeyOf` / `keyErrorEntries` 是 `SessionState` 的查询 helper：前者返回当前字稳定 key（`词下标:字下标`），后者把 `keyErrors` 的 `"实际按下|应为"` 编码解析为 `KeyErrorEntry[]`（次数降序）；Web 不再自行拆字符串。`KeyErrorEntry` 类型在 `types.ts`。
- `PRACTICE_STAGES` 是阶段顺序的唯一运行时值（`single → word → exam`），Web 持久化校验与训练场阶段选择共用；`KIND_STAGE_MIN_WORDS` 同时被课程模板 / 校验（scripts）消费。
- `isFreeAtom(engine, atomId)` / `freeAtomIdsOf(engine)` 收敛 free 判定与键位图展示，Web 不再各自手写；`freeAtomsOf` 为 **contract-only**（当前无生产消费者，保留为 free 规则契约）；`normalizeKeyInput` 由 Web 输入管线 `lib/dom.ts` 实际消费（输入规则唯一口径）。
- `SchemeEngine` 的方法（`acceptedSequences / primarySequence / judge / keysForAtom / diff / freeSets / compositionSequence / keyMap`）通过 `createSchemeEngine` 返回值使用，不单独导出。
- `selector.ts` 的 `selectWords / mulberry32 / shuffle / shuffleSeeded` 只服务 `lesson.ts` 组卷与训练批次，属内部实现；测试直接 import 模块文件。
- `pinyin.ts` 的规范化细节（`normalizePinyin / detectTone / isZeroSyllable`）是内部工具；外部只需要拆分结果与 AtomId 工具。
- 演进约束：**先有消费者，再加导出**；新增能力优先并入既有模块与既有函数参数，不新增「预留型」API。

### 拼音与知识点（pinyin.ts）

- 23 个规范声母（zh/ch/sh 为独立声母）、33 个规范韵母（ü 一律记 v，ue/ve 并存）、12 个零声母音节（含 er）；零声母是独立知识点 `zero:<音节>`，不占声母键，由方案给出完整两键序列。
- `j/q/x/y + ü`：标准主键取 `finals[u]`，V/其它 ü 键作为兼容码由方案数据显式给出；n/l 后的 ü 取方案 ü 键。非法音节在拆分阶段即被拒绝。
- 知识点统一 `AtomId = initial:<声母> | final:<韵母> | zero:<零声母音节>`；显示标签规则唯一：零声母加「零 」前缀，其余原样。
- 知识点命中严格按类型：`final:ao` 只命中带声母的 ao 音节，`zero:ao` 只命中零声母 ao。
- 声调符号由一张 vowel → 四声表派生 normalize / detect / 显示三条路径，不再维护多份手工映射。

### 方案引擎与编码分析（scheme.ts）

判题只有两层：

1. 命中 `recommended` 或 `compatCodes` 的完整键序列直接成功（兼容码是**额外接受**，不会禁用组合展开）；
2. 否则按 `initials[声母] × finals[韵母]` 组合匹配，命中任一组合即成功。

```text
acceptedSequences(syl)   全部可接受序列（零声母整段 / override / compat / 声母×韵母笛卡尔积），去重保序
primarySequence(syl)     展示主键：recommended → compat 首条 → 组合首条
judge(input, syl)        输入键序列是否命中任一可接受序列
keysForAtom(atom)        知识点主键；零声母返回整段序列
keyMap()                 三行 qwerty（方案用到 ';' 时补入）
diff()                   free / learn 划分（键位与全拼一致即 free）
freeSets()               缓存的 free 集合 { initials, finals, zero: Set }
compositionSequence(syl) 纯声母×韵母笛卡尔积（零声母为整段序列；[0] 即主键组合）
```

- free 判定与展示统一用 `isFreeAtom(engine, atomId)` / `freeAtomIdsOf(engine)`；课程、键位图、训练场不再各自手写 free 过滤。
- `analyzeSchemeCodes(def)` 是推荐码 / 兼容码的**唯一推导口径**：给出每个音节的 `composition`、`recommended`（是否覆盖组合）、`compat`、`atoms`、`primary`、`accepted` 与 `unresolved`；生成器与入门课展示都消费它，不再各自解析方案表。
- 19 套方案的判题 golden cases 在 `data/schemes/engine-cases.json`（测试与校验数据，不进入 public），`engine.test.ts` 全量校验。

### 会话状态机与展示模型（session.ts）

`SessionState` 是唯一会话真相，输入跟踪不再由 Web 维护：

```text
words / index / phase / lastFeedback / stats
revealed     已触发「第 3 次错误揭示答案」的字
wrongInputs  当前字的错误输入（提交整字时记录）
cellErrors   每个字的累计错误次数
keyErrors    错误键位统计：'实际按下|应为' → 次数
```

- `cellKeyOf(state)` 返回当前字稳定 key；`keyErrorEntries(state)` 把 `keyErrors` 解析为 `{ typed, expected, count }[]`（次数降序），展示层直接消费。
- `applyKey`：逐字推进、整字判题、多解容错；输入满且未通过时**错误锁定**（忽略字母输入并保持错误输入），退格 / `clearInput` 解除；同一字第 3 次错误自动揭示答案。
- `normalizeKeyInput`：合法键为小写字母与 `;`（双拼 ing 键），屏蔽 IME / 组合键 / 多字符。
- `hasInputError(state)` 用于 UI 错误红态；`revealed / cellErrors` 的键是字的稳定 key（`词下标:字下标`）。
- `resumeSession` 平移计时起点（暂停不计速）；批次末词完成时由调用方通过 `applyKey` 的 `extendWords` 提供下一批，返回空数组即结束（练习场无尽练习）。
- `sessionMetrics`：正确率 = 正确字数 ÷（正确字数 + 错误次数），速度按正确字数 ÷ 用时换算；会话结束后冻结。
- 展示模型：`buildPracticeWord` 把词库条目变成可渲染 / 可判题的 `PracticeWord`；键帽用主键序列，判题接受全部可接受序列；零声母键帽全部 role=final、atomId=zero:*。

### 阶段、评分与组卷（lesson.ts）

- 阶段顺序由 `PRACTICE_STAGES`（`single → word → exam`）给出；课型到阶段映射为：`drill → single → word → exam`；`review / exam → exam`；每课最后一场都是无提示考核。
- 各阶段最低词数由 `KIND_STAGE_MIN_WORDS` 给出，课程数据 `stageMinWords` 可覆盖；`stageGate` 判定是否达标（普通阶段只看词数，考核阶段还要正确率与可选速度门槛），`hintTierFor` 决定提示档位（完整 / 部分 / 无）。
- 评分唯一入口 `evaluateLesson(lesson, metrics)`：
  - `accuracy`：完成即通过，星级按正确率（★★≥90%、★★★≥95% 且未揭示）；
  - `speed`：正确率 ≥ 通过线且 cpm ≥ minCpm，星级按 `starCpm`；
  - `accuracy-speed`：双达标，2★/3★ 另叠加 90%/95% 正确率与未揭示条件。
  - 入门课完成即通过并记 ★★★。
- `accuracyTiers / speedTiers / tierOf / describePassCriteria` 提供 UI 档位与文案，默认速度门槛与判定共用同一份数据，避免文案与规则漂移。
- 组卷装配：`buildSingleCharWords`（单字轮转）、`buildWordStageWords`（概率均衡抽词 + 稀疏目标补字）、`buildTutorialWords`（教学示例逐音一张卡）。
- `buildLessonPool(lesson, lexiconLike)`：从运行时词表派生单课 `words / chars / examples`（initial 展开全部韵母、final 只展开真实声母、zero 取自身；零声母示例只在 zero 知识点下出现，缺失时回退课程 `zeroExamples`）。Web 的课程练习与 core 测试共用这一实现。

### 确定性选词（selector.ts，内部）

- 候选词必须包含当前 focus，并满足已学 / 预习约束：`newFocus = blockingAtoms − 已学 − free`；零声母需已学或本课 focus。
- 每个 focus 原子每轮一个槽位，轮内 focus 顺序按 seed 洗牌；多命中（一个词覆盖多个 focus）只会提高权重，不扣分。
- 同轮不重复用词；候选不足时允许跨轮重复，并用单字候选兜底稀疏目标音。
- 词频不参与运行时权重，只作词库入库门槛；同一 seed 结果完全可复现。

### 训练场与进度（training.ts / progress.ts）

- `filterTrainingEntries` / `syllableInTrainingScope`：条目的每个音节都必须命中「声母 × 韵母」范围；零声母是独立选择集（`zeroFinals`），er 等只存在于 zeroInitial 中。
- `parseArticleText`：只保留汉字，非汉字统一断行，每行最多 5 字；文章 → 练习词的拼音解析在 Web 侧 `lib/article.ts` 完成（pinyin-pro 上下文解析，不查词表）。
- `buildTrainingBatch`：从条目取目标词量的批次（不足循环补齐，跳过无法构建的条目）；可传 seed 复现。
- `progress.ts`：按课程列表顺序解锁——已通过 = passed；第一课 / `unlockedAll` = available；否则前一课通过才 available；`currentLessonId` 是第一门未通过且未锁的课。

### 数据契约（types.ts）

- **数据文件契约**：`SchemeIndexFile / SchemeSummary`（`data/schemes/index.json` 实际字段：version / generatedBy / reference / semantics / defaultScheme / recommendedOrder / courseSupported / schemes / dataQuality）、`SchemeDef`（`schemes/<id>/scheme.json` 全字段）、`Curriculum / LessonDef`（`curriculum/<id>.json`）、`Lexicon`（`lexicon/lexicon.json`：`entries` 文本+词频 + `syllableExamples`，不含拼音）、`WordEntry / SyllableExample`（运行时解析后的模型）。
- **运行期模型**：`PracticeWord / PracticeCap`、`SessionState / SessionFeedback / SessionMetrics`、`StageGate / LessonResult / MetricTier`、`TrainingScope / ArticlePlan`、`LessonProgress / LessonState`。
- 契约只描述真实字段：不写「当前数据中从不出现」的字段，也不为未实现能力保留类型。

## Web 层（apps/web/src）

### 数据加载与 public/data

`lib/data.ts` 只有 4 个 loader（`loadIndex / loadScheme / loadCurriculum / loadLexicon`），运行时只读 4 类紧凑 JSON（由 `pnpm data:sync` 单向生成，不手工编辑）：

```text
index.json              方案索引（SchemeIndexFile：默认方案 / 推荐顺序 / courseSupported / 19 套摘要）
schemes/<id>.json       SchemeDef
curriculum/<id>.json    Curriculum（仅课程方案）
lexicon/lexicon.json    词表（entries 文本+词频 + 音节示例；拼音运行时解析）
```

- 同一数据只加载一次（Promise 缓存）；失败不缓存 rejected Promise，允许重试。
- `loadLexicon` 加载词表后会调用 `lib/lexicon.ts` 解析拼音；其余 loader 只把 JSON 交给 core 类型。
- 拼音解析统一走 `lib/lexicon.ts`：动态 `import('pinyin-pro')`（独立 chunk，不进入主包），把 `entries` 解析成带 `syllables` 的 `WordEntry` 列表（词 / 单字分开、词频顺序保留），供课程、入门课、练习场共用。
- 文章练习走 `lib/article.ts`：`parseArticleText` 拆字后，直接用 pinyin-pro 对整个文章做上下文级拼音解析，不查词表；解析不出方案音节的汉字标记为跳过。
- core 保持零第三方依赖：`pinyin-pro` 只出现在 Web 运行时与构建脚本中，core 只接收解析后的 `WordEntry`。

### stores（跨页面共享 + 持久化）

| store | 职责 |
|---|---|
| `course` | 数据引导与加载状态、方案切换（含 epoch 竞态防护）、当前 scheme / curriculum / engine、课程选项与排序、已通过数，进度操作委派给 progress |
| `progress` | 按方案持久化 `LessonProgress`（sanitize 损坏数据）、记录结果 / 阶段达标 / 清空 |
| `settings` | 主题（亮 / 暗） |
| `sound` | 音效开关（持久化）+ 转发 `lib/audio.ts` 的 WebAudio 引擎 |
| `layout` | 顶栏阶段标题、底部键位图显隐 / 可用性、底栏内容（`DockContent`）、快捷键帮助面板 |

### composables（响应式状态机与派生）

| composable | 职责 |
|---|---|
| `useSessionRuntime` | **唯一**会话运行时：包装 core 会话状态机 + 500ms 时钟，暴露 session / metrics / cpm / revealed / wrongInputs / keyErrors / inError / start / apply / backspace / clearInput；课程练习与练习场共用 |
| `usePractice` | 练习页阶段状态机：阶段切换、每阶段独立会话、门槛判定、总结卡、达标记录与继续；不复制判题交互 |
| `useTrainingSelection` | 练习场「出现 / 隐藏 / 组选 / 方案预设 / 配置持久化」唯一响应式实现（约 350 行）；纯逻辑在 `lib/trainingSelection.ts`，这里只做 ref/computed/watch 与存储读写 |
| `useSchemeView` | 三页共用的方案派生：engine / keyMapRows / specialInitials / freeAtomIds / 底栏基础内容 |
| `useKeyInput` | 应用级唯一字符输入管线（见下） |
| `useGlobalKeys` | 页面级快捷键统一注册 / 清理（命令式绑定 + `when` / 修饰键 / 可编辑元素守卫，内置 IME 与 repeat 过滤） |
| `useBottomDockContent` | 注册 / 更新底栏键位图内容 |
| `usePointerBlur` / `useResizeObserver` | 指针操作后失焦、统一尺寸观察 |

### lib（无渲染纯函数）

| 文件 | 职责 |
|---|---|
| `data.ts` | 4 个数据 loader（缓存 + 重试语义）；`loadLexicon` 加载后交给 `lexicon.ts` 解析拼音 |
| `lexicon.ts` | 词表拼音解析：动态 import pinyin-pro，把 `entries` 转成运行时 `WordEntry` 列表（核心零依赖） |
| `article.ts` | 文章练习：拆字 + 上下文拼音解析 → 逐字 `PracticeWord`/`ArticlePlan`；不可表示读音计入 skipped |
| `storage.ts` | 唯一 localStorage / sessionStorage 访问点；`STORAGE_KEYS` 集中键名；读写失败静默返回 null / false；可注入 StorageLike 便于测试 |
| `dom.ts` | 输入守卫：可编辑元素 / 交互元素 / IME 与 repeat / 合法字母键 / 聚焦 |
| `sessionSummary.ts` | 会话结束统计（accuracy% / cpm / duration）、aria-live 文案、声音反馈分支；错误键位排行直接消费 core `keyErrorEntries(state)`（不拆字符串） |
| `keyboardView.ts` | 键帽文本与分行 / 散落布局、键位图纯视图模型（零声母 / 兼容码 / focus 强调） |
| `lessonView.ts` | 课程展示映射：focus 视图、tips、记忆锚点、阶段标题、章节课程视图 |
| `trainingSelection.ts` | 选择 / 隐藏 / 组选 / 全拼沿用胶囊 / 课程预设 / 配置 sanitize 与持久化读写的纯函数（约 790 行） |
| `audio.ts` | WebAudio 合成音效（按键 / 错误 / 完成），带去重节流 |
| `shortcuts.ts` | 快捷键帮助面板的展示数据 |

### 页面与组件

- **LearnMapPage**：Hero、继续学习、键位图、进度、章节路线、方案切换、滚动位置记忆；数据来自 `course`，视图由 `lib/lessonView` 组装。
- **PracticePage**：只做状态分支与子组件编排；阶段状态机在 `usePractice`，规则全部在 core。
- **TrainingPage**：练习场；专项与文章两种模式；选择 / 隐藏 / 预设走 `useTrainingSelection`，判题交互走 `useSessionRuntime`，方案派生走 `useSchemeView`。
- **App.vue**：应用外壳（顶栏 / 路由视图 / 底栏宿主 / 帮助浮层），启动 `course.init()`、全局快捷键与音效解锁。
- **组件目录**：
  - `common`：共享原语与展示件，含 `KeyCap.vue`（统一键帽）、`SchemeHero.vue`（方案 Hero）、`StarRating.vue`、`StateCard.vue`、`CardHeader.vue`、`HeroLayout.vue`、`BackToTop.vue`；
  - `keyboard`：`BottomDockHost.vue`（底栏宿主）、`DockReveal.vue`、`KeyboardMap.vue`、`MappingStrip.vue`、`SchemeKeycaps.vue`、`SchemeSelector.vue`；
  - `layout`：`Topbar.vue`、`BrandPopover.vue`、`TopbarActions.vue`、`SessionBar.vue`、`ShortcutHelp.vue`；
  - `map`：`ChapterSection.vue`、`CurrentLearningCard.vue`、`LearningProgressCard.vue`、`LessonCard.vue`、`MapKeymapPanel.vue`、`MappingTagArea.vue`；
  - `practice`：`PracticeStream.vue`、`CharacterCard.vue`、`InputSlots.vue`、`TutorialStage.vue`、`TutorialExamples.vue`、`StageSummaryCard.vue`、`AnchorTips.vue`；
  - `intro`：`IntroLesson.vue`、`IntroPageShell.vue`、`IntroStepLayout.vue`、`PinyinAnatomy.vue`、`SchemeGuideCards.vue`、`CodeExampleCard.vue`、`KeyAtomCapsule.vue` + `introLessonModel.ts`；
  - `training`：`ArticleGrid.vue`、`SetupCard.vue`、`SetupGroup.vue`、`CommonCapsule.vue`、`HiddenMappingGroups.vue`。
- **路由**：`/`、`/training`、`/practice/:lessonId`；`VITE_ROUTER_MODE=hash` 使用 hash 路由（静态包），否则 history；`VITE_BASE` 控制部署子路径。
- **样式**：`styles/tokens.css` 是唯一设计令牌来源，`styles/base.css` 提供共享原语；组件 `<style>` 只消费 token，`pnpm lint:ui` 静态守卫（裸色值 / 裸字号 / 裸圆角 / 裸阴影 / 裸动效时长 / 未声明与未使用 token / 组件内键盘监听）。

### 统一键输入管线

字符输入只有一条链路：

```text
物理键盘 keydown ─┐
                  ├─→ useKeyInput.dispatch → pressedKeys + 订阅者（页面 / 键位图 / 键帽）
键位图点击 ───────┘
```

- `useKeyInput` 在应用根节点安装字符输入的**唯一** `window.keydown`，统一过滤 IME / repeat / 组合键 / 输入框焦点，把字母与退格归一化为输入事件；页面命令型快捷键统一走 `useGlobalKeys` 注册，二者职责分离；
- `KeyboardMap` 点击按键直接向输入层派发；`SchemeKeycaps` 与页面练习处理器订阅同一输入层；
- 输入层不播放声音：有键帽的页面由键帽负责，练习会话由页面处理器负责，保证一次输入只响一次。

### 底部键位图宿主

- 底栏的挂载、显隐与开合集中在 App 级 `BottomDockHost`；练习页内容随高度逐帧重排，因此教学页「示例」面板按行窗口化；
- 页面只通过 `useBottomDockContent` 注册内容，`layout` store 保存 `DockContent`（行布局、方案名、改造声母、零声母 / 兼容码、free 原子）；
- 底栏显隐由路由能力（练习页 / 练习场）与用户偏好（`Ctrl/Alt+K`）决定；课程下一阶段、练习场重新开始时复用同一宿主实例，不重播底栏动效。

### 本地存储

键名集中在 `lib/storage.ts` 的 `STORAGE_KEYS`（其他模块禁止写裸 key 字符串）：
`scheme / unlock-all / theme / sound / progress:<schemeId> / training-config:<schemeId> / training-preset（sessionStorage）/ map-scroll:<schemeId>（sessionStorage）`。

## 会话与评分口径（汇总）

1. 进入阶段 → 用 core 生成该阶段词单（单字 / 词语 / 考核）并 `createSession`；离开阶段保存 `SessionState`，回来 `resumeSession`。
2. 每次输入 → `applyKey` 返回 state + feedback：typing / wrong / char-complete / word-complete / session-complete；错误锁定、第 3 次揭示、keyErrors 都在 core 内维护。
3. 阶段达标 → `stageGate(lesson, stage, metrics)`；完成阶段后记录进度，考核阶段额外 `evaluateLesson` 计算通过 / 星级。
4. 用户可见规则（课型、星级、解锁）见[学习指南](USAGE.md#学习路线与课程)；本文只描述实现口径。

## 课程顺序与生成规则

`data/schemes/<id>/curriculum.json` 是课程唯一数据源：19 套方案各一份，`supportLevel` 区分 5 套定制 full 与 14 套生成 simplified。

- `LessonDef` 含 `focusAtoms / blockingAtoms / nonBlockingAtoms / prerequisites / wordPlan / passCriteria / atomMeta / zeroExamples / tips / stageMinWords`；只有 initial/final 阻塞选词，`prerequisites` 是此前 focus 的累计集合；章末复习的 `focusAtoms` 只取本章原子，期中 / 综合 / 期末取 `prerequisites`。
- 内容章顺序（`scripts/lib/curriculum-template.mjs` 的 `MODULES`，生成器与校验共用）：

  ```text
  单韵母 → 单声母 → 复合声母 → 前响复韵母 → 中响复韵母 → 后响复韵母
  → 基本后鼻韵母 → 基本前鼻韵母 → 带介前鼻韵母 → 带介后鼻韵母 → 零声母
  ```

- 通用课程只给 learn 原子逐课（每原子一课、不合并），free 原子直接视为已会；章末复习只覆盖本章；期中章由「左右新课数差最小 → 章数差最小 → 更早边界」插入；最终章为综合练习 → 速度练习 → 最终考核。
- 推荐码例外 / 兼容编码不单独设课，按「目标音节最后学到的 learn 原子」归组写入对应原子课 tips；两端都是 free 的归入综合课。生成课程只保留编码类 tips，定制课程保留人工撰写的教学提示。
- 章节内顺序与章节顺序经过候选词池实验调整（14 套生成课程、Lexicon 词条下的合法候选词数量，`meanLog` 比较），在保持教学递进的前提下取局部最优；模板常量与注释见 `scripts/lib/curriculum-template.mjs`。
- 入门课在 `curriculum.json` 中只是一节普通课；运行时由 `components/intro/introLessonModel.ts` 依据当前方案引擎与 Lexicon 现场生成拼音基础、原子胶囊、多键 / 推荐码 / 兼容编码条件页、工具说明与固定试打词，换方案不需要维护多份入门页面。编码示例与原子标签由 core `analyzeSchemeCodes` / `atomDisplayLabel` 派生，`introLessonModel` 只负责展示取样与排序。

## 数据契约与版本链

- **源数据（唯一权威）**：`data/schemes/index.json` + `data/schemes/<id>/{scheme,curriculum}.json` + `data/lexicon/lexicon.json`（另有无障碍测试数据 `engine-cases.json` 仅供测试/校验）。
- **运行时副本**：`apps/web/public/data/` 只含 `index.json`、`schemes/<id>.json`、`curriculum/<id>.json`、`lexicon/lexicon.json` 四类紧凑 JSON，由 `pnpm data:sync` 原子重建；不存在其它中间层。
- **索引字段**：`index.json` 保存 `version / generatedBy / reference / semantics / defaultScheme / recommendedOrder / courseSupported / schemes / dataQuality`；课程清单由 `courseSupported` 派生，不另设课程索引文件。
- **版本链**：
  - 课程版本 `curriculum-<12hex>` = `sha256(JSON.stringify({ chapters, lessons }))` 的前 12 位，由 `scripts/lib/data-contract.mjs` 的 `curriculumVersionOf` 计算，生成与校验共用；
  - Lexicon 版本 `lexicon-<12hex>` 固化在数据文件中，校验器校验格式与 public 副本一致。
- **校验**：`pnpm validate`（`scripts/validate-all.mjs`）分五个域——方案（索引一致性 / 引擎可构造 / 判题用例规模）、Lexicon 契约、课程（5 套定制严格校验 + 14 套「重新生成 + JSON 深相等」+ 独立结构不变式）、public/data（4 类文件清单 + 与 data/ 深相等 + 版本链）、文档（入口 / README 导航 / 链接与截图）。数据生产与校验流程详见[数据说明](DATA.md)。
- **干净 clone 可测**：core 的数据契约测试只读 `data/` 源文件；`public/data` 是 gitignored 生成物，由 validate 负责一致性。

常用命令：

```bash
pnpm dev            # 本地开发（首次会 data:sync）
pnpm typecheck      # core tsc + web vue-tsc
pnpm lint:ui        # UI 约定守卫
pnpm test           # core + web 单元测试
pnpm data:curriculum# 重建 14 套通用课程（会写 data/，需确认零 diff）
pnpm data:sync      # data/ → public/data
pnpm validate       # 五域数据/文档校验
pnpm verify         # typecheck + lint:ui + data:sync + test + build + validate
```

## 参考链接

- 键位规则与参考实现：[fcitx/libime](https://github.com/fcitx/libime)、[fcitx5-chinese-addons](https://github.com/fcitx/fcitx5-chinese-addons)（LGPL-2.1-or-later，仅提取键位事实）。
- 其余方案键位与推荐码 / 兼容编码补充：[BlueSky-07/Shuang](https://github.com/BlueSky-07/Shuang)（GPL-3.0）。
- 词表与词频：[jieba](https://github.com/fxsjy/jieba)（MIT）；拼音转换（数据生成期）：[pinyin-pro](https://github.com/zh-lx/pinyin-pro)（MIT）。
- 双拼学习路线与键位教学参考：[shuangpin.xyz 四步学习路线](https://shuangpin.xyz/blog/start-shuangpin/)、[oroc 七日上手双拼](https://blog.oroc.top/post/double-pinyin-guide/)、[一文搞懂小鹤双拼](https://www.cnblogs.com/PeterJXL/p/18539136)。
- 前后鼻音对比资料：[普通话测试站](https://putonghua.szu.edu.cn/info/1014/2862.htm)。
