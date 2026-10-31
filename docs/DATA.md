# 数据说明

[← 文档导航](../README.md#文档导航)

## 运行期统一 Lexicon

运行期唯一词表是 `data/lexicon/lexicon.json`，包含 `words`（2–5 字词）、`chars`（单字）和 `syllableExamples`（音节代表字）。课程与练习场读取同一文件；课程按 lesson 的已学原子/focus 在核心选词器中筛选，练习场按当前选择范围筛选。`apps/web/public/data/` 只发布这一份 Lexicon，不再发布每课词池。

当前 `scripts/lexicon/build.mjs` 第一版从已清洗的词库/课池合并生成；`data/pools/`、`data/words/`、`data/training/` 保留为迁移期构建输入，后续把质量过滤与选词策略前移后移除。

## 数据目录

| 目录 | 内容 | 生成器 |
|---|---|---|
| `data/schemes/` | 19 套方案键位 + `index.json` + 判题用例 `engine-cases.json`（含 provenance） | 参考 BlueSky-07/Shuang 的键位映射 |
| `data/curriculum/` | 5 套课程（40 课 / 10 章）+ `index.json` | `scripts/curriculum/build-curriculum.mjs` |
| `data/packages/` | 19 个运行时方案包（`manifest.json` / `scheme.json`，课程包另有 `curriculum.json`）+ `index.json` | `scripts/scheme-packages/build.mjs` |
| `data/pools/` | 40 课词池 `L*.json` + `index.json` | `scripts/word-pipeline/build-pools.mjs` |
| `data/words/` | 公共词库、记忆锚点、音节补丁、词库口径 | `scripts/word-pipeline/build.mjs` + 手工数据 |
| `data/training/` | 练习字库 `bank.json`（迁移期构建输入） | `scripts/training/build-training-bank.mjs` |
| `data/lexicon/` | 运行期唯一词表 `lexicon.json` | `scripts/lexicon/build.mjs` |
| `data/raw/` | 构建期 jieba 词典（不入库，缺失时自动下载） | jieba（MIT） |

`data/` 是唯一数据源；`scripts/sync-data.mjs` 把运行时文件同步到 `apps/web/public/data/`（`.gitignore` 中，由 `pnpm dev` / `pnpm build` / `data:sync` 生成）。

## 当前版本

| 数据 | 版本 |
|---|---|
| 课程模板 | `1.0.0` |
| 课程（xiaohe / ziranma / weiruan / sougou / zhinengabc） | `curriculum-8c11b27afd64` / `curriculum-7315038dab09` / `curriculum-577f9f01f258` / `curriculum-8fd0acef60f6` / `curriculum-32a71a1c61db` |
| 词池 | `pools-24450f68e49a`（sources：xiaohe 课程 + 词典 `7197c3211ddd`） |
| 统一 Lexicon | `lexicon-fe0e0bd32c56` |

重建数据后版本会变化，以数据文件与 `apps/web/public/data/manifest.json` 为准。

## 方案数据

- `data/schemes/index.json`：参考项目与 commit（GPL-3.0，仅键位事实）、判题语义说明、`defaultScheme = xiaohe`、19 套展示顺序、5 套课程支持列表、每套方案的键位与 free/learn 统计。
- 每套方案文件包含 `initials`、`finals`、`zeroInitial`（12 个零声母完整键序列）、`overrides`、`type`；判题与 free/learn 派生见[架构说明](ARCHITECTURE.md)。
- 判题 golden cases：19 套方案、正例 1,722 / 反例 184，由 `engine.test.ts` 与 `validate-all` 校验规模。

## 课程数据

- 5 套课程各一份 `data/curriculum/<scheme>.curriculum.json`，由同一模板实例化，差异只在键位相关字段；40 课 / 10 章 / 326 分钟，`intro 1 / drill 27 / review 11 / exam 1`。
- 字段、命名与生成规则见[架构说明](ARCHITECTURE.md)；`tips` 由 `scripts/curriculum/content.mjs` 生成，`atomMeta` 由方案键位 + `data/words/anchors.json` 生成。
- `data/curriculum/index.json` 记录每套课程的 `lessonCount`、`totalMinutes`、`dataVersion` 与文件名。

## 公共词库

`data/words/words.sample.json` 是迁移期词库之一；运行期唯一词表是 `data/lexicon/lexicon.json`：

- **规模**：10,000 词、长度 2–5 字；8,000 高频基础词 + 三字词 700 + 四字成语 800 + 五字词 500。
- **筛选**：纯汉字；儿化词丢弃但保留 `erhuaKeep` 白名单。来源 jieba（MIT），拼音 pinyin-pro（MIT，构建期）。
- **字段**：`WordEntry { text, length, chars, syllables[], freq, freqRank, minCharRank, polyphone? }`；音节 `pinyin = initial + final`（ü 记 v）、`tone ∈ 1..5`（轻声记 5）、零声母 `initial = ''`；`freqRank` 为全量词表全局排名。
- **头信息**：`schemaVersion`、`dataVersion`、`contentSha256`、`generatedAt`、`source`、`filters`、`count`。

当前快照：2 字 7,124 / 3 字 1,386 / 4 字 967 / 5 字 523；轻声 228 词；多音字 160 词；生僻字（minCharRank > 2000）1,580 词。

## 记忆锚点与音节补丁

- `anchors.json`（构建期索引，不进入运行时）：`syllableChars`（406 音节）/ `finalChars`（34 韵母）/ `initialChars`（23 声母），每键 8 个常用字，用于课程记忆锚点。
- `syllable-patches.json`：词典未收录音节的显式补丁（如 `zhei → 这`、`eng → 鞥`）。
- `scripts/lib/pool-examples.mjs` 统一枚举示例音节，build-pools 与 validate-all 共用。

## 课程词池

`data/pools/<lessonId>.json` = `{ lessonId, words, chars, examples }`，是迁移期每课物化视图；运行期已不再使用，补齐统一构建器后删除：

- `words`：新课 500 词、复习 / 考核 1,000 词、每课最低 300 词；
- `chars`：单字池（非零声母课不掺零声母字）；
- `examples`：教学示例，按 focus 原子学习顺序枚举，每音节一条。

当前快照：26,000 条课次 / 25,255 唯一词；跨课重复 745 次（2.9%）；单字池 1,657 条（去重 1,080 字）、多音风险 0；教学示例 2,319 张，生僻占比 2.33%（阈值 3%）、可避免生僻 0；非入门课词池中屏蔽词性（`nr/nz/x/ns/nt/nrt/nrfg`）命中 0。

## 练习字库

`data/training/bank.json`：约 5,002 个常用字，是统一 Lexicon 的迁移期字表输入；运行期不再直接读取。

## 词库口径

`data/words/word-policy.json` 是 build / build-pools / validate 共用的数值来源：

- `wordBank`：词数 10,000、长度 2–5、基础词 8,000、补充词 700 / 800 / 500、每键锚点上限 8、儿化白名单；
- `pools`：目标 500 / 最低 300、复习目标 1,000、长度配额、`qualityMaxCharRank = 4000`、屏蔽词性、跨课重复率上限 0.2、单字池目标 / 最低 / 多音上限；
- `examples`：代表字排名上限 4000、生僻阈值 4000、生僻占比上限 0.03；
- `intro`：入门试打词 `双拼`；`training`：练习字库常用字排名上限 5,000。

## 版本链

```text
curriculum-<12hex> = sha256(JSON.stringify({ chapters, lessons }))
pools-<12hex>      = sha256(concat(sorted(fileName + fileContent)))
words-<12hex>      = sha256(dictSha | pinyin-pro 版本 | 过滤参数 | count | 词条内容)
training-<12hex>   = sha256({ schemaVersion, chars })
```

课程 / 词池 / 方案包索引与 `apps/web/public/data/manifest.json` 保存对应版本；`manifest.files` 登记全部同步文件，`validate-all` 逐字节比对 `data/` 与 `public/data/`。

## 重建流程

需要 Node.js ≥ 24；重建词库前安装 `scripts/word-pipeline` 依赖（`pinyin-pro`）：

```bash
cd scripts/word-pipeline && npm install && cd ../..

pnpm data:words        # jieba dict → words.sample.json + anchors.json
pnpm data:curriculum   # 课程模板 + 方案数据 + anchors → 5 套 curriculum
pnpm data:pools        # 课程 + 词库 → 40 份词池 + index
node scripts/training/build-training-bank.mjs   # 练习字库
pnpm data:sync         # 重建方案包并同步到 apps/web/public/data/
pnpm validate          # 版本链 / 契约 / 质量阈值 / public 一致性
```

- `build.mjs` 缺少 `data/raw/jieba-dict.txt` 时自动下载；`--download` 强制刷新，`--words=<N>` 可覆盖词表规模。
- `pnpm dev` / `pnpm build` 只执行 `data:sync`（含方案包重建），不会重建词库、课程与词池。
- 数据修改后提交重新生成的结果（`data/words`、`data/curriculum`、`data/pools`、`data/packages`、`data/training`）；`apps/web/public/data/` 与 `data/raw/` 不入库。

## 校验与审计

```bash
pnpm validate                                 # 数据契约 / 版本链 / 同步 / 文档守卫
node scripts/word-pipeline/audit-words.mjs    # 只读质量统计（JSON）
```

`validate-all.mjs` 覆盖方案与判题用例规模、课程命名法与 learn 覆盖、统一 Lexicon / 迁移期词库契约与质量阈值（生僻示例 ≤3% 且可避免为 0、跨课重复 ≤20%、单字多音 ≤10%、屏蔽词性 0、每个 learn 原子在词池可用）、版本链重算与 `data/` ↔ `public/data/` 逐字节一致。词库口径调整应先改 `word-policy.json`，再重建并校验。
