# 数据说明

[← 文档导航](../README.md#文档导航)

数据源、运行时产物与校验流程，以及新增 / 适配双拼方案所需的规则。

`data/` 是权威源数据；`apps/web/public/data/` 是 `pnpm data:sync` 生成的运行时副本。

## 目录

```text
data/
  schemes/
    index.json              方案索引：方案清单 / 默认方案 / 推荐顺序 / 定制课程
    engine-cases.json       19 套方案的判题用例
    <id>/
      scheme.json           键位、推荐码、兼容编码
      curriculum.json       仅 5 套定制课程的课程数据
  lexicon/
    lexicon.json            词表：entries（文本 + 词频）+ syllableExamples
```

通用课程没有课程文件：浏览器加载方案后由 core 按模板生成。运行时加载的文件为 `index.json`、`schemes/<id>.json`、5 套定制方案的 `curriculum/<id>.json`、`lexicon/lexicon.json`。

## 数据流

```text
data/（权威源数据）
  → pnpm data:sync
  → apps/web/public/data/（紧凑 JSON）
  → lib/data.ts loader
  → core（判题 / 课程生成 / 词表解析）
  → stores / composables / 页面
```

Web 启动只加载 `index.json`，选定方案后加载 `scheme.json` 与词表元信息：定制方案再读取课程文件，其余方案直接用 `scheme.json` 生成通用课程。完整词表在进入教学 / 练习时加载并由 pinyin-pro 解析。

## 方案索引 data/schemes/index.json

```json
{
  "defaultScheme": "xiaohe",
  "schemes": [{ "id": "xiaohe", "name": "小鹤双拼" }],
  "customCourses": ["xiaohe", "weiruan", "ziranma", "pinyinjiajia", "sougou"]
}
```

| 字段 | 作用 |
|---|---|
| `defaultScheme` | 默认方案 id |
| `schemes` | 按 UI 顺序排列的方案 id 与显示名 |
| `customCourses` | 有定制课程文件的方案 id；其余方案运行时生成通用课程 |

方案统计（键数、原子数量、课程能力等）不写入索引，需要时从 `scheme.json` 与 core 现算。

## 判题用例 data/schemes/engine-cases.json

19 套方案的判题夹具，不参与应用运行：

| 字段 | 含义 |
|---|---|
| `positive` | 合法音节及其 `accepted` 键序列 |
| `negative` | 应被拒绝的输入与拒绝类型 |
| `semantics` / `kindLegend` / `negativeKinds` | 用例语义与类型说明 |
| `coverage` / `dataGaps` | 覆盖信息与已知缺口 |

当前 1,725 条正例、180 条反例；拒绝类型为 `full-pinyin` / `wrong-zero-family` / `override-bypass` / `wrong-key`。`packages/core/tests/engine.test.ts`、`data-contract.test.ts` 与 `scripts/validate/schemes.mjs` 消费这些用例。

### 全拼沿用 / 零声母 / 兼容编码

- **全拼沿用（free）**：键位与全拼拼写一致的声母、韵母、零声母音节，由 `freeAtomsOf` 从方案数据派生；它们始终视为已会，不单独出课，也不进入「隐藏 / 焦点」候选；
- **零声母**：零声母音节是独立的 `zero:` 原子；与全拼一致的属于全拼沿用，不一致的属于 learn 原子，和声母 / 韵母使用同一套已学、出现、隐藏、焦点规则；
- **兼容编码（compatCodes）**：同一音节的额外合法键序列，不是原子，不能独立选择、隐藏或作为焦点；只参与判题、键位图与编码 tips 展示。

## 方案 scheme.json

| 字段 | 说明 |
|---|---|
| `id` / `name` / `type` | 方案 id、显示名、形态标记 |
| `initials` | 声母 → 键数组，任一命中即正确 |
| `finals` | 韵母 → 键数组，任一命中即正确 |
| `zeroInitial` | 零声母音节 → 完整键序列数组，首条为主键 |
| `recommended` | 多解音节的标答序列 |
| `compatCodes` | 无法由声母 / 韵母组合得到、但额外接受的序列 |
| `umlautNote` / `sameKeyGroups` / `source` / `notes` | ü 说明、同键组、来源与备注 |

```text
accepted = recommended ∪ compatCodes ∪ (initials × finals)
primary  = recommended ?? compatCodes[0] ?? composition[0]
```

所有键位值为 `string[]`；数组语义为任一命中即正确。声母 × 韵母天然多解时必须写 `recommended`；`compatCodes` 只含无法由组合得到的序列。零声母用 `zeroInitial` 数组表达多条合法码，首条为主键。

## 课程 curriculum.json

5 套定制方案（小鹤、微软、自然码、拼音加加、搜狗）各有 `data/schemes/<id>/curriculum.json`：

```json
{ "chapters": ["..."], "lessons": ["..."] }
```

课程源字段：

| 字段 | 说明 |
|---|---|
| `chapters` | `id` / `order` / `title` / `subtitle` |
| `lessons` | `id` / `chapterId` / `kind` / `title` / `desc` / `focusAtoms` / `passCriteria?` / `tips?` |

课程只在文件中保存结构与人工文案。加载时由 core `hydrateCurriculum` 派生 `blockingAtoms` / `nonBlockingAtoms` / `prerequisites`（入门课后加入全部全拼沿用原子，再累计此前 focusAtoms）与 `wordPlan`（入门课 2–3 字，其余 2–5 字）。

### 通用课程（运行时生成）

其余 14 套方案没有课程文件：`course` store 加载 `scheme.json` 后调用 core `buildUniversalCurriculum(scheme)` 生成：

- 入门 → 单韵母 → 单声母 → 复合声母 → 前响 / 中响 / 后响复韵母 → 基本后鼻 / 前鼻韵母 → 带介前鼻 / 后鼻韵母 → 零声母 → 最终章；期中按前后新课数均衡插入；
- 每个 learn 原子一节课，free 原子直接视为已会；章末复习只覆盖本章；最终章为综合 → 速度 → 最终考核；
- 生成结果与定制课程同构，同样补齐 `blockingAtoms` / `nonBlockingAtoms` / `prerequisites`。

### 运行时派生内容

键位、free 标记、记忆锚点、教学示例与推荐码 / 兼容码提示都由方案数据 + 词表实时生成，不写入课程文件：

| 内容 | 来源 |
|---|---|
| 原子键位 / free | `SchemeEngine.keysForAtom` / `freeSets` |
| 记忆锚点 / mnemonic | `core.buildAtomMemory(engine, atomId, chars)`：只在声母与同键韵母、韵母与同键声母能组成真实音节且词表有对应单字时生成；没有可用同键组合时不生成锚点 |
| 教学示例 | `core.buildLessonPool(lesson, lexicon)` 取 `lexicon.syllableExamples` |
| 推荐码 / 兼容码 tips | `core.buildLessonCodeTips(engine, lessons)`：放到课程范围首次包含完整音节的课程；没有课程覆盖时放到第一节正式练习课；每 5 条合并为一条 |

## 词表 lexicon.json

课程、入门课与练习场共用；只存文本与词频，不存拼音：

- `entries`：53,272 条，按词频降序；50,000 条 2–5 字词 + 3,272 个单字；
- `syllableExamples`：405 个音节的代表字示例。

拼音由 [pinyin-pro](https://github.com/zh-lx/pinyin-pro) 解析（`toneSandhi: false`，`ü → v`，轻声 0/5 映射为第 5 声）；运行时 Web 侧解析词表。文章练习不查词表，直接拆字后按上下文解析拼音。

### 生成词表

源词典为 [jieba](https://github.com/fxsjy/jieba) `dict.txt`（MIT），放在 gitignored 的 `data/raw/`：

```bash
mkdir -p data/raw
curl -L -o data/raw/jieba-dict.txt https://raw.githubusercontent.com/fxsjy/jieba/master/jieba/dict.txt
pnpm data:lexicon
pnpm data:sync
pnpm validate
```

规则：

- 2–5 个汉字；排除人名（`nr` / `nrfg` / `nrt`）、机构（`nt`）、其他专名（`nz`）；
- 地名（`ns`）保留 2 字且词频 ≥100，或 3–5 字且词频 ≥500；
- 按词频降序取前 50,000 词，同频按文本排序；
- 单字取 GB2312 常用字，每个音节按词频取前 10；没有常用字的音节（eng / kei / chua / den）回退到 `syllableExamples` 的示例字；
- 全部条目须能解析为本应用音节。

## 运行时副本 apps/web/public/data/

| public 路径 | 来源 |
|---|---|
| `index.json` | `data/schemes/index.json` |
| `schemes/<id>.json` | `data/schemes/<id>/scheme.json` |
| `curriculum/<id>.json` | 5 套定制课程 |
| `lexicon/lexicon.json` | `data/lexicon/lexicon.json` |

共 26 个文件、约 1.7 MiB（词表约 1.6 MB）。`apps/web/public/data/` 由 `pnpm data:sync` 重建；Web 只通过 `apps/web/src/lib/data.ts` 读取。

`scripts/sync-data.mjs` 单向、原子同步：校验索引一致性 → 紧凑 JSON 写入临时目录 → 整体替换目标目录 → 打印文件数与体积。`pnpm dev` / `pnpm build` 启动前自动同步。

## 版本

数据文件不写版本字段；结构由校验器与 core 测试保证，public 副本由 `data:sync` 重建。

## 校验 pnpm validate

`node scripts/validate-all.mjs` 编排五个域：

| 模块 | 内容 |
|---|---|
| `schemes.mjs` | 索引一致；方案目录一致；每套方案可构造 engine；`engine-cases.json` 覆盖全部方案 |
| `lexicon.mjs` | 词表规模下限；词条仅汉字且无重复；全部可解析；每个音节至少 1 个单字 |
| `curriculum.mjs` | 5 套定制课程结构校验；14 套通用课程重新生成并校验结构 |
| `public-data.mjs` | public 文件清单与 `data/` 一致；逐文件深相等且为紧凑 JSON |
| `docs.mjs` | 文档入口、README 导航、本地链接与废弃目录检查 |

完整顺序：`pnpm data:sync` → `pnpm validate`（`pnpm verify` 已内置）。

## 修改数据

| 目标 | 做法 |
|---|---|
| 词表 | 改 `scripts/build-lexicon.mjs` 或 `data/raw/jieba-dict.txt` → `pnpm data:lexicon` → `pnpm data:sync` → `pnpm validate` |
| 定制课程 | 编辑 `data/schemes/<id>/curriculum.json` → `pnpm data:sync` → `pnpm validate` |
| 通用课程 | 修改 `packages/core/src/curriculum.ts` 的课程模板 → `pnpm test` → `pnpm validate` |
| 方案键位 / 推荐码 / 兼容码 | 编辑 `data/schemes/<id>/scheme.json`，同步 `engine-cases.json` → `pnpm data:sync` → `pnpm validate` |
| 新增方案 | 见[适配新方案](DATA.md#适配新方案) |

## 适配新方案

新增一套双拼方案，需要提供键位数据、登记索引、补判题用例。课程路线默认由方案数据生成；只有需要人工设计课程时，才额外提供课程文件。

### 1. 编写 `scheme.json`

路径 `data/schemes/<id>/scheme.json`，必填字段：

| 字段 | 内容 |
|---|---|
| `id` / `name` / `type` | 方案 id、显示名、形态标记（`compositional` / `syllable-code` / `hybrid`） |
| `initials` | 23 个声母 → 键位数组 |
| `finals` | 33 个韵母 → 键位数组 |
| `zeroInitial` | 12 个零声母音节 → 完整键序列数组，首条为主键 |
| `recommended` | 多解音节的推荐码 / 标答序列 |
| `compatCodes` | 无法由声母 × 韵母组合得到的额外接受序列 |
| `umlautNote` / `sameKeyGroups` / `source` / `notes` | ü 说明、同键分组、来源与维护备注 |

数据规则：

- `initials` / `finals` / `zeroInitial` 的值都是 `string[]`；数组表示多条合法键位，命中任意一条即正确；
- zeroInitial 的数组首条是主键，其余是同一零声母音节的额外合法码；
- 声母 × 韵母存在天然多解时，必须写 `recommended` 指定标答；推荐码可以与组合不同，也可以覆盖组合；
- `compatCodes` 只写**组合无法得到**的额外合法序列，例如 `D;`、`CV`；能由声母键 + 韵母键直接拼出的序列不放进这里；
- `free` / `learn` 不需要手写，由 `SchemeEngine` 根据方案数据与全拼习惯现算；
- `j/q/x/y + ü` 的写法、`n/l + ü` 的书写方式按方案实际键位登记；`analyzeSchemeCodes` 会解析推荐码 / 兼容码里的每个音节，`unresolved` 必须为空。

字段形状：

```json
"recommended": { "<音节>": "<完整标答键序列>" },
"compatCodes": { "<音节>": ["<额外合法键序列>"] }
```

- `recommended` 是该音节的标答；练习判题以它为主键；
- `compatCodes` 是额外接受码：判题通过，但不会被当作主键或课程 tips 的推荐码。

### 2. 登记方案索引

编辑 `data/schemes/index.json`：

```json
{
  "defaultScheme": "xiaohe",
  "schemes": [
    { "id": "xiaohe", "name": "小鹤双拼" },
    { "id": "new-scheme", "name": "新方案" }
  ],
  "customCourses": []
}
```

- `schemes` 的顺序就是 UI 中的方案顺序；
- `defaultScheme` 只在替换默认方案时修改；
- 使用运行时生成的通用课程时，`customCourses` 不登记；需要定制课程时，把 id 加入 `customCourses`。

### 3. 补判题用例

在 `data/schemes/engine-cases.json` 的 `schemes` 下增加该方案：

```json
"new-scheme": {
  "id": "new-scheme",
  "name": "新方案",
  "type": "compositional",
  "positive": [
    {
      "pinyin": "a",
      "kind": "zeroInitial",
      "initial": "",
      "final": "a",
      "zeroInitial": true,
      "accepted": ["aa"]
    }
  ],
  "negative": [
    {
      "pinyin": "a",
      "rejected": ["a"],
      "kind": "full-pinyin",
      "reason": "零声母需使用整段键序列"
    }
  ],
  "coverage": { "positiveCount": 1, "negativeCount": 1 }
}
```

`positive` 至少覆盖：

- 全部声母、韵母、零声母音节；
- 多键 / 飞键映射的全部合法序列；
- 有 `recommended` 覆盖的音节；
- 有 `compatCodes` 的音节。

`negative` 覆盖常见错误：

| kind | 含义 |
|---|---|
| `full-pinyin` | 直接输入全拼，未转成双拼键位 |
| `wrong-key` | 使用了该音节不接受的键位 |
| `wrong-zero-family` | 零声母前缀家族错误 |
| `override-bypass` | 有整音节 override 时仍使用组合展开键位 |

校验器要求 `engine-cases.schemes` 的方案集合与索引完全一致，正例 / 反例达到最低规模。

### 4. 课程路线

**默认：运行时生成。**

不创建 `curriculum.json`，也不加入 `customCourses`。加载该方案时，core 会：

- 构造 `SchemeEngine`，计算 free / learn 原子；
- 按模板生成「入门 → 单韵母 → 单声母 → 复合声母 → 复韵母 → 鼻韵母 → 零声母 → 综合 / 速度 / 最终考核」；
- 每个 learn 原子一节课，free 原子直接视为已会；
- 章末复习、期中、最终考核按模板插入。

生成结果与定制课程同构，不需要额外数据。

**可选：定制课程。**

只有需要调整课程结构或写人工文案时才创建 `data/schemes/<id>/curriculum.json`：

```json
{
  "chapters": [{ "id": "ch-intro", "order": 1, "title": "入门", "subtitle": "认识双拼" }],
  "lessons": [
    {
      "id": "L1.1",
      "chapterId": "ch-intro",
      "kind": "intro",
      "title": "入门 · 认识双拼",
      "desc": "先看提示打对，再逐步撤掉提示。",
      "focusAtoms": []
    }
  ]
}
```

- 课程源数据只写 `chapters` 与 `lessons`；
- `blockingAtoms` / `nonBlockingAtoms` / `prerequisites` / `wordPlan` 由加载时派生；
- 人工 tips 写在 `lesson.tips`；推荐码 / 兼容码提示由运行时生成；
- 创建文件后，把 id 加入 `index.json` 的 `customCourses`；
- 定制课程结构由 `scripts/validate/curriculum.mjs` 校验：章节顺序、课程 id、focus 原子、课型、评分门槛与最后一课考核。

### 5. 运行与验收

```bash
pnpm data:sync    # 同步索引 / 方案 / 定制课程 / 词表到 public/data
pnpm validate     # 五域校验
pnpm verify       # 完整验证
```

验收清单：

- `scheme.json` 字段齐全，`createSchemeEngine` 可构造；
- 索引中已有该方案，`defaultScheme` / `customCourses` 合法；
- 方案目录与索引一一对应；
- `engine-cases.json` 覆盖该方案，正例全部接受、反例全部拒绝；
- 所有多解音节有 `recommended`；`compatCodes` 只含组合无法得到的序列；
- `analyzeSchemeCodes(def).unresolved` 为空；
- 运行时生成课程可打开、可完成至少一节新课；
- 若为定制课程，`customCourses` 与课程文件一致，课程结构与最后一课考核通过校验；
- `pnpm verify` 全绿。

## 当前数据状态

- 19 套方案，全部有学习路线：5 套定制课程，14 套运行时生成；
- 词表：50,000 条词语 + 3,272 个单字 + 405 个音节示例；
- 判题用例：1,725 条正例 + 180 条反例；
- 18 套有 `recommended` / `compatCodes`，`yunbiaokuaipin` 无多码；C 双拼兼容码 32 组、大牛双拼 12 组，其余 16 套各 4 组；
- 运行时数据共 26 个文件、约 1.7 MiB。
