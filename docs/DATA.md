# 数据说明

[← 文档导航](../README.md#文档导航)

## 运行期数据

运行期只发布三类数据：

| 目录 | 内容 |
|---|---|
| `data/schemes/<id>/` | 每套方案的 `scheme.json` 与 `curriculum.json` |
| `data/schemes/index.json` / `curriculum-index.json` | 方案与课程索引 |
| `data/lexicon/lexicon.json` | 课程与练习场共用的唯一词表 |

运行时方案包生成到 `apps/web/public/data/packages/`；`apps/web/public/data/` 由 `pnpm data:sync` 从源数据生成，不手工编辑。

## 统一 Lexicon

`data/lexicon/lexicon.json` 是唯一词表，包含：

- `words`：清洗 jieba 后的 29,660 条 2–5 字词（去专名/字母/低频）；
- `chars`：每音字频 top10 的小字符库（3,009 字）；
- `syllableExamples`：405 个音节的代表字示例。

课程按 lesson 的已学原子 / focus 在 core 选词器中筛选；练习场按当前选择范围筛选。题目统一来自 Lexicon。

Lexicon 是权威数据：修改词表直接编辑并校验 `lexicon.json`。

## 课程

19 套方案都有课程：`data/schemes/<id>/curriculum.json` 包含章节、课程节点、focus / blocking / prerequisites、wordPlan、passCriteria 与教学示例元信息。`supportLevel` 区分两类课程：

- `full`（5 套：小鹤 / 微软 / 自然码 / 拼音加加 / 搜狗）：手写完整课程，数据是权威数据，直接编辑；
- `simplified`（其余 14 套）：由 `scripts/generate-universal-curriculum.mjs` 从 `scheme.json` + 统一 Lexicon 自动生成，**不要手改**，改方案数据后重新生成即可。

通用课程只给 learn 原子逐课排课（每个原子一节课、不合并）；与全拼一致的 free 原子直接作为已会内容，不单独生成复习课。推荐码例外与兼容编码不单独设课，信息写入对应原子课或综合课的 `tips`。生成命令：

```bash
pnpm data:curriculum   # 生成 / 更新 14 套通用课程、课程索引与方案课程能力
pnpm data:sync         # 生成后同步到 apps/web/public/data/
```

修改 5 套手写课程后直接运行 `pnpm data:sync` 与 `pnpm verify`。

## 数据版本

| 数据 | 版本 |
|---|---|
| Lexicon | `lexicon-69651be6f08e` |
| 课程 · 小鹤双拼（xiaohe） | `curriculum-aff0dea8ad0c` |
| 课程 · 微软双拼（weiruan） | `curriculum-5eb47cfe179b` |
| 课程 · 自然码（ziranma） | `curriculum-3486f1cddf26` |
| 课程 · 拼音加加（pinyinjiajia） | `curriculum-750d2ca75102` |
| 课程 · 搜狗双拼（sougou） | `curriculum-2c66869fe861` |
| 课程 · 智能ABC（zhinengabc） | `curriculum-e44add638213` |
| 课程 · 紫光双拼（ziguang） | `curriculum-353dd3e4fd9c` |
| 课程 · 蓝天双拼（lantian） | `curriculum-ff7466f96cb5` |
| 课程 · 白云双拼（baiyun） | `curriculum-e0caacc1b940` |
| 课程 · 小月双拼（xiaoyue） | `curriculum-a0060a2efc35` |
| 课程 · 国标双拼（guobiao） | `curriculum-d82272d471c0` |
| 课程 · 开源小鹳（xiaoguan） | `curriculum-e1ee8a509b5b` |
| 课程 · 小浪双拼（xiaolang） | `curriculum-64e147fec937` |
| 课程 · 韵标块拼（yunbiaokuaipin） | `curriculum-1bf7542a5895` |
| 课程 · 星空双拼（xingkong） | `curriculum-be6ddf9c0f5a` |
| 课程 · 大牛双拼（daniu） | `curriculum-0c0cdfccca44` |
| 课程 · 键道双拼3（jiandao3） | `curriculum-6295b1f4e33d` |
| 课程 · 键道双拼6（jiandao6） | `curriculum-fbf89d202062` |
| 课程 · C双拼（c） | `curriculum-426feb93ae4b` |
