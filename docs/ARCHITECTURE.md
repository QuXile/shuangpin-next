# 架构说明

[← 文档导航](../README.md#文档导航)

代码分层、模块边界、会话与评分规则、数据契约。数据的生产、同步与校验见[数据说明](DATA.md)。

## 分层与原则

- `packages/core`：纯 TypeScript 领域层，无框架 / DOM / Node 依赖；拼音、方案、判题、会话、阶段、评分、选词、训练装配、课程解锁都在这里。
- `apps/web`：Vue 3 + TypeScript + Pinia，负责数据加载、响应式状态、路由、输入事件与渲染；判题与规则调用 core。
- `data/`：方案、课程、词表的权威源数据；`apps/web/public/data/` 是同步生成的运行时副本。
- 单向数据流：`data/` → `pnpm data:sync` → `public/data/` → `lib/data.ts` → core → stores / composables → 组件。

## 仓库结构

```text
apps/web/src/            App.vue / main.ts / router.ts
  pages/                 LearnMapPage / PracticePage / TrainingPage
  composables/           useSessionRuntime / usePractice / useTrainingSelection / useSchemeView /
                         useKeyInput / useGlobalKeys / useBottomDockContent / usePointerBlur / useResizeObserver
  components/            common / keyboard / layout / map / practice / intro / training
  stores/                course / progress / settings / sound / layout
  lib/                   data / lexicon / article / storage / dom / sessionSummary /
                         keyboardView / lessonView / trainingSelection / viewCache / popoverPosition /
                         audio / shortcuts
  styles/                tokens.css + base.css
packages/core/src/       types / pinyin / scheme / session / lesson / selector / training / progress / curriculum / index
packages/core/tests/     领域单元测试 + data/ 契约测试
apps/web/tests/          Web 纯函数与 store 测试
data/                    schemes/{index,engine-cases}.json、schemes/<id>/{scheme,curriculum}.json、lexicon/lexicon.json
scripts/                 生成 / 同步 / 五域校验 / 静态包启动器 / UI 约定守卫
docs/                    文档入口见 README
```

## 领域层（packages/core）

| 文件 | 职责 |
|---|---|
| `types.ts` | 数据契约与运行期模型（Practice / Session / Stage / Progress） |
| `pinyin.ts` | 拼音常量、规范化、音节拆分、声调显示、外部拼音 token → 音节、AtomId 与匹配谓词 |
| `scheme.ts` | 方案引擎：判题、主键、键位图、free / learn 划分、推荐码与兼容码分析；音节/原子派生按 key 缓存，`analyzeSchemeCodes` 按 `SchemeDef` 缓存 |
| `session.ts` | 会话状态机、输入跟踪（错误锁定 / 揭示 / keyErrors）、练习展示模型 |
| `lesson.ts` | 阶段计划与门槛、评分与星级、组卷装配、单课词池、运行时原子展示与编码 tips |
| `curriculum.ts` | 课程结构：定制课程补齐运行期字段、通用课程按方案生成 |
| `selector.ts` | 确定性选词算法与随机原语，由 `lesson.ts` 调用；focus 预解析 + 候选倒排表 + 候选池缓存（同 `engine` / 词表 / 课只过滤一次 5 万词） |
| `training.ts` | 练习场范围过滤（Set 化 + 焦点预解析）、文章拆字、条目 → 练习词批次、方案键位选项 |
| `progress.ts` | 课程解锁与进度规则 |
| `index.ts` | 公共入口；只导出有真实消费者的符号 |

### 公共 API

```text
pinyin   (12)  INITIALS FINALS ZERO_INITIALS splitPinyin splitSyllable toToneMarks
               atomId parseAtomId atomDisplayLabel
               parsePinyinToken syllableFromPinyinToken entryFromPinyin
scheme    (5)  createSchemeEngine freeAtomsOf analyzeSchemeCodes isFreeAtom freeAtomIdsOf
session  (11)  createSession applyKey backspace clearInput resumeSession sessionMetrics
               normalizeKeyInput hasInputError cellKeyOf keyErrorEntries buildPracticeWord
lesson   (20)  PRACTICE_STAGES KIND_STAGE_MIN_WORDS lessonStages lessonStageMinWords
               stageGate hintTierFor buildSingleCharWords buildWordStageWords
               buildTutorialWords buildLessonPool buildAtomMemory buildLessonCodeTips
               CODE_TIP_RECOMMENDED_PREFIX CODE_TIP_COMPAT_PREFIX CODE_TIP_PREFIXES
               evaluateLesson describePassCriteria accuracyTiers speedTiers tierOf
curriculum (2)  buildUniversalCurriculum hydrateCurriculum
training  (5)  atomOptionsOf freeTrainingAtoms filterTrainingEntries parseArticleText
               buildTrainingBatch
progress  (5)  lessonState canStartLesson nextLessonId currentLessonId passedLessonCount
```

`SchemeEngine` 通过 `createSchemeEngine` 使用，方法包括 `acceptedSequences / primarySequence / judge / keysForAtom / diff / freeSets / compositionSequence / keyMap`。`selector.ts` 的随机原语是内部实现；`pinyin.ts` 的规范化细节只对外暴露拆分结果与 AtomId 工具。

### 拼音与知识点

- 23 个声母、33 个韵母（ü 记 v，`ue` / `ve` 并存）、12 个零声母音节；
- `AtomId = initial:<声母> | final:<韵母> | zero:<零声母音节>`；
- 知识点严格按类型命中：`final:ao` 只命中带声母的 ao，`zero:ao` 只命中零声母 ao；
- 全拼沿用（free）按原子类型统一派生：声母 / 韵母 / 零声母都可能 free；free 原子始终已学，不单独出课，也不进入隐藏 / 焦点候选；
- 兼容编码（compatCodes）是音节的额外合法键序列，不是 `AtomId`，不可选择 / 隐藏 / 作为焦点，只参与判题、键位图与编码 tips；
- `j/q/x/y + ü` 的主键取 `finals[u]`，其它 ü 键作为兼容码由方案数据给出；`n/l` 后的 ü 取方案 ü 键。

### 方案引擎与编码分析

判题：命中 `recommended` / `compatCodes` 的完整序列直接成功；否则按 `initials[声母] × finals[韵母]` 组合匹配。兼容码是额外接受，不禁用组合展开。

```text
acceptedSequences(syl)   全部可接受序列（零声母整段 / override / compat / 声母×韵母笛卡尔积）
primarySequence(syl)     展示主键：recommended → compat 首条 → 组合首条
judge(input, syl)        输入是否命中任一可接受序列
keysForAtom(atom)        知识点主键；零声母返回整段序列
freeSets()               缓存 { initials, finals, zero: Set }，与全拼一致即 free
compositionSequence(syl) 纯声母×韵母组合（零声母为整段序列）
```

`analyzeSchemeCodes(def)` 解析推荐码 / 兼容码，返回 `entries`（`composition` / `recommended` / `recommendedOverride` / `compat` / `atoms` / `primary` / `accepted`）、`unresolved` 与 `stats`。运行时注释与 tips、校验器、入门课展示都消费这份分析。19 套方案的判题夹具在 `data/schemes/engine-cases.json`，由 core 测试与校验器消费。

### 会话状态机

`SessionState` 是唯一会话真相：`words / index / phase / lastFeedback / stats / revealed / wrongInputs / cellErrors / keyErrors / keyErrorDetails`。

- `applyKey`：逐字推进、整字判题、多解容错；输入满且未通过时锁定该字，退格或 `clearInput` 解除；同一字第 3 次错误自动揭示答案；
- `normalizeKeyInput`：合法键为小写字母与 `;`，过滤 IME、组合键与多字符；
- `cellKeyOf` 返回当前字稳定 key；`keyErrorEntries` 把 `keyErrors` 解析为按次数降序的展示数据，`keyErrorEntriesWithAtoms` 额外带回按键对应的知识点（用于总结卡展示声母 / 韵母 / 零声母胶囊）；
- `resumeSession` 平移计时起点；`sessionMetrics` 计算正确率与速度；
- 阶段总结 / 暂停 / 主动结束卡片统一由 `SessionSummaryCard` 渲染；暂停用 `SessionPauseOverlay` 覆盖题目区，结束卡追加在题目内容末尾，题目区不因暂停卸载；
- `buildPracticeWord` 把词库条目转为可渲染、可判题的练习词，键帽显示主键序列，判题接受全部可接受序列。

### 阶段、评分与组卷

- 阶段顺序 `PRACTICE_STAGES`：`single → word → exam`；`drill` 走三段，`review / exam` 只走无提示考核；
- 最低词数由 `KIND_STAGE_MIN_WORDS` 决定；`stageGate` 判定阶段达标，`hintTierFor` 决定提示档位；
- 评分入口 `evaluateLesson`：`accuracy` 完成即通过；`speed` / `accuracy-speed` 叠加速度与正确率门槛；星级门槛由 `accuracyTiers` / `speedTiers` / `tierOf` 提供；
- 组卷：`buildSingleCharWords`、`buildWordStageWords`、`buildTutorialWords`；
- `buildLessonPool` 派生单课 `words / chars / examples`：initial 展开全部韵母、final 展开真实声母、zero 取自身；示例统一取 `Lexicon.syllableExamples`；
- `buildAtomMemory(engine, atomId, chars)` 派生键位、free 与记忆锚点：只在声母与同键韵母、韵母与同键声母能组成真实音节且词表有对应单字时生成；没有可用同键组合时不生成锚点；
- `buildLessonCodeTips(engine, lessons)` 派生推荐码 / 兼容码 tips，规则见「课程数据」。

### 选词与训练

- 候选词必须包含当前 focus，并满足已学 / 预习约束；零声母需已学或本课 focus；
- 同一 seed 下结果可复现；候选不足时跨轮重复，并用单字兜底稀疏目标音；
- 训练场范围：每个音节都必须命中「声母 × 韵母」；零声母是独立选择集；
- 训练场焦点：`filterTrainingEntries(entries, scope, focusAtoms?)` 在逐音节范围之上增加逐词焦点约束，词至少一个音节命中焦点；空数组不限；
- `parseArticleText` 只保留汉字、每行最多 5 字；文章拼音解析在 Web 侧 `lib/article.ts` 完成；
- `buildTrainingBatch` 从条目取目标词量并在不足时循环补齐；
- `progress.ts`：按课程顺序解锁，`currentLessonId` 为第一门未通过且未锁的课。

## Web 层

### 数据加载与课程

`lib/data.ts` 提供 4 个 loader：

```text
index.json              SchemeIndexFile
schemes/<id>.json       SchemeDef
curriculum/<id>.json    5 套定制课程源数据
lexicon/lexicon.json    运行时预编译词表（schemaVersion 3：meta + syllableTable + entries + syllableExamples）
```

- 同一数据只加载一次，失败不缓存 rejected Promise；
- `lexicon/lexicon.json` 是构建期预编译的紧凑格式（`schemaVersion 3`）：同步时由 pinyin-pro 完成
  5 万词条解析并编码为「唯一音节表 + 源顺序词条」，`loadLexicon` 在浏览器只做 `JSON.parse` +
  `lib/lexicon.ts` 的 `decodeRuntimeLexicon`（音节对象全表共享，Node 实测约 25ms）；练习页不再加载 pinyin-pro；
- 文章练习由 `lib/article.ts` 拆字后按上下文解析拼音（动态 `import('pinyin-pro')` 独立 chunk），不查词表；无法表示读音的汉字跳过；
- 课程就绪后 `course` store 在 `requestIdleCallback` 里预热词表（尊重省流模式、失败静默），进入练习页直接命中缓存。

课程加载：`App.vue` 启动 `course.init()` → `index.json` → 选择已保存方案 / 默认方案 → 加载 `scheme.json` 与词表元信息 → 课程：

- `customCourses` 内的方案读取 `curriculum/<id>.json`，`hydrateCurriculum` 补齐运行期字段；
- 其余方案调用 `buildUniversalCurriculum(scheme)` 在内存中生成。

`course` store 持有 scheme / curriculum / engine / lessons；切换方案重新加载。练习页按路由 `lessonId` 从 `course.lessons` 取课，`usePractice` 加载完整词表并 `buildLessonPool`。

### stores 与 composables

| store | 职责 |
|---|---|
| `course` | 数据引导、方案切换与竞态防护、当前 scheme / curriculum / engine、课程选项与进度统计、词表空闲预热 |
| `progress` | 按方案持久化课程进度、记录结果、清空 |
| `settings` / `sound` / `layout` | 主题、音效、顶栏与底栏状态 |

| composable | 职责 |
|---|---|
| `useSessionRuntime` | 会话运行时：包装 core 状态机与 500ms 时钟，向课程练习与练习场提供统一输入/统计 |
| `usePractice` | 练习页阶段状态机：阶段切换、会话、门槛、总结卡、记录 |
| `useTrainingSelection` | 练习场出现 / 焦点 / 隐藏范围、预设与持久化 |
| `useSchemeView` | 方案派生：engine、键位图、free 原子、底栏内容 |
| `useKeyInput` | 应用级唯一字符输入管线 |
| `useGlobalKeys` | 页面快捷键注册与清理 |
| `useBottomDockContent` | 底栏键位图内容注册 |
| `useHoverPopover` | 溢出映射浮层：Teleport + fixed 定位、悬停宽限期、Esc、滚动/缩放重定位 |
| `usePointerBlur` / `useResizeObserver` | 指针失焦与尺寸观察 |

### lib 与页面

`lib/` 无渲染纯函数：`data` / `lexicon`（运行时词表解码 + 文章拼音 token）/ `article` / `storage` / `dom` / `sessionSummary` / `keyboardView` / `lessonView` / `trainingSelection` / `viewCache`（按内容复用渲染视图）/ `popoverPosition`（浮层定位）/ `audio` / `shortcuts`。

- `lessonView`：focus 视图、记忆锚点、本课技巧、章节课程视图；记忆锚点由 `core.buildAtomMemory` 实时派生，编码 tips 由 `core.buildLessonCodeTips` 实时合并；
- 页面：`LearnMapPage`（Hero、继续学习、进度、键位图、章节路线）、`PracticePage`（教学 / 练习阶段编排）、`TrainingPage`（专项与文章练习）；
- 路由：`/`、`/training`、`/practice/:lessonId`；`VITE_ROUTER_MODE=hash` 用于静态包，`VITE_BASE` 控制部署子路径。

### 输入与样式

字符输入只有一条链路：

```text
物理键盘 keydown ─┐
                  ├─→ useKeyInput.dispatch → 页面 / 键位图 / 键帽订阅
键位图点击 ───────┘
```

`useKeyInput` 在根节点统一过滤 IME / repeat / 组合键与输入框焦点；页面命令型快捷键由 `useGlobalKeys` 注册。`styles/tokens.css` 是唯一设计令牌来源，`styles/base.css` 提供共享原语；`pnpm lint:ui` 检查裸色值、裸字号、裸圆角、裸阴影、裸动效时长、未声明 / 未使用 token 与组件内键盘监听。

## 数据契约与版本

- 源数据：`data/schemes/index.json`、`data/schemes/<id>/scheme.json`、`customCourses` 内的 `curriculum.json`、`data/lexicon/lexicon.json`；
- 运行时副本：`apps/web/public/data/` 的 `index.json`、19 套方案、5 套定制课程与词表（`schemaVersion 3` 运行时预编译格式），由 `pnpm data:sync` 原子重建；
- 通用课程不落盘，运行时由 `buildUniversalCurriculum(scheme)` 生成。


`LessonDef` 运行期字段：`focusAtoms / blockingAtoms / nonBlockingAtoms / prerequisites / wordPlan / passCriteria? / tips?`。只有 initial / final 阻塞选词；`prerequisites` = 入门课后加入的全部全拼沿用原子 + 此前 focus 的累计集合；章末复习只覆盖本章原子，期中 / 综合 / 期末使用累计范围。源文件只保存结构与人工文案，其余字段在运行时派生。

## 性能设计

- **词表预编译**：5 万词条的拼音解析从浏览器移到 `pnpm data:sync`，运行期只解码紧凑格式；
  练习页准备耗时由「解析 ~300ms + 加载 pinyin-pro chunk」降为「解码 ~25ms」，pinyin-pro 只在文章练习按需加载；
- **方案引擎缓存**：`acceptedSequences / primarySequence / compositionSequence / keysForAtom / keyMap / diff`
  按音节或原子缓存并在引擎实例内复用；`analyzeSchemeCodes` 按方案身份缓存；
- **选词热路径**：focus 原子在入口预解析，候选按 focus 建立倒排表，权重增量维护；
  同一 `engine` / 词表 / 课程的候选池跨调用缓存（换 seed 只重置选择状态），通关考核组卷由约 390ms 降到约 4–5ms，且同 seed 结果与旧实现逐词一致；
- **渲染复用**：练习流与文章网格按内容复用单元/行视图（`lib/viewCache`）配合 `v-memo`，
  长列表按键时只更新当前字的卡片；键位图/差异等派生进入 computed，避免模板内联重算；
- **体积**：`apps/web/public/data/` 由约 1.7 MiB 降到约 1.05 MiB（词表 1.61 MB → 0.94 MB）；
- **基准**：`pnpm bench`（`scripts/bench-core.mjs`）用 Node 原生执行 core，输出各热路径耗时；不进入 `verify`。

## 数据体积

- `data/` 源数据约 3.5 MiB（19 套方案 + 5 套定制课程 + 词表 + 判题用例，2 空格缩进）；
- `apps/web/public/data/` 约 1.05 MiB / 26 个文件，其中词表约 0.94 MiB（gzip 约 321 KB）；
- 通用课程不占运行时数据，只增加 core 中约 20 KB 的生成代码；
- 词表在进入教学 / 练习时加载并解码（约 25ms）；pinyin-pro 独立 chunk 仅在文章练习按需加载。

## 构建与发布

```bash
pnpm dev              # 同步数据并启动开发服务器 5199
pnpm build            # 同步数据 + 类型检查 + Vite 构建
pnpm test             # core + web 单元测试
pnpm typecheck        # core tsc + web vue-tsc
pnpm lint:ui          # UI 约定检查
pnpm data:lexicon     # 重建词表
pnpm data:sync        # data/ → apps/web/public/data/（含词表预编译与缓存）
pnpm bench            # core 热路径基准（不进入 verify）
pnpm validate         # 五域数据与文档校验
pnpm verify           # typecheck + lint:ui + data:sync + test + build + validate
```

发布流程：版本号写入根 / web / core 的 `package.json`、README 与 CONTRIBUTING，`pnpm verify` 后提交 release 提交并推送 `v*` tag。GitHub Actions 的 `verify.yml` 校验主分支，`deploy-pages.yml` 构建 `VITE_BASE=/shuangpin-next/` 的 Pages 站点，`release-static.yml` 生成 `shuangpin-next-<版本>-static.zip` 与 `SHA256SUMS` 并创建 GitHub Release。

## 参考

- 键位规则：[fcitx/libime](https://github.com/fcitx/libime)、[fcitx5-chinese-addons](https://github.com/fcitx/fcitx5-chinese-addons)（LGPL-2.1-or-later）；
- 其余方案与推荐码 / 兼容编码：[BlueSky-07/Shuang](https://github.com/BlueSky-07/Shuang)（GPL-3.0）；
- 词表与词频：[jieba](https://github.com/fxsjy/jieba)（MIT）；拼音：[pinyin-pro](https://github.com/zh-lx/pinyin-pro)（MIT）。
