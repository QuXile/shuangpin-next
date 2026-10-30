# 词库数据管线

本目录负责**基础词表**（`data/words/words.sample.json`）与 **40 课课程词池**（`data/pools/`）的生成。
版本口径、字段契约与验收标准由 `scripts/lib/data-contract.mjs` 与 `scripts/validate-all.mjs` 统一维护。

## 结构

| 文件 | 职责 | 产物 |
|---|---|---|
| `lib/wordbank.mjs` | jieba 词典解析、拼音拆分（复用 `@shuangpin/core` 的 `splitPinyin`）、tone 1–5、polyphone、全局 `freqRank` —— `build.mjs` 与 `build-pools.mjs` 共用 | — |
| `build.mjs` | 生成基础词表（8000 词，单行一条便于 diff）与构建期记忆锚点索引 | `data/words/words.sample.json`、`data/words/anchors.json` |
| `build-pools.mjs` | 按 xiaohe 课程知识点为 40 课选词（5 套方案共用），tone/freqRank/polyphone 合规，写 `sources` 版本；教学示例按 focus 原子全量枚举 | `data/pools/<lessonId>.json` + `data/pools/index.json` |
| `audit-words.mjs` | 只读词库/词池审计统计（不修改 data），供 `docs/WORDS.md` | 终端 JSON |
| `scripts/training/build-training-bank.mjs` | 训练场训练库（单字 + 8000 词），sync 到 `public/data/training/bank.json` | `data/training/bank.json` |

`data/schemes/*.json` 是冻结的方案事实源（provenance 见 `data/schemes/index.json:reference`）。

## 运行

Node.js ≥ 24（脚本直接 `import` core 的 TypeScript 源文件）。首次使用需安装本目录依赖：

```bash
cd scripts/word-pipeline && npm install
```

从仓库根目录按顺序执行完整数据重建：

```bash
pnpm data:words        # data/words/words.sample.json
pnpm data:curriculum   # data/curriculum/*.json（需要 core 的 engine.diff）
pnpm data:pools        # data/pools/*.json（需要课程 + 词库）
pnpm data:sync         # 原子同步到 apps/web/public/data/
pnpm validate          # 版本链 + public 一致 + 契约断言
```

`build.mjs` 在缺少 `data/raw/jieba-dict.txt` 时会按 `source.url` 自动下载（可用 `--download` 强制刷新）。

`data/words/anchors.json` 是课程内容的构建期索引（`syllableChars` / `finalChars` / `initialChars`，
用于生成每课的 `tips` 与 `atomMeta.anchors/mnemonic`），**不参与运行时同步**。

## 口径摘要

- 只保留 2–4 字纯汉字词；儿化词丢弃（保留少量独立“儿”音节词）；
- 词上下文拼音；`pinyin = initial + final`（ü→v）；`tone ∈ 1..5`（0 → 5）；
- `polyphone` 保留；`freqRank` 为全量词表的全局排名（禁止按池重编号）；
- free/learn 原子全部由 `@shuangpin/core` 的 `createSchemeEngine(scheme).diff()` 推导，不硬编码；
- 词池索引记录 `sources = { curriculum: <xiaohe 课程版本>, dict: <jieba sha256 前 12 位> }`，`dataVersion = pools-<12hex>`；
- 记忆锚点：每音节/韵母/声母按字频取前 8 字（构建期索引，不进入运行时）；
- `data/words/syllable-patches.json`：显式音节字符补丁（如 zhei/eng）；
- `data/words/word-policy.json`：词性/儿化/词池规模/质量与示例字阈值/intro 试打词等词库口径，build、build-pools、validate 共用；
- `scripts/lib/pool-examples.mjs`：按 focus 原子枚举教学示例音节的共享实现（builder 与 validate 共用）。

## 许可

- 词频/词表：[jieba](https://github.com/fxsjy/jieba)（MIT）；
- 拼音：[pinyin-pro](https://github.com/zh-lx/pinyin-pro)（MIT）；
- 本目录代码为本项目原创实现。
