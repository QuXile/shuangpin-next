# 架构说明

[← 文档导航](../README.md#文档导航)

本文是项目的实现说明：领域模型、数据契约、Web 应用层与自动化校验的权威入口以**代码、数据文件与校验脚本**为准，与代码冲突时修改本文。面向使用者的规则见 [学习指南](LEARNING.md)、[练习场](TRAINING.md)，数据管线细节见 [数据说明](DATA.md)，视觉规范见 [界面与设计](UI.md)。

## 1. 项目定位与架构原则

双拼 NEXT 面向已经会全拼、但没学过双拼的学习者，把双拼的键位差异拆成可执行的「一课一键」路径：

```text
40 课 / 10 章 / 5 套完整课程（小鹤、自然码、微软、搜狗、智能 ABC）≈ 326 分钟
1 入门 + 27 新课 + 11 复习 / 检验 + 1 通关
19 套方案键位数据 / 40 课词池（26,000 条课次 / 25,255 唯一词）
学习地图 → 入门试打 → 教学页（技巧 + 记忆锚点）→ 单字 → 词语 → 复习 / 速度 → 通关考核
```

架构原则：

1. **领域层单一权威**：拼音、方案、判题、展示模型、选词、阶段、评分、统计全部在 `packages/core`，Web 不做领域计算。
2. **数据驱动**：方案键位与 free/learn 划分来自 `data/schemes/*.json`（`SchemeEngine.diff()`），代码中不硬编码某套方案的键位；课程词池与文档由数据生成。
3. **契约 + 校验**：数据文件契约类型在 core，生成器与校验器共用同一套 hash / 契约工具；`pnpm verify` 依次跑 typecheck、UI 约定检查、数据同步、测试、构建与 `scripts/validate-all.mjs`。

## 2. 仓库结构

```text
apps/web/                          Vue 3 + TS + Vite
  src/App.vue                      应用外壳：固定顶栏 + 路由视图 + 页脚 + 全局快捷键
  src/router.ts                    路由：/、/training、/practice/:lessonId（history / hash 可切换）
  src/pages/                       LearnMapPage / PracticePage / TrainingPage（只做编排）
  src/composables/                 useCourseBootstrap / usePractice / useTrainingSession /
                                   useGlobalKeys / useLiveCpm / usePointerBlur
  src/components/
    common/                        HeroLayout / CardHeader / BackToTop / StateCard / Spinner
    layout/                        Topbar / SessionBar / ShortcutHelp
    map/                           HeroPanel / CurrentLearningCard / LearningProgressCard /
                                   MapKeymapPanel / ChapterSection / LessonCard
    practice/                      PracticeStream / CharacterCard / InputSlots / KeyCap /
                                   TutorialStage / TutorialExamples / StageSummaryCard
    keyboard/                      KeyboardMap / KeyboardDock / DockReveal /
                                   SchemeKeycaps / SchemeSelector
    training/                      SetupCard / SetupGroup / CommonCapsule / ArticleGrid
    intro/                         IntroLesson
    FocusTagList.vue
  src/stores/                      course（数据 / 方案 / 进度委派）、progress、settings、sound、layout
  src/lib/                         data（fetch + 缓存）、lessonView、shortcuts、sessionInput、
                                   training、trainingConfig、trainingGroups
  src/styles/                      tokens（语义 token）、base（reset / 共享原语）
packages/core/                     纯 TS 领域层（无 Vue / DOM / Node 依赖）
  src/types.ts                     类型与数据文件契约（唯一权威）
  src/pinyin.ts                    音节拆分、声调、知识点 ID、显示标签
  src/scheme.ts                    方案引擎（判题 / free-learn 划分 / 键位图）
  src/practice.ts                  练习展示模型（键帽、零声母）
  src/selector.ts                  选词组卷
  src/balancedSampling.ts          概率均衡抽样
  src/stages.ts                    阶段计划、内容装配、阶段门槛
  src/session.ts                   会话状态机与统计
  src/scoring.ts                   通过标准与星级
  src/atoms.ts                     知识点 ↔ 词匹配谓词
  src/random.ts                    确定性 RNG / 洗牌
  src/training.ts                  练习范围过滤、文章解析
  tests/                           core vitest（含读根 data/ 的数据契约测试）
apps/web/tests/                    progress / trainingConfig / trainingGroups 单测
data/                              schemes / curriculum / packages / pools / words / training / raw
scripts/                           data-contract、word-pipeline、curriculum、scheme-packages、
                                   training、sync-data、validate-all、check-ui-conventions、
                                   static-package-server.py
docs/                              本套文档与 assets/impl 截图
```

## 3. 领域模型

### 3.1 音节与知识点

```text
Syllable   { text, pinyin, initial, final, tone?, zeroInitial }
Final      = 33 个规范韵母（ü 记 v）+ 只作零声母的 er
ZERO_INITIALS = 12 个零声母音节（a o e ai ei ao ou an en ang eng er）
AtomId     = initial:<声母> | final:<韵母> | zero:<零声母音节>
```

- `zh/ch/sh` 是独立声母；零声母不占声母键，由方案给出完整两键序列；声调只影响显示。
- **j/q/x/y + ü**：全拼写作 u，主键取 `finals[u]`（各方案均为 U 键，如「去」= QU）；方案自己的 ü 键（小鹤 V、微软 / 搜狗 Y 等）作为判题容错接受。n/l 后的 ü 主键取方案 ü 键（如 女 NV / NY、略 LT / LY）。
- `er`、`ue/ve` 等拼写口径由 `pinyin.ts` 统一规范化，非法音节返回 `null`。
- 零声母知识点显示标签统一为「零 <音节>」（如「零 ai」），由 `atomDisplayLabel` 唯一实现并测试。

### 3.2 方案引擎（scheme.ts）

方案数据（`data/schemes/<id>.json`）包含 `initials / finals / zeroInitial / overrides / type` 等字段；`createSchemeEngine(def)` 提供：

```text
acceptedSequences(syllable)  该音节全部可接受键序列（零声母整段 / override 整段 /
                             声母×韵母笛卡尔积；jqxy+u 额外并入 ü 键序列；去重保序）
primarySequence(syllable)    展示主键（accepted 第一条）
judge(input, syllable)       输入是否命中任一可接受序列
keysForAtom(atom)            知识点主键（零声母返回整段）
keyMap()                     3 行键盘映射（含方案用到的 ';'）
diff()                       数据驱动的 free / learn 划分
                              single key && value === atom 即 free
freeAtomsOf(def)             与全拼拼写一致的 free 原子集合（练习场「全拼沿用」使用）
```

- 判题语义：输入小写键序列；命中 `zeroInitial` 则使用其整段序列，命中 `overrides` 则使用 override 整段序列，否则按 `initials[声母] × finals[韵母]` 展开；数组值表示「任一命中即正确」（键道飞键、大牛多键、微软 ue 双键等）。
- `type=syllable-code`（C 双拼）没有可展开的声母 / 韵母，所有音节由 `overrides`（+ `zeroInitial`）查表。
- 19 套方案的 golden cases 在 `data/schemes/engine-cases.json`，由 `engine.test.ts` 全量校验；`data/schemes/index.json` 记录 provenance、推荐顺序、课程支持列表与每套方案的原子统计。

## 4. 课程与阶段

### 4.1 课程数据

`data/curriculum/<scheme>.curriculum.json`：5 套课程方案 × 40 课 / 10 章，模板版本 1.0.0：

```text
LessonDef { id, chapterId, kind, title, desc, estimatedMinutes,
            focusAtoms, blockingAtoms, nonBlockingAtoms, prerequisites,
            wordPlan{maxUnfamiliar,lengthRange}, passCriteria?, atomMeta,
            zeroExamples?, tips, stageMinWords?, reviewFamily? }
kind      intro（入门）/ drill（新课）/ review（复习、期中、综合）/ exam（通关）
```

课程结构（10 章：认识双拼 → 声母与零声母 → a/o 家族 → 期中 → e/i/u·ü 家族 → 综合 → 通关）与每章内容见 [学习指南](LEARNING.md#学习路线)。生成与校验规则：

- 只有 `initial/final` 阻塞选词；`zero` 不阻塞；`prerequisites` 为此前所有 focus 的累计集合；复习范围直接取 `prerequisites`（程序化生成，不手写子集）。
- 同键双韵合并成一课：`ia/ua`、`iang/uang`、`ong/iong`、`ue/ve`；校验器强制「多个新原子必须共用键位」或同属 ü 家族。
- 零声母 12 音节在 `L2.4` 一次性全表教授（focus 恰为 12 个 zero、12 条 zeroExamples）；`j/q/x/y` 遇 ü 与多音字只在首课「声母 · zh」的 tips 中提示一次。
- 课程范围只包含具体键位知识点（无 rule 原子）；每套方案的 learn 原子必须被某课教授（`diff().learn*` 全覆盖，校验器检查）。
- 统一定名：章标题 2–6 字；课标题 `<类别> · <内容>`，类别固定 9 种（入门 / 声母 / 零声母 / 韵母 / 同键 / 复习 / 期中 / 综合 / 通关）；课 id 为 `L<章>.<课序>`。
- `stageMinWords`：各阶段最低完成词数；`passCriteria`：`accuracy`、可选 `mode`（accuracy / speed / accuracy-speed）、`minCpm`、`starCpm`（入门课无门槛）。
- 教学页展示的 `tips`、`atomMeta.anchors` 与 `mnemonic` 由 `scripts/curriculum/content.mjs` + `data/words/anchors.json` 生成。

### 4.2 阶段

阶段由 `lessonStages(lesson)` 给出；**单位统一为词**（逐字练习时 1 个字 = 1 个词），每课最后一场都是全遮挡考核：

| 课程类型 | 阶段（提示档位） | 最低词数 |
|---|---|---|
| drill | 单字练习（1，全显）→ 词语练习（2，半遮挡）→ 全遮挡考核（3） | 15 → 15 → 25 |
| review | 全遮挡练习 / 考核（3） | 50 |
| exam | 通关考核（3） | 100 |
| intro | 独立入门组件 | — |

- `hintTierFor(stage)` = single 1 / word 2 / exam 3，提示档位只由阶段决定，课程数据不含 `hintTier` 字段。
- `stageGate(lesson, stage, metrics)`：非考核阶段只要求完成词数；全遮挡考核还要求达到 `passCriteria`（正确率 / 可选速度）。达标后由练习页自动写入通过记录（无需额外操作）。
- 阶段切换保留独立 `SessionState`，用 `resumeSession` 恢复（暂停时间不计入速度）；已达标阶段解锁状态粘滞，记录在进度条目的 `clearedStages` 中。
- 内容装配：`buildSingleCharWords`（本课 focus + 已学 / free 单字）、`buildWordStageWords`（`selectWords` 组卷）、`buildTutorialWords`（按 focus 学习顺序全量枚举示例音节）。

## 5. 会话与判题

`packages/core/src/session.ts` 是输入、错误与统计的唯一状态机：

- `normalizeKeyInput(raw)`：合法键为小写字母与 `;`。
- `applyKey`：逐字推进；整字判题（多解容错）；判错后保留错误输入并锁定该字（继续按字母无反应、不增加错误数）；同一个字第 3 次错误后揭示目标键。
- `backspace` 逐键撤销当前字并解除错误状态；`clearInput` 清空当前字输入（空格 / Enter 清空优先于主按钮）。
- `appendSessionWords` 支持无尽头追加（练习场）；`resumeSession` 恢复阶段会话，暂停时长不计入速度。
- `sessionMetrics`：`accuracy = 正确字数 / (正确字数 + 错误次数)`，`cpm` 按正确字数 / 用时换算；Web 端 `useLiveCpm` 提供会话中的实时速度。

## 6. 评分与星级

`packages/core/src/scoring.ts` 是唯一实现，教学页评分标准与判定同源：

- `accuracyTiers(criteria)` / `speedTiers(criteria)` 生成各档位（含对应星级），`tierOf` 取命中档位；速度课 / 准确率+速度课按速度星级门槛分档，无速度要求的课只显示原始 WPM。
- `evaluateLesson(lesson, metrics)` 返回 `LessonResult { passed, stars, ... }`：正确率与速度达到 `passCriteria` 即通过；在正确率 / 准确率+速度模式下 `revealed` 会阻止最高星（纯速度模式只看速度分档）。
- `describePassCriteria(criteria)` 生成教学页右栏的评分标准文案；星只展示 1–3 星，1★ 即最低通过标准。
- 评分阈值由课程数据 `passCriteria` 决定；用户可见的星级规则表与门槛见 [学习指南 · 评分与星级](LEARNING.md#评分与星级)。
- 进度写入由 Web `progress` store 负责：`passed`、`stars`、`bestAccuracy` 取历史最优，`attempts` 累加，重复尝试的较差成绩不覆盖历史最佳。

## 7. 概率均衡选词

课程词语 / 考核阶段由 `selector.ts` + `balancedSampling.ts` 组卷：

- `newFocus = blockingAtoms - prerequisites`；free 原子始终视为已学。
- 候选分层：S（未知 ⊆ newFocus）、A（额外 ≤ `maxUnfamiliar` 个预习原子）、B（无未知原子）；只有 newFocus 为空（复习 / 考核 / 规则课）时，候选必须命中至少 1 个 focus。
- 零声母逐音节门禁：候选词中的每个零声母音节必须在 focus 中或已学；`j/q/x/y + ü` 与多音字不进入课程 focus，因此不参与选词。
- **目标音计数**：每个候选记录 `a_w(f)`（该词中目标音 f 的出现次数）；基础权重 `q_w × Σ a_w(f)`，目标音出现越多越容易被抽中。
- **音级校准**：用 θ_f 调整权重 `q_w × Σ a_f × exp(Σ θ_f a_f)`，迭代使各 focus 的期望出现次数相等。
- **无放回系统抽样**：由权重求包含概率 π（Σπ = N），用不等概率系统抽样固定选出 N 个不重复词；期望由 π 保证，单轮允许波动。
- **以字代词**：某 focus 候选太少时从 `pool.chars` 加入单字候选，参与同一套抽样。
- 数据上确实无法达到相等期望的 focus 退出均衡集合但仍可被抽到；同 seed 完全可复现（`mulberry32`），每次进入阶段使用新 seed。

## 8. 教学备注与内容来源

每节课带 1–4 条 `lesson.tips`；声母 / 韵母知识点带 `atomMeta.anchors`（高频字锚点）与 `mnemonic`（一句话记忆法）。

- 教学页展示「本课技巧」与锚点行；记忆锚点只在新课（drill）显示，零声母全表课使用程序生成的汇总行，复习 / 考核课不显示。
- `scripts/curriculum/content.mjs` 的 `buildLessonTips` 按课程类型、focus 原子、方案键位与家族 / 规则动态组装文案。
- `data/words/anchors.json` 是构建期内容索引（`syllableChars` / `finalChars` / `initialChars`，每键取 8 个常用字），不进入运行时；生成规则为「按键 + 音组合出音节，取该音节高频字，非法音节回退为该韵母常用字」。
- 示例音节枚举由 `scripts/lib/pool-examples.mjs` 统一提供，build-pools 与 validate-all 共用；词典未收录音节放在 `data/words/syllable-patches.json`，不在代码内特判。

**教学备注来源**（调研整理，跨方案通用方法）：

- 脚手架式记忆与「先准确后速度」：[shuangpin.xyz 四步学习路线](https://shuangpin.xyz/blog/start-shuangpin/)
- 字组结合、5-5 原则与漏洞表：[oroc 七日上手双拼](https://blog.oroc.top/post/double-pinyin-guide/)
- 口诀与规律：[一文搞懂小鹤双拼](https://www.cnblogs.com/PeterJXL/p/18539136)
- 高频字与盲打训练：[键位记忆方法](https://www.php.cn/faq/3096414.html)、[提速技巧](https://www.php.cn/faq/3096337.html)
- 前后鼻音对比：[普通话测试站](https://putonghua.szu.edu.cn/info/1014/2862.htm)

方案相关部分（键位、同键伙伴、零声母写法）全部由 `data/schemes/*.json` 推导，不写死某套方案。

## 9. 数据契约与版本链

- 所有数据文件的契约类型在 `packages/core/src/types.ts`；构建期与运行期共用。
- 生成器与校验器共用 `scripts/lib/data-contract.mjs` 的 hash / 原子写 / 路径工具，保证版本算法一致：

```text
dataVersion = "curriculum-" + sha256(JSON.stringify({ chapters, lessons })).slice(0, 12)
dataVersion = "pools-"      + sha256(concat(sorted(fileName + fileContent))).slice(0, 12)
dataVersion = "words-"      + sha256(dictSha | pinyin-pro 版本 | 过滤参数 | count | 词条内容).slice(0, 12)
dataVersion = "training-"   + 由训练库内容重算
```

- 版本关系：`data/curriculum/index.json` 记录 5 套课程版本；`data/pools/index.json.sources = { curriculum: <xiaohe 课程版本>, dict: <jieba sha 前 12 位> }`；`data/packages/index.json` 汇总 19 个方案包；`apps/web/public/data/manifest.json` 记录 `versions{curriculum,pools,words,training}`、`defaultScheme`、`courses` 与文件清单。
- 数据目录职责、当前版本快照、重建顺序与质量指标见 [数据说明](DATA.md)。

## 10. Web 应用层

### 10.1 路由与外壳

- 路由：`/`（学习路线）、`/training`（练习场）、`/practice/:lessonId`（课程详情 / 练习），未知路径重定向到 `/`。
- `VITE_ROUTER_MODE=hash` 时使用 hash 路由（静态包），否则使用 history 路由（在线站点）；`VITE_BASE` 控制部署子路径。
- `App.vue` 负责：数据引导、全局快捷键（主题 `Alt+T`、音效 `Alt+B`、键位图 `Ctrl+K` / `Alt+K`、导航 `Alt+H` / `Alt+P`、帮助 `?`）、`ShortcutHelp`、路由过渡与页脚；练习页 / 练习场锁定视口高度。

### 10.2 Store 与数据流

| store | 职责 |
|---|---|
| `course` | single-flight 加载方案索引与方案包；当前方案、课程、词池索引、解锁标记；progress store 委派；纯练习方案预览 |
| `progress` | 按方案读写 `localStorage` 进度（通过 / 星级 / 最佳正确率 / attempts / clearedStages），带形状校验与容错 |
| `settings` | 主题（首次跟随系统，之后持久化） |
| `sound` | 音效开关与 Web Audio 合成 |
| `layout` | 顶栏上下文：阶段标题、底部键位图可用 / 显隐、快捷键面板开关 |

- **方案状态全站共享**：学习路线与练习场都通过 `course.selectScheme(id)` 切换；5 套课程方案走 `setScheme`（加载课程与进度），纯练习方案走 `previewScheme`（只加载方案与键位图，`previewMode = true`，课程 / 进度为空）。预览方案不写入 `shuangpin-next:scheme`，刷新后恢复上次保存的课程方案。
- 数据加载层 `lib/data.ts` 从 `import.meta.env.BASE_URL + data/` 读取方案包、词池、公共词库与训练库，同一数据只加载一次，失败不缓存 rejected Promise。

### 10.3 页面

- `LearnMapPage`：Hero + 继续学习 + 键位图 + 学习进度 + 章节路线；按方案记忆滚动位置（`sessionStorage`），纯练习方案显示占位说明；`Alt+1–5` / `Alt+6` 切方案，`Alt+U` / `Alt+C` 解锁 / 清除进度。
- `PracticePage`：只做状态分支与子组件编排；阶段状态机在 `usePractice`，规则全部在 core；顶栏显示课名与阶段标签。
- `TrainingPage`：配置页 + 会话两态；配置持久化按方案、隐藏范围过滤、文章解析与预设导入都在这里编排；会话核心在 `useTrainingSession`。

### 10.4 本地存储键

| 键 | 内容 |
|---|---|
| `shuangpin-next:theme` | `dark` / `light` |
| `shuangpin-next:sound` | 音效开关（`0` 关闭） |
| `shuangpin-next:scheme` | 上次保存的课程方案 id |
| `shuangpin-next:unlock-all` | 解锁全部课程标记 |
| `shuangpin-next:progress:<schemeId>` | 该方案的学习进度 |
| `shuangpin-next:training-config:<schemeId>` | 该方案的练习场配置 |
| `shuangpin-next:training-preset` | 课程 → 练习场的一次性预设（`sessionStorage`） |
| `shuangpin-next:map-scroll:<schemeId>` | 学习地图滚动位置（`sessionStorage`） |

所有读写都有容错；隐私模式 / 配额不足时降级为仅当前会话生效。

## 11. 方案包与共享数据

`scripts/scheme-packages/build.mjs` 把扁平数据组装成运行时方案包：

```text
data/packages/<scheme>/manifest.json     能力（course/training/article/zeroInitial/customStages）、
                                        curriculum profile、共享字词库引用
data/packages/<scheme>/scheme.json       方案键位映射
data/packages/<scheme>/curriculum.json   仅课程方案（standard-40）完整课程
data/packages/index.json                 19 个包的索引，保留 defaultScheme / recommendedOrder / courseSupported
```

- 5 套课程方案包带 `curriculum`，其余 14 套为 practice-only 包，只带方案映射与能力声明，不伪造课程。
- 课程词池、公共词库、训练库通过 `manifest.shared` 引用共享数据，不重复打包。
- `sync-data.mjs` 在同步前重建方案包，再把包目录与共享数据一起写入 `apps/web/public/data/`。
- Web 端 `loadScheme(id)` 可直接加载任意方案；纯练习方案在学习路线以预览模式展示（占位说明 + 完整键位图），在练习场可直接练习。C 双拼等整音节编码方案没有可逐字映射的声母 / 韵母，Hero 键帽使用 `ERROR` 兜底。

## 12. 测试与校验

- `packages/core/tests/`：`engine`（19 套方案 golden cases）、`pinyin`、`practice`、`selector`、`balancedSampling`、`session`、`stages`、`scoring`、`training`、`data-contract`（读根 `data/` 校验契约、版本链、命名法、learn 覆盖、示例全量与 public 同步）以及共享 helpers。
- `apps/web/tests/`：`progress`（进度读写容错 / 最优成绩）、`trainingConfig`（配置持久化与非法字段过滤）、`trainingGroups`（胶囊计数 / 全选 / 部分选中）。
- `pnpm verify` = typecheck + lint:ui + data:sync + test + build + validate。
- `scripts/validate-all.mjs`：方案 19 套与判题用例、5 套课程 40 课 / 10 章 / 326 分钟与命名法、词表 / 词池 / 训练库契约与质量阈值、版本链重算、`public/data` 逐字节一致、方案包能力、文档与截图守卫。
- `scripts/check-ui-conventions.mjs`：组件样式无裸色值、token 无未使用项、练习场上下文色调契约、全局 chip 样式唯一、文档截图引用存在。
- 文档守卫：README 导航必须覆盖 `docs/*.md`，全部必存在文档清单由 `validate-all.mjs` 维护；README / `docs/*.md` 引用的 `docs/assets/impl` 截图必须存在且不遗留未被引用的截图。

## 13. 边界与来源

- 参考项目：[BlueSky-07/Shuang](https://github.com/BlueSky-07/Shuang)（GPL-3.0）：仅键位映射作为事实来源，参考克隆不参与构建；`data/schemes/` 视为冻结数据并记录 provenance。
- 词表 / 词频：[jieba](https://github.com/fxsjy/jieba)（MIT）；拼音转换：[pinyin-pro](https://github.com/zh-lx/pinyin-pro)（MIT，仅构建期）。
- 尚未实现：账号与云同步、SRS 复习、自定义方案编辑、数据可视化后台。
- 发布流程、静态包与工作流见 [发布说明](RELEASE.md)；许可与第三方声明见 [README](../README.md#来源与第三方许可)。
