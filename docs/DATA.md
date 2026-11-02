# 数据说明

[← 文档导航](../README.md#文档导航)

数据源、运行时产物与校验流程，以及新增 / 适配双拼方案所需的全部规则。

数据分两层：仓库里的 `data/` 是**唯一权威源数据**（人工维护、2 空格缩进可读）；`apps/web/public/data/` 是构建期由 `pnpm data:sync` 单向生成的**运行时副本**（紧凑 JSON、gitignored 生成物，不要手工编辑）。

## 数据源 `data/`

`data/` 共 41 个文件（不含 gitignored 的 `data/raw` 下载缓存），只有两个数据域：

```text
data/
  schemes/
    index.json              方案索引：方案清单 / 课程能力 / 默认方案 / 推荐顺序
    engine-cases.json       19 套方案的判题用例（正例、反例、覆盖说明）
    <id>/
      scheme.json           键位、推荐码、兼容编码（19 套）
      curriculum.json       课程（19 套：5 套定制 full + 14 套生成 simplified）
  lexicon/
    lexicon.json            统一词表：words / chars / syllableExamples
```

- 不再存在其它数据目录（旧的词池 / 独立词表 / 训练数据目录已删除，`pnpm validate` 会检查它们不存在）。
- 运行时只发布 4 类数据文件；方案清单与课程清单都由 `data/schemes/index.json` 一处表达。

### 方案索引 `data/schemes/index.json`

| 字段 | 作用 |
|---|---|
| `version` / `generatedBy` / `reference` / `semantics` | 索引自身的版本、来源与语义说明（文档性元数据） |
| `defaultScheme` | 默认方案 id（当前 `xiaohe`） |
| `recommendedOrder` | UI 中 19 套方案的推荐顺序 |
| `courseSupported` | 有课程的方案 id 列表（当前 19 套全部有课程）；**课程清单唯一来源** |
| `schemes` | 每套方案摘要：`id` / `name` / `type` / `file` / `keys` / `atoms` / `zeroInitialFamily` / `zeroInitialRule` / `ambiguity` / `course` / `recommendation` / `dataGaps` |
| `dataQuality` | 信息性质量快照（如已知同码等）；校验器不校验，更新数据时可能滞后 |

`pnpm data:curriculum` 会更新 `courseSupported` 与课程方案的 `schemes[].course`（`supportsGuidedCourse` / `courseTier` / `reason` / `courseNotes`）；其余元数据由人工维护；索引不保存派生统计（如按类型计数、各方案 learn 原子数等），需要时由脚本按数据现算。新增方案见[适配新方案](DATA.md#适配新方案)。

### 统一 Lexicon

`data/lexicon/lexicon.json` 是课程与练习场共用的唯一词表：

- `words`：清洗后的 29,660 条 2–5 字词（去专名、字母、低频）；
- `chars`：每音字频 top10 的小字符库，3,009 字；
- `syllableExamples`：405 个音节的代表字示例；
- `dataVersion`：形如 `lexicon-<12 位 hex>` 的内容版本标识。

课程按 lesson 的已学原子 / focus 在 core 选词器中筛选，练习场按当前选择范围筛选；题目全部来自 Lexicon。修改词表直接编辑该文件（Lexicon 是权威数据），并同步更新 `dataVersion`。

## 课程

19 套方案都有课程，文件为 `data/schemes/<id>/curriculum.json`，包含章节（`chapters`）、课程（`lessons`：focus / blocking / prerequisites / wordPlan / passCriteria / tips / atomMeta 等）与 `dataVersion`。`supportLevel` 区分两类：

| supportLevel | 数量 | 方案 | 维护方式 |
|---|---|---|---|
| `full` | 5 | 小鹤 / 微软 / 自然码 / 拼音加加 / 搜狗 | 定制完整课程，直接编辑，数据是权威 |
| `simplified` | 14 | 其余方案 | 由 `scripts/generate-universal-curriculum.mjs` 从 `scheme.json` + Lexicon 自动生成 |

来源标记：生成课程写 `origin: "generated"`；定制课程不写 `origin` 字段（字段缺失即定制）。不要用 `generatedAt` 判断来源，两类课程都有该时间字段。

### 通用课程生成

`pnpm data:curriculum` 只重建 `simplified` 课程，`supportLevel: "full"` 的课程一律跳过、原样保留：

- 章节模板：入门 → 单韵母 → 单声母 → 复合声母 → 前响 / 中响 / 后响复韵母 → 基本后鼻 / 前鼻韵母 → 带介前鼻 / 后鼻韵母 → 零声母 → 最终章；期中按「左右新课数差最小 → 章数差最小 → 更早边界」插入；
- 每个 learn 原子一节课、不合并；与全拼一致的 free 原子直接作为已会内容，不单独排课；
- 章末生成复习课，范围只含本章原子；期中 / 综合 / 最终考核才用累计已学范围；最终章为综合 → 速度 → 最终考核（考核必须是最后一课）；
- 推荐码例外与兼容编码不单独设课，按「目标音节最后学到的 learn 原子」写入对应原子课 tips；两端都是 free 原子的编码写入第一个非入门课；
- 生成课程的 tips 只保留「推荐码：」「兼容映射：」两类可验证内容，不写泛化教学文案。

课程模板（阶段门槛、词量、评分模式、章节顺序、期中边界算法、编码分组策略）的唯一来源是 `scripts/lib/curriculum-template.mjs`，生成器与校验器共用；其中阶段门槛数值直接复用 core 的 `KIND_STAGE_MIN_WORDS`。**修改模板会改变全部 14 套生成课程**：改完必须运行 `pnpm data:curriculum`，确认 `data/` 的 diff 符合预期，再同步与校验。

定制 full 课程是独立数据，校验器无法重新生成比对，保留严格的结构 / 累计前置 / 原子覆盖检查；改完直接 `pnpm data:sync` + `pnpm validate`。

## 运行时数据 `apps/web/public/data/`

运行时只读 4 类文件，全部由 `pnpm data:sync` 生成（紧凑 JSON、无缩进）：

| public 路径 | 来源 | 说明 |
|---|---|---|
| `index.json` | `data/schemes/index.json` | 方案索引原样内容（不追加任何字段） |
| `schemes/<id>.json` | `data/schemes/<id>/scheme.json` | 每套方案 19 份 |
| `curriculum/<id>.json` | `data/schemes/<id>/curriculum.json` | 有课程的方案 19 份 |
| `lexicon/lexicon.json` | `data/lexicon/lexicon.json` | 统一词表 |

- 共 40 个文件、约 10.9 MiB（旧版运行时目录约 28 MiB，紧凑序列化后减少约 61%）；
- `apps/web/public/data/` 已加入 `.gitignore`，是纯生成物：可以直接删除并重建，不要手工编辑或提交；
- Web 侧只在 `apps/web/src/lib/data.ts` 中按上述 4 条路径加载，不存在其它运行时数据路径。

## 同步 `pnpm data:sync`

`scripts/sync-data.mjs` 是**单向、原子**同步：

1. 读取 `data/schemes/index.json` 并校验索引一致性（`courseSupported` 无重复且都能在 `schemes` 中找到、`defaultScheme` 有课程）；
2. 生成 40 个文件的同步计划（4 类产物），全部以紧凑 JSON 写入目标同级临时目录；
3. 全部写成功后整体替换 `apps/web/public/data/`；失败则保留旧目录，不会留下半成品或旧文件残留；
4. 打印文件数、体积与 `versions`：`defaultScheme` + 每套课程的 `dataVersion` + Lexicon 的 `dataVersion`。

同一份 `data/` 反复同步结果逐字节一致；`apps/web/public/data/` 不存在时会直接重建。`pnpm dev` / `pnpm build` 启动前都会自动执行该同步。

## 版本链

| 数据 | 版本格式 | 计算与校验 |
|---|---|---|
| Lexicon | `lexicon-<12 hex>` | 词表内容版本标识；`pnpm validate` 校验格式，并检查 public 与 data 两份一致 |
| 课程 | `curriculum-<12 hex>` | 对 `{ chapters, lessons }` 做 SHA-256 取前 12 位（`scripts/lib/data-contract.mjs` 的 `curriculumVersionOf`）；`pnpm validate` 对每套课程重算并比对 |
| 课程模板 | `templateVersion`（当前 `1.0.0`） | 来自 `scripts/lib/curriculum-template.mjs`；validate 与课程文件内字段比对 |

版本信息在同步时现算打印、不落盘清单；public 与 data 的一致性由校验器逐文件 JSON 深比较保证（见下节）。

## 校验 `pnpm validate`

`node scripts/validate-all.mjs` 只做编排与汇总，五个域模块各管一段：

| 模块 | 校验内容 |
|---|---|
| `scripts/validate/schemes.mjs` | 19 套方案（单点常量）；目录与索引一一对应；每套方案可构造 engine；`engine-cases.json` 覆盖全部方案且正例 / 反例数量不低于下限（当前 1,725 / 180） |
| `scripts/validate/lexicon.mjs` | Lexicon 规模下限（29,660 词 / 3,009 字 / 405 音节示例）、`dataVersion` 格式、词与字无重复、词长 2–5、声调与韵母合法 |
| `scripts/validate/curriculum.mjs` | 5 套 full 课程严格校验；14 套 simplified 课程**用生成器重新生成（回填磁盘上的 `generatedAt`）后与磁盘 JSON 深相等**，另加独立不变式（编码音节都可解析、每原子一课、free 不设课、tips 仅编码类、首末课、`dataVersion` 重算、`origin` / `supportLevel` / `courseTier` 与索引一致、兼容码必须出现在 tips） |
| `scripts/validate/public-data.mjs` | `apps/web/public/data/` 顶层与文件清单必须恰好是 4 类产物；逐文件与 `data/` 源文件 JSON 深相等且为紧凑序列化；版本链（`defaultScheme` / `courseSupported` / Lexicon 版本）一致 |
| `scripts/validate/docs.mjs` | 文档入口、README 导航覆盖 `docs/**/*.md`、Markdown 本地链接与截图引用可解析、废弃数据目录不存在 |

- 输出：各域摘要（方案、词表、每套课程、同步、文档）+ 失败项（最多 60 条）；全部通过 exit 0，否则 exit 1；
- `public-data` 域要求先生成运行时数据，因此完整校验顺序是 `pnpm data:sync` → `pnpm validate`（`pnpm verify` 已内置该顺序）；
- 深比较不是「恒真」检查：对 14 套生成课程，故意修改任意字段（tips、prerequisites、章节标题等）都会让校验失败；唯一例外是 `generatedAt`——校验用磁盘值回填以保证确定性，只校验它是合法时间戳。

## 修改数据

| 想改什么 | 做法 |
|---|---|
| 词表 | 编辑 `data/lexicon/lexicon.json` → `pnpm data:sync` → `pnpm validate` |
| 5 套 full 课程 | 编辑 `data/schemes/<id>/curriculum.json` → 按内容重算 `dataVersion`（见下）→ `pnpm data:sync` → `pnpm validate` |
| 方案键位 / 推荐码 / 兼容码 | 编辑 `data/schemes/<id>/scheme.json`（并补齐 `engine-cases.json`）→ 若影响生成课程则 `pnpm data:curriculum` → `pnpm data:sync` → `pnpm validate` |
| 14 套 simplified 课程 | 不要直接编辑：改 `scripts/lib/curriculum-template.mjs` 或生成器 → `pnpm data:curriculum` → 检查 `data/` diff → `pnpm data:sync` → `pnpm validate` |
| 新增方案 | 见[适配新方案](DATA.md#适配新方案) |

课程内容一旦变化，`dataVersion` 必须同步更新（validate 会重算并比对）。full 课程手动改完后可用下面的命令算出新版本号：

```bash
node --input-type=module -e "
import { readJSON, curriculumVersionOf } from './scripts/lib/data-contract.mjs'
const curriculum = readJSON('data/schemes/xiaohe/curriculum.json')
console.log(curriculumVersionOf(curriculum.chapters, curriculum.lessons))
"
```

把输出写回该文件的 `dataVersion` 即可；`simplified` 课程由生成器自动写入，无需手改。

## 适配新方案

本文说明如何新增一套双拼方案，如何正确填写推荐码与兼容编码，以及如何为新方案生成或定制学习路线。

### 目录结构

一套方案一个文件夹，索引与判题用例集中在 `data/schemes/` 顶层：

```text
data/schemes/
  index.json                 方案索引：方案清单 / 课程能力 / 默认方案 / 推荐顺序
  engine-cases.json          全部方案的判题用例
  xiaohe/
    scheme.json              键位、推荐码、兼容编码
    curriculum.json          课程（19 套方案均有）
  c/
    scheme.json
    curriculum.json
  ...
```

`apps/web/public/data/` 是 `pnpm data:sync` 生成的运行时副本（`schemes/<id>.json`、`curriculum/<id>.json` 等），不要编辑生成物，也不要在 `data/` 下保留第二份方案数据。

### SchemeDef

`scheme.json` 的字段：

| 字段 | 说明 |
|---|---|
| `id` / `name` / `type` | 方案 id、显示名、形态标记（当前数据取 `compositional` / `hybrid`，不参与判题） |
| `initials` | 声母 → 键数组，任一命中即正确 |
| `finals` | 韵母 → 键数组，任一命中即正确 |
| `zeroInitial` | 零声母音节 → 完整键序列数组；**首条为主键** |
| `recommended` | 多解音节的标答序列（小写） |
| `compatCodes` | 无法由声母 / 韵母组合得到、但需要额外接受的序列 |
| `umlautNote` / `sameKeyGroups` / `source` / `notes` | 文档性元数据：ü 说明、同键组、数据来源、备注；不参与判题 |

所有键位值都是 `string[]`；数组语义为「任一命中即正确」（键道飞键、大牛多键、微软 `ue` 双键等）。

```json
{
  "id": "scheme-id",
  "name": "方案名",
  "type": "compositional",
  "initials": { "zh": ["o", "v"] },
  "finals": { "uang": ["z"], "uo": ["p", "b"] },
  "zeroInitial": { "a": ["aa"] },
  "recommended": { "zhu": "of" },
  "compatCodes": { "zhu": ["vf"] },
  "umlautNote": "可选",
  "sameKeyGroups": [],
  "source": {},
  "notes": []
}
```

### 方案索引与课程能力

`data/schemes/index.json` 同时承担方案索引与课程清单：

- `schemes`：每套方案的摘要，字段见[数据说明](DATA.md#方案索引-dataschemesindexjson)；
- `defaultScheme` / `recommendedOrder`：默认方案与 UI 推荐顺序；
- `courseSupported`：有课程的方案 id 列表，**课程清单唯一来源**。

运行 `pnpm data:curriculum` 时，生成器会按「有 `scheme.json` 的全部方案」重建 `courseSupported`，并给每套 `simplified` 课程方案写入 `schemes[].course`（`supportsGuidedCourse` / `courseTier` / `reason` / `courseNotes`）。新增方案必须同时登记到 `recommendedOrder`，否则生成器排序会把未登记方案排到最前。

### 判题规则

```text
accepted = recommended ∪ compatCodes ∪ (initials × finals)
primary  = recommended ?? compatCodes[0] ?? composition[0]
```

- 课程 Hero、入门试打与练习场都接受全部 accepted；显示键帽使用 `primary`；
- 推荐码不显示在兼容编码 UI；
- 兼容编码是额外接受，不会禁用基础组合。

以上规则由 `packages/core` 的方案引擎唯一实现（`createSchemeEngine(def)`），Web 与脚本都消费同一份引擎，不重复实现。

### recommended 与 compatCodes

#### 什么时候必须写 recommended

当同一个音节的声母 × 韵母组合天然多解时，必须写推荐码指定标答（即使多码只是由多个声母键 / 韵母键造成）：

```text
ch = U / ;
ua = A / M
=> chua 有 UA / UM / ;A / ;M 四种组合
```

此时：

```json
"recommended": { "chua": "ua" }
```

`UA` 是标答；`UM / ;A / ;M` 由声母 / 韵母组合回退接受，不写入 `compatCodes`。零声母是例外：`zeroInitial` 数组本身就表达「多条合法码，首条为主键」，不需要再写 `recommended`。

没有多解的音节不需要推荐码；没有多解不需要 `recommended` / `compatCodes`。

#### 什么时候写 compatCodes

只把**无法由声母 / 韵母组合得到**的序列写入 `compatCodes`：

```json
"recommended": { "zhu": "of" },
"compatCodes": { "zhu": ["vf"] }
```

- `OF` 是推荐码 / 标答；
- `VF` 是真正的兼容编码；
- `OU`、`VU` 是 `zh × u` 的组合结果，只由组合回退接受，不进入兼容编码表。

`dun` 同理：

```json
"recommended": { "dun": "dc" },
"compatCodes": { "dun": ["d;"] }
```

`DC` 来自组合但仍保留在 recommended 中，因为它必须是标答；`D;` 才是不能由组合得到、需要写入兼容表的编码。

### ü 与 u/v

#### 标准拼音

- `j/q/x/y` 后的 ü 标准写作 `u`：
  - `ju / jue / juan / jun`
  - `qu / que / quan / qun`
  - `xu / xue / xuan / xun`
  - `yu / yue / yuan / yun`
- `n/l` 后的 ü 保留：
  - `nü / lü`，键盘输入常用 `nv / lv`
  - `nüe / lüe`，键盘输入常用 `nve / lve`
- `jve / jvan / jvn` 不是标准拼音拼写。

#### 输入法兼容

Rime 的小鹤、自然码、微软、智能 ABC schema 都有：

```yaml
derive/^([jqxy])u$/$1v/
```

它只为**单独的 `ju/qu/xu/yu`** 增加 `jv/qv/xv/yv` 别名，并保留原拼写；不会生成 `jve/jvan/jvn`。

因此：

```text
ju   → ju 标准 / jv 兼容
jue  → jue 标准；是否接受 jv 取决于该方案 ue 是否映射到 V 键
juan → juan 标准
jun  → jun 标准
```

`j/q/x/y + u` 的 V 键兼容码写入各方案的 `compatCodes`，如 `ju → jv`，键位图会显示；核心引擎只读取方案数据。

例如（与当前数据一致）：

- 小鹤、自然码：`ju` 标答，`jv` 由 `compatCodes` 兼容接受；`ue = [t]`，所以 `jue` 只有 `jt`；
- 微软：`ju` 标答，`jy` 兼容；`ue = [t, v]`，所以 `jue` 可 `jt / jv`；
- 智能 ABC：`ju` 标答，`jv` 兼容；`ue = [m, v]`，所以 `jue` 可 `jm / jv`。

参考：

- [汉语拼音方案](https://zh.wiktionary.org/wiki/Appendix:%E6%B1%89%E8%AF%AD%E6%8B%BC%E9%9F%B3%E6%96%B9%E6%A1%88)
- [Rime 小鹤双拼](https://github.com/rime/rime-double-pinyin/blob/master/double_pinyin_flypy.schema.yaml)
- [Rime 自然码](https://github.com/rime/rime-double-pinyin/blob/master/double_pinyin.schema.yaml)
- [Rime 微软双拼](https://github.com/rime/rime-double-pinyin/blob/master/double_pinyin_mspy.schema.yaml)
- [Rime 智能 ABC](https://github.com/rime/rime-double-pinyin/blob/master/double_pinyin_abc.schema.yaml)

### core 编码分析 API

推荐码 / 兼容码的「解析 + 主键组合 + 推荐覆盖 + 额外兼容码」只有一份实现：`@shuangpin/core` 的 `analyzeSchemeCodes(def)`。

```ts
import { analyzeSchemeCodes } from '@shuangpin/core'

const analysis = analyzeSchemeCodes(schemeDef)
// analysis.entries: [{
//   syllable, initial, final, zeroInitial,
//   atoms,               // 命中的知识点：零声母 1 个，普通音节声母 + 韵母
//   composition,         // 首个声母键 + 首个韵母键；零声母为该音节第一条整段序列
//   recommended,         // scheme.recommended 存在时的小写值（可能等于 composition）
//   recommendedOverride, // recommended 是否覆盖了组合
//   compat, primary, accepted,
// }]
// analysis.unresolved: 无法在方案数据中解析的音节
// analysis.stats: { recommendedOverrides, compat }
```

- `engine.compositionSequence({ initial, final, zeroInitial })` 给出声母 × 韵母的笛卡尔积（零声母返回整段序列），不受 recommended / compatCodes 影响；
- `engine.freeSets()` 与 `freeAtomsOf(def)` 给出「与全拼一致」的 free 集合（`{ initials, finals, zero }`，Set 形状，engine 内缓存）；
- 生成器在 `analyzeSchemeCodes` 的结果上做「按目标音节最后学到的 learn 原子归组」的**课程模板策略**（`scripts/lib/curriculum-template.mjs` 的 `groupCodeEntries`），生成课程 tips；校验器也通过重新生成课程间接校验这份分析；
- 不要在其他地方再写一份推荐码 / 组合解析逻辑。

### 新增方案

1. 新建 `data/schemes/<id>/scheme.json`，按上文 SchemeDef 填写；
2. 在 `data/schemes/index.json` 的 `schemes` 追加摘要（字段与现有条目一致：`id` / `name` / `type` / `file` / `keys` / `atoms` / `zeroInitialFamily` / `zeroInitialRule` / `ambiguity` / `course` / `recommendation` / `dataGaps`），并把 id 加进 `recommendedOrder`；
3. 在 `data/schemes/engine-cases.json` 增加该方案的正例 / 反例（校验器要求用例覆盖方案集合与索引完全一致）；
4. 多解音节补 `recommended`；真正无法由组合得到的序列补 `compatCodes`；
5. 运行：

   ```bash
   pnpm data:curriculum   # 生成 simplified 课程，自动重建 courseSupported 与 schemes[].course
   pnpm data:sync         # 同步运行时数据到 apps/web/public/data/
   pnpm validate          # 五域校验
   ```

6. 默认走自动生成的 simplified 路线；需要定制完整课程时再按下一节转 full。

### 学习路线制作

新方案的学习路线有两种制作方式。

#### 自动生成 simplified 路线

按「新增方案」完成第 1–5 步即可。生成器会：

- 为没有 full 路线的方案生成「入门 → learn 原子逐课 → 章末复习 → 期中 → 综合 / 速度 / 最终考核」；
- 写入 `data/schemes/<id>/curriculum.json`；
- 标记 `supportLevel: "simplified"` 与 `origin: "generated"`；
- 重建 `index.json` 的 `courseSupported`，并写入该方案的 `course` 能力字段。

课程结构、阶段门槛与编码分组策略由 `scripts/lib/curriculum-template.mjs` 单点定义；要调整所有生成课程，改该模板后重跑生成并确认 `data/` diff。

#### 定制 full 路线

1. 新建或修改 `data/schemes/<id>/curriculum.json`，设置 `supportLevel: "full"`；
2. **不要写 `origin` 字段**，定制课程以字段缺失表示来源；
3. 按现有 5 套定制课程的结构填写 `chapters`、`lessons`、`focusAtoms`、`prerequisites`、`wordPlan`、`passCriteria`、`tips`、`atomMeta` 等字段；
4. 把方案 id 加入 `scripts/validate/curriculum.mjs` 的 `FULL_COURSE_IDS`（校验器要求 full 课程恰为该白名单内的 5 套；不加会报「定制课程应恰为 5 套」）；
5. 按内容重算并写回 `dataVersion`（算法见[数据说明](DATA.md#修改数据)）→ `pnpm data:sync` → `pnpm validate`。

生成器会一律跳过 `supportLevel: "full"` 的课程；`pnpm build` 与 `pnpm verify` 只执行 `data:sync`，不会隐式生成课程。

### 编码信息进入课程技巧

方案数据里的推荐码例外与 `compatCodes` 都必须出现在课程技巧中：

- 生成课程由生成器自动写入对应原子课 tips；
- 定制 full 课程需要人工写入课程 tips；
- `scripts/validate/curriculum.mjs` 会检查**每套方案**的每个 `compatCodes` 是否出现在课程 tips（大小写不敏感），缺失即失败；推荐码例外的文本不强制校验，定制课程请自行确认。

### 验收清单

- `scheme.json` 字段齐全、键位值为数组，方案能构造 engine；
- `index.json` 已登记摘要与 `recommendedOrder`，`courseSupported` 与课程文件一致；
- `engine-cases.json` 覆盖该方案，正例全过、反例全拒绝；
- 声母 × 韵母多解的音节写了 `recommended`，`compatCodes` 只包含无法由组合得到的序列；
- 推荐码 / 兼容码里的音节都能被 core 解析（`analyzeSchemeCodes(def).unresolved` 为空，validate 会检查）；
- 兼容码出现在课程 tips（校验器强制）；
- `pnpm data:curriculum`（涉及生成课程时）→ `pnpm data:sync` → `pnpm validate` → `pnpm verify` 全绿；
- 文档中的目录、字段名与数据一致。

### 当前数据状态

- 19 套方案，全部有课程（5 套 full + 14 套 simplified）；
- 18 套有 `recommended` / `compatCodes`，`yunbiaokuaipin` 没有多码，无需两者；
- 兼容编码分布：C 32 组、大牛双拼 12 组，其余 16 套各 4 组；
- C 的 `chua` 只有声韵组合多解，不进入兼容表；`zhu`：`OF` 推荐、`VF` 兼容、`OU/VU` 为组合；`dun`：`DC` 推荐、`D;` 兼容；
- C 的零声母 `a / e / er / o` 的 `zeroInitial` 数组各含两条合法码，首条为主键（不写 `recommended`）；
- 小鹤、自然码：`ju` 标答，`jv` 由 `compatCodes` 兼容接受；`ue = [t]`，`jue` 只有 `jt`；
- 微软：`ju` 标答、`jy` 兼容，`ue = [t, v]`；智能 ABC：`ju` 标答、`jv` 兼容，`ue = [m, v]`。
