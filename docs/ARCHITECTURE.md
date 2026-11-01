# 架构说明

[← 文档导航](../README.md#文档导航)

## 架构原则

- 领域规则集中在 `packages/core`：拼音、方案、判题、展示模型、选词、阶段、评分、统计；Web 只做编排与渲染。
- 数据驱动：键位与 free / learn 划分来自 `data/schemes/<id>/scheme.json`（`SchemeEngine.diff()`），代码不硬编码某套方案。
- 契约与校验：数据契约类型在 core，数据与校验器共用 `scripts/lib/data-contract.mjs` 的 hash / 原子写工具。

## 仓库结构

```text
apps/web/src/         App / router / pages / composables / components / stores / lib / styles
packages/core/src/    types / pinyin / scheme / practice / selector / balancedSampling /
                      stages / session / scoring / atoms / random / training
packages/core/tests/  领域与数据契约测试
apps/web/tests/       progress / trainingConfig / trainingGroups
data/                 schemes/<id>/（scheme + curriculum）/ engine-cases / lexicon
scripts/              数据构建、方案打包、同步、校验、静态包启动器
docs/                文档与 assets/impl 截图
```

## 领域层

```text
Syllable      { text, pinyin, initial, final, tone?, zeroInitial }
Final         = 33 个规范韵母（ü 记 v）+ 只作零声母的 er
ZERO_INITIALS = 12 个零声母音节（a o e ai ei ao ou an en ang eng er）
AtomId        = initial:<声母> | final:<韵母> | zero:<零声母音节>
```

- `zh/ch/sh` 是独立声母；零声母不占声母键，由方案给出完整两键序列。零声母标签统一为「零 <音节>」。
- **j/q/x/y + ü**：标准/推荐主键取 `finals[u]`；V 键兼容码显式写入方案 `compatCodes`；n/l 后的 ü 取方案 ü 键。拼写规范化与非法音节过滤在 `pinyin.ts`。

**方案引擎**（`scheme.ts`）对方案数据 `initials / finals / zeroInitial / recommended / compatCodes / type` 提供：

```text
acceptedSequences(syllable)  全部可接受键序列（零声母整段 / override 整段 / 声母×韵母笛卡尔积；去重保序）
primarySequence(syllable)    展示主键
judge(input, syllable)       是否命中任一可接受序列
keysForAtom(atom)            知识点主键（零声母返回整段）
keyMap()                     三行键盘映射
diff()                       free / learn 划分：single key && value === atom 即 free
freeAtomsOf(def)             与全拼一致的 free 原子（练习场「全拼沿用」）
```

数组值表示「任一命中即正确」；19 套方案的 golden cases 在 `data/schemes/engine-cases.json`，`engine.test.ts` 全量校验。

## 课程与阶段

课程数据 `data/schemes/<id>/curriculum.json`：5 套方案 × 40 课 / 10 章，模板 1.0.0。

```text
LessonDef { id, chapterId, kind, title, desc, estimatedMinutes, focusAtoms, blockingAtoms,
            nonBlockingAtoms, prerequisites, wordPlan, passCriteria?, atomMeta,
            zeroExamples?, tips, stageMinWords?, reviewFamily? }
kind      intro（入门）/ drill（新课）/ review（复习、期中、综合）/ exam（通关）
```

- 只有 `initial/final` 阻塞选词；`prerequisites` 是此前 focus 的累计集合，复习范围直接取 `prerequisites`。
- 同键双韵合并成一课（`ia/ua`、`iang/uang`、`ong/iong`、`ue/ve`）；零声母 12 音节在一课内一次教完。
- `stageMinWords` 定义各阶段最低词数；`passCriteria` 定义正确率与可选速度门槛；`tips`、`atomMeta` 由内容库与锚点数据生成。
- `lessonStages` 给出阶段；`hintTierFor` 决定提示档位；`stageGate` 判定阶段是否达标。每阶段保留独立 `SessionState`，切换时用 `resumeSession` 恢复，已达标阶段记录在进度 `clearedStages` 中。

## 会话与判题

`session.ts` 是输入、错误与统计的状态机：

- `normalizeKeyInput`：合法键为小写字母与 `;`；`applyKey` 逐字推进、整字判题（多解容错）。
- 判错后保留错误输入并锁定该字；退格逐键撤销并解除错误；同一个字第 3 次错误后揭示答案。
- `appendSessionWords` 支持无尽追加（练习场）；`resumeSession` 恢复会话且暂停不计入速度。
- `sessionMetrics`：正确率 = 正确字数 /（正确字数 + 错误次数），速度按正确字数 / 用时换算；`useLiveCpm` 提供会话实时速度。

## 评分

`scoring.ts` 是唯一实现：

- `accuracyTiers` / `speedTiers` 生成分档与星级，`evaluateLesson(lesson, metrics)` 返回 `{ passed, stars }`。
- 正确率 / 准确率+速度模式下 `revealed` 阻止最高星；速度模式只看速度分档。
- `describePassCriteria` 生成教学页评分文案。星级与门槛由课程数据 `passCriteria` 决定，用户规则见[学习指南](LEARNING.md)。

## 概率均衡选词

`selector.ts` + `balancedSampling.ts` 为词语 / 考核阶段组卷：

- `newFocus = blockingAtoms - prerequisites`，free 原子视为已学；候选分层 S（未知 ⊆ newFocus）/ A（额外预习 ≤ `maxUnfamiliar`）/ B（无未知）。
- 零声母逐音节门禁；候选记录每个 focus 音的出现次数，按出现次数加权。
- 用 θ 做音级校准，使各 focus 期望出现次数相等；再按不等概率系统抽样选出不重复词。
- 候选不足时以 `pool.chars` 单字补充；同 seed 完全可复现（`mulberry32`）。

## 课程 Hero 与练习场

- 课程、入门试打与练习场使用同一套 PracticeStream / CharacterCard 渲染；
- 判题接受 `accepted` 全部合法序列；显示仍使用 `primarySequence` 作为标答键帽。

## 键输入管线

字符输入只有一条链路：

```text
物理键盘 keydown ─┐
                  ├─→ useKeyInput.dispatch → pressedKeys + 订阅者
键位图点击 ───────┘
```

- `useKeyInput` 在应用根节点安装唯一的字符输入监听，统一处理字母、`;` 与退格；过滤组合键、IME、repeat 和输入框焦点；
- `KeyboardMap` 是独立交互组件，点击按键直接向输入层派发，不再由各页面维护 `pressed`；
- `SchemeKeycaps` 订阅同一输入层，物理按键和键位图点击都会触发键帽动画；
- 练习页/练习场只订阅自己的判题处理器，不再各自注册字符快捷键；
- 输入层不播放声音：有 Hero 键帽的页面由键帽负责，练习会话由页面处理器负责，保证一次输入只有一次声音。

## 方案判题

音节判题只有两层：

1. 命中 `recommended` 或 `compatCodes` 的完整键序列直接成功；
2. 否则按 `initials[声母] × finals[韵母]` 组合匹配，命中任一组合即成功。

兼容编码是**额外接受**，不会禁用组合展开。`primarySequence` 取 `recommended`，没有则取兼容编码第一条，再没有则取组合第一条，用于 Hero / 标答展示。没有一字多码的方案不需要 `recommended` / `compatCodes`。

## 教学备注与来源

- 课程 `atomMeta.anchors/mnemonic` 和教学示例已冻结在 curriculum 数据中；运行期示例由 `apps/web/src/lib/lessonPool.ts` 从 Lexicon 的 `syllableExamples` 派生。
- 不再保留词表/课程生成器；Lexicon 与 curriculum 是权威数据，修改后直接校验并同步。

教学备注来源（调研整理）：[shuangpin.xyz 四步学习路线](https://shuangpin.xyz/blog/start-shuangpin/)、[oroc 七日上手双拼](https://blog.oroc.top/post/double-pinyin-guide/)、[一文搞懂小鹤双拼](https://www.cnblogs.com/PeterJXL/p/18539136)、[普通话测试站前后鼻音对比](https://putonghua.szu.edu.cn/info/1014/2862.htm)。

## 数据契约与版本链

```text
curriculum-<12hex> = sha256(JSON.stringify({ chapters, lessons }))
lexicon-<12hex>    = sha256(Lexicon 内容)
```

课程索引、统一 Lexicon、方案包索引与 `apps/web/public/data/manifest.json` 保存对应版本；数据格式与校验流程见[数据说明](DATA.md)。

## Web 应用层

- **路由**：`/`、`/training`、`/practice/:lessonId`；`VITE_ROUTER_MODE=hash` 用 hash 路由（静态包），否则 history 路由；`VITE_BASE` 控制部署子路径。
- **Store**：`course`（方案索引 / 包加载、当前方案、课程、统一 Lexicon、解锁标记、进度委派）、`progress`（按方案持久化进度与 `clearedStages`）、`settings`（主题）、`sound`（音效）、`layout`（阶段标题、底部键位图显隐、快捷键面板）。
- **方案切换**统一走 `course.selectScheme(id)`；数据加载层 `lib/data.ts` 从 `BASE_URL + data/` 读取方案包、课程与统一 Lexicon，同一数据只加载一次。
- **页面**：`LearnMapPage`（Hero、继续学习、键位图、进度、章节路线、滚动位置记忆）、`PracticePage`（阶段状态机在 `usePractice`，规则在 core）、`TrainingPage`（配置持久化、范围过滤、文章解析；会话核心在 `useTrainingSession`）。

本地存储键：

```text
shuangpin-next:theme                       dark / light
shuangpin-next:sound                       音效开关（0 关闭）
shuangpin-next:scheme                      上次保存的课程方案
shuangpin-next:unlock-all                  解锁全部课程标记
shuangpin-next:progress:<schemeId>         学习进度
shuangpin-next:training-config:<schemeId>  练习场配置
shuangpin-next:training-preset             课程 → 练习场一次性预设（sessionStorage）
shuangpin-next:map-scroll:<schemeId>       学习地图滚动位置（sessionStorage）
```

## 方案包

`scripts/scheme-packages/build.mjs` 从每方案文件夹生成运行时包：

```text
apps/web/public/data/packages/<scheme>/manifest.json  能力声明（生成）
apps/web/public/data/packages/<scheme>/scheme.json    方案键位映射（生成）
apps/web/public/data/packages/<scheme>/curriculum.json 仅课程方案（生成）
apps/web/public/data/packages/index.json               19 个包的索引（生成）
```

运行期只发布方案包、课程和统一 Lexicon；`sync-data.mjs` 从每方案源目录重建 public 方案包，课程与练习场共享同一份词表。

## 测试与校验

- core 测试覆盖方案引擎、拼音、练习模型、选词、会话、阶段、评分、练习范围与文章解析、数据契约；web 测试覆盖进度持久化、练习配置与分组选择。
- `pnpm verify` = typecheck + lint:ui + data:sync + test + build + validate。
- `validate-all.mjs` 校验方案 / 课程 / 统一 Lexicon 契约、版本链、`public/data` 逐字节一致、方案包与文档截图守卫；`check-ui-conventions.mjs` 校验组件样式无裸色值、token 无未使用项、练习场色调契约与文档截图引用。
