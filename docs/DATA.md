# 数据说明

[← 文档导航](../README.md#文档导航)

本页是数据与词库管线的权威说明：目录职责、数据契约、版本链、重建顺序、校验阈值与质量快照。生成器与运行时的契约类型在 `packages/core/src/types.ts`，hash / 原子写工具在 `scripts/lib/data-contract.mjs`；实现结构见 [架构说明](ARCHITECTURE.md)，使用侧说明见 [学习指南](LEARNING.md)。

## 数据目录

| 目录 | 内容 | 来源 |
|---|---|---|
| `data/schemes/` | 19 套方案键位 JSON + `index.json` + 判题用例 `engine-cases.json`（含 provenance，视为冻结事实源） | 参考 BlueSky-07/Shuang 的键位映射 |
| `data/curriculum/` | 5 套课程（每套 40 课 / 10 章）+ `index.json` | `scripts/curriculum/build-curriculum.mjs` |
| `data/packages/` | 19 个运行时方案包（`manifest.json` / `scheme.json` / 课程方案另有 `curriculum.json`）+ `index.json` | `scripts/scheme-packages/build.mjs` |
| `data/pools/` | 40 课词池 `L*.json` + `index.json` | `scripts/word-pipeline/build-pools.mjs` |
| `data/words/` | 公共词库 `words.sample.json`、记忆锚点 `anchors.json`、音节补丁、词库口径 `word-policy.json` | `scripts/word-pipeline/build.mjs` + 手工数据 |
| `data/training/` | 练习字库 `bank.json`（文章 / 专项字模式共用） | `scripts/training/build-training-bank.mjs` |
| `data/raw/` | 构建期原始词典 `jieba-dict.txt`（不入库，缺失时自动下载） | jieba（MIT） |

`data/` 是唯一数据源；`scripts/sync-data.mjs` 把运行时需要的文件同步到 `apps/web/public/data/`（该目录在 `.gitignore` 中，由 `pnpm dev` / `pnpm build` / `data:sync` 生成）。

## 当前版本快照

以数据文件与 `apps/web/public/data/manifest.json` 为准；重建数据后版本会变化。

| 数据 | 版本 |
|---|---|
| 课程模板 | `1.0.0` |
| 课程 `xiaohe` | `curriculum-8c11b27afd64` |
| 课程 `ziranma` | `curriculum-7315038dab09` |
| 课程 `weiruan` | `curriculum-577f9f01f258` |
| 课程 `sougou` | `curriculum-8fd0acef60f6` |
| 课程 `zhinengabc` | `curriculum-32a71a1c61db` |
| 词池 | `pools-24450f68e49a`（sources：xiaohe 课程 + 词典 `7197c3211ddd`） |
| 公共词库 | `words-ea1e2eb0f56e` |
| 训练字库 | `training-cb1e4cc25756` |

## 方案数据

`data/schemes/index.json`：

- `reference`：参考项目、版本、commit、许可说明（GPL-3.0，仅提取键位事实）；
- `semantics`：判题、数组多解、零声母、override、`syllable-code`、free/learn 的语义说明；
- `defaultScheme = xiaohe`、`recommendedOrder`（19 套展示顺序）、`courseSupported`（5 套课程方案）；
- `schemes[]`：每套方案的名称、类型、键位统计与 free/learn 原子统计。

每套方案文件（`data/schemes/<id>.json`）核心字段：`initials`（声母 → 键数组）、`finals`（韵母 → 键数组）、`zeroInitial`（12 个零声母音节 → 完整键序列）、`overrides`（整音节覆盖）、`type`。判题与 free/learn 派生规则见 [架构说明 · 领域模型](ARCHITECTURE.md#3-领域模型)。

当前 19 套方案的数据事实：

| 方案 | id | 类型 | free / learn 原子 | 零声母 | 课程 |
|---|---|---|---|---|---|
| 小鹤双拼（默认） | `xiaohe` | compositional | 33 / 35 | 字母式 | ✓ |
| 自然码 | `ziranma` | compositional | 33 / 35 | 字母式 | ✓ |
| 微软双拼 | `weiruan` | compositional | 25 / 43 | o+ 键 | ✓ |
| 搜狗双拼 | `sougou` | compositional | 25 / 43 | o+ 键 | ✓ |
| 智能ABC | `zhinengabc` | compositional | 26 / 42 | o+ 键 | ✓ |
| 拼音加加 | `pinyinjiajia` | compositional | 26 / 42 | 字母式 |  |
| 紫光双拼 | `ziguang` | compositional | 26 / 42 | o+ 键 |  |
| 蓝天双拼 | `lantian` | compositional | 33 / 35 | 字母式 |  |
| 白云双拼 | `baiyun` | compositional | 33 / 35 | 字母式 |  |
| 小月双拼 | `xiaoyue` | compositional | 33 / 35 | 字母式 |  |
| 国标双拼 | `guobiao` | compositional | 26 / 42 | a+ 键 |  |
| 开源小鹳 | `xiaoguan` | compositional | 33 / 35 | 双家族 |  |
| 小浪双拼 | `xiaolang` | compositional | 29 / 39 | 混合式 |  |
| 韵标块拼 | `yunbiaokuaipin` | compositional | 27 / 41 | e+ 键 |  |
| 星空双拼 | `xingkong` | compositional | 26 / 42 | v+ 键 |  |
| 大牛双拼 | `daniu` | hybrid | 26 / 50 | e+ 键 |  |
| 键道双拼3 | `jiandao3` | hybrid | 20 / 52 | x+ 键 |  |
| 键道双拼6 | `jiandao6` | hybrid | 21 / 84 | x+ 键 |  |
| C双拼 | `c` | syllable-code | 53 / 352 | 整音节表 |  |

判题 golden cases 在 `data/schemes/engine-cases.json`：19 套方案、正例 1,722 / 反例 184（由 `engine.test.ts` 与 `validate-all` 校验规模）。

## 课程数据

5 套课程方案各一份 `data/curriculum/<scheme>.curriculum.json`，由同一课程模板实例化，差异只在键位相关字段：

- 40 课 / 10 章 / 326 分钟；`intro 1 / drill 27 / review 11 / exam 1`；模板版本 `1.0.0`。
- 课程字段与生成规则（统一命名、同键双韵合并、累计复习范围、零声母全表课、jqxy 提示、learn 原子全覆盖）见 [架构说明 · 课程与阶段](ARCHITECTURE.md#4-课程与阶段)。
- `atomMeta.anchors / mnemonic` 由 `data/words/anchors.json` + 方案键位生成；`tips` 由 `scripts/curriculum/content.mjs` 生成。
- `data/curriculum/index.json` 记录每套课程的 `lessonCount`、`totalMinutes`、`dataVersion` 与文件名。

## 公共词库

`data/words/words.sample.json` 是运行时唯一词表（练习场词语与课程词池来源）：

- **规模**：10,000 词，长度 2–5 字；`baseWordCount = 8000` 高频基础词 + 三字词 700 + 四字成语 800 + 五字词 500（`filters.supplements`）。
- **筛选**：纯汉字、2–5 字；儿化词丢弃但保留 `erhuaKeep` 白名单（如「女儿」「婴儿」）；来源 jieba（MIT），拼音 pinyin-pro（MIT，构建期）。
- **字段**：`WordEntry { text, length, chars, syllables[], freq, freqRank, minCharRank, polyphone? }`；`Syllable { text, pinyin, initial, final, tone }`，其中 `pinyin = initial + final`（ü 记 v）、`tone ∈ 1..5`（轻声记 5）、零声母 `initial = ''`（仅限 12 个规范零声母音节与 `er`）；`freqRank` 为全量词表全局排名（不按池重编号）。
- **头信息**：`schemaVersion`、`dataVersion`、`contentSha256`、`generatedAt`、`description`、`source`（dict URL / sha256 / pinyin-pro 版本）、`filters`、`count`。

当前质量快照：2 字 7,124（71.2%）/ 3 字 1,386 / 4 字 967 / 5 字 523；轻声 228 词；多音字标记 160 词（1.6%）；生僻字（minCharRank > 2000）1,580 词；极生僻（> 4000）179 词。

## 记忆锚点与音节补丁

- `data/words/anchors.json`（构建期内容索引，不进入运行时）：`syllableChars`（每音节 8 个常用字，共 406 个音节）、`finalChars`（34 个韵母）、`initialChars`（23 个声母）。用于生成课程 `tips` 与 `atomMeta.anchors/mnemonic`。
- `data/words/syllable-patches.json`：词典未收录音节的显式补丁，目前 2 条（如 `zhei → 这`、`eng → 鞥`），避免在代码里特判。
- `scripts/lib/pool-examples.mjs`：教学示例音节的统一枚举实现，`build-pools` 与 `validate-all` 共用。

## 课程词池

`data/pools/<lessonId>.json` = `{ lessonId, words, chars, examples }`，40 份由共享词库为每课生成的**物化视图**（5 套课程共用，以 xiaohe 课程为规范来源）：

- `words`：目标词（新课 500 词；复习 / 考核 1,000 词；每课最低 300 词）；
- `chars`：单字池（非零声母课不掺零声母字）；
- `examples`：教学示例（按课程 focus 原子学习顺序枚举，每个音节一条）。

当前快照：合计 **26,000 条**课次，跨课去重后 **25,255 个唯一词**；长度分布 2 字 18,209（70.0%）/ 3 字 4,401 / 4 字 2,917 / 5 字 473；跨课重复 745 次（2.9%），728 个词跨 ≥2 课；单字池合计 1,657 条（去重 1,080 字），多音风险 0；教学示例 2,319 张（代表字 rank > 2000 共 157、> 4000 共 45、缺 jieba 单字排名 9 张——补丁字「鞥」），**生僻示例占比 2.33%（阈值 3%）且可避免生僻 0**。被屏蔽词性（`nr/nz/x/ns/nt/nrt/nrfg`）在非入门课词池命中 0（入门课试打词「双拼」按 `word-policy` 策略保留，审计含入门课时计 1）。

## 练习字库

`data/training/bank.json`：

- 约 5,002 个常用字（`chars`，按 jieba 单字排名 ≤ 5,000 选取，并为音节覆盖补充保底字），约 0.80 MB；
- 覆盖 404 / 406 个合法音节（其余为天然无常用字的音节）；保底补字 5 个；
- **不再保存词语**：练习场词模式直接加载公共词库，文章练习同样使用该字库；
- `schemaVersion` 固定、`dataVersion = training-<sha256(schemaVersion + chars)[:12]>` 可重算，`generatedAt` / `description` 附带说明。

## 词库口径（`data/words/word-policy.json`）

build / build-pools / validate 共用的单一数值来源：

| 分组 | 关键项 |
|---|---|
| `wordBank` | `wordCount=10000`、长度 2–5、`baseWordCount=8000`、补充词 700 / 800 / 500、`anchorsCharsLimit=8`、`erhuaKeep` |
| `pools` | 目标 500 / 最低 300、复习目标 1,000、长度配额、`qualityMaxCharRank=4000`、屏蔽词性、跨课重复率上限 0.2、单字池目标 / 最低 / 多音上限 |
| `examples` | 代表字常用排名上限 4000、生僻阈值 4000、生僻占比上限 0.03 |
| `intro` | 入门试打词 `seedWords = ['双拼']` |
| `training` | `commonCharRank = 5000` |

## 版本链

生成器与校验器共用 `scripts/lib/data-contract.mjs` 的算法（细节见 [架构说明 · 数据契约](ARCHITECTURE.md#9-数据契约与版本链)）：

- `curriculum-<12hex>` = `sha256(JSON.stringify({ chapters, lessons }))`；
- `pools-<12hex>` = 对所有词池文件按文件名排序后 `sha256(concat(fileName + content))`；索引的 `sources` 记录所用课程版本与 jieba 词典 sha 前 12 位；
- `words-<12hex>` = 由词典 sha、pinyin-pro 版本、过滤参数、词数、词条内容共同计算；
- `training-<12hex>` = 由训练库内容重算；
- `data/curriculum/index.json`、`data/pools/index.json`、`data/packages/index.json` 与 `apps/web/public/data/manifest.json` 保存对应版本；`manifest.files` 登记全部同步文件，`validate-all` 逐字节比对 `data/` 与 `public/data/`。

## 重建流程

需要 Node.js ≥ 24；只有重建词库时才需要安装 `scripts/word-pipeline` 自己的依赖（`pinyin-pro`）：

```bash
# 一次性：安装词库管线依赖
cd scripts/word-pipeline && npm install && cd ../..

# 按顺序重建（任一步骤改动后都要重新执行后续步骤）
pnpm data:words        # jieba dict → words.sample.json + anchors.json
pnpm data:curriculum   # 课程模板 + 方案数据 + anchors → 5 套 curriculum
pnpm data:pools        # 课程 + 词库 → 40 份词池 + index
node scripts/training/build-training-bank.mjs   # 练习字库 bank.json
pnpm data:sync         # 重建 data/packages/ 并原子同步到 apps/web/public/data/
pnpm validate          # 版本链 / 契约 / 质量阈值 / public 一致性
```

- `build.mjs` 在缺少 `data/raw/jieba-dict.txt` 时会自动下载；`--download` 强制刷新，`--words=<N>` 可覆盖词表规模（默认取 `word-policy`）。
- `pnpm dev` / `pnpm build` 只执行 `data:sync`（含方案包重建），不会重建词库、课程与词池。
- 数据修改后应提交重新生成的结果（`data/words`、`data/curriculum`、`data/pools`、`data/packages`、`data/training`），`apps/web/public/data/` 与 `data/raw/` 不入库。

## 校验与审计

```bash
pnpm validate       # node scripts/validate-all.mjs
node scripts/word-pipeline/audit-words.mjs   # 只读统计（JSON）
```

`validate-all.mjs` 覆盖：方案数量与判题用例规模、课程 40 / 10 / 326 与命名法、累计 prerequisites、learn 原子全覆盖、复习 / 零声母 / ü 家族专项规则、词表与词池的音节 / tone / freqRank / 示例一致性、质量阈值（生僻示例 ≤3% 且可避免为 0、跨课重复 ≤20%、单字多音 ≤10%、屏蔽词性 0、入门种子词存在、每个 learn 原子在词池中可用）、版本链重算、`data/` 与 `public/data/` 逐字节一致、方案包能力、文档与截图守卫。

词库审计脚本只读不写，用于生成质量快照（本文的规模与质量指标即来自它）；口径调整应先改 `word-policy.json`，再重建并跑校验。

## 许可

- 词频 / 词表：[jieba](https://github.com/fxsjy/jieba)（MIT）；
- 拼音：[pinyin-pro](https://github.com/zh-lx/pinyin-pro)（MIT，仅构建期）；
- 方案键位事实来源：[BlueSky-07/Shuang](https://github.com/BlueSky-07/Shuang)（GPL-3.0，仅提取键位映射，不复制实现代码）；
- 本项目代码与生成数据以 GPL-3.0-only 发布，详见 [README · 来源与第三方许可](../README.md#来源与第三方许可)。
