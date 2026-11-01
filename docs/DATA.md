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

- `full`（5 套：小鹤 / 自然码 / 微软 / 搜狗 / 智能 ABC）：手写完整课程，数据是权威数据，直接编辑；
- `simplified`（其余 14 套）：由 `scripts/generate-universal-curriculum.mjs` 从 `scheme.json` + 统一 Lexicon 自动生成，**不要手改**，改方案数据后重新生成即可。

通用课程只给 learn 原子逐课排课（每个原子一节课、不合并）；与全拼一致的 free 原子统一放进第一章「复习 · 全拼沿用」。推荐码例外与兼容编码不单独设课，信息写入对应原子课 `tips`。生成命令：

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
| 课程 · 自然码（ziranma） | `curriculum-3486f1cddf26` |
| 课程 · 微软双拼（weiruan） | `curriculum-5eb47cfe179b` |
| 课程 · 搜狗双拼（sougou） | `curriculum-2c66869fe861` |
| 课程 · 智能ABC（zhinengabc） | `curriculum-8addbb9b5f04` |
| 课程 · 拼音加加（pinyinjiajia） | `curriculum-3959fd8c2726` |
| 课程 · 紫光双拼（ziguang） | `curriculum-a4903672492f` |
| 课程 · 蓝天双拼（lantian） | `curriculum-e4e67bee8790` |
| 课程 · 白云双拼（baiyun） | `curriculum-581921b9282c` |
| 课程 · 小月双拼（xiaoyue） | `curriculum-e007c0c41dfe` |
| 课程 · 国标双拼（guobiao） | `curriculum-91b82527ec29` |
| 课程 · 开源小鹳（xiaoguan） | `curriculum-d4f328050518` |
| 课程 · 小浪双拼（xiaolang） | `curriculum-2706759151e7` |
| 课程 · 韵标块拼（yunbiaokuaipin） | `curriculum-4fd58df4dbe4` |
| 课程 · 星空双拼（xingkong） | `curriculum-5d8e27a98c36` |
| 课程 · 大牛双拼（daniu） | `curriculum-c752de9d4735` |
| 课程 · 键道双拼3（jiandao3） | `curriculum-f87c554c84d0` |
| 课程 · 键道双拼6（jiandao6） | `curriculum-5fd21ca32cc0` |
| 课程 · C双拼（c） | `curriculum-da036769f108` |

`apps/web/public/data/manifest.json` 的 `versions` 只记录 `curriculum` 与 `lexicon`；`manifest.versions.curriculum` 取默认方案（xiaohe）的课程版本，每套课程自身的版本以各自 `curriculum.json` 的 `dataVersion` 为准。`manifest.files` 登记全部同步文件。

## 方案数据

- `data/schemes/<id>/scheme.json`：单方案文件夹，包含 `initials` / `finals` / `zeroInitial` / `recommended` / `compatCodes` 等；
- `data/schemes/index.json`：方案索引、默认方案、课程能力；`curriculum-index.json`：课程索引。
- `data/schemes/engine-cases.json`：判题正反例；
- `recommended`：仅多码音节需要的推荐/标答序列；`compatCodes`：仅不能由声母/韵母组合出来的特殊序列；C 的 `zhu` 推荐 `of`，`vf` 进入特殊表；`ou/vu` 由组合回退接受，不进入特殊表。
- 课程与练习场都接受推荐码、兼容编码和组合码；显示仍使用推荐码/主键。
- `apps/web/public/data/packages/`：由 `scripts/scheme-packages/build.mjs` 生成，不手改；源在 `data/schemes/<id>/`。

方案规则来源：

- [fcitx/libime](https://github.com/fcitx/libime) 内建规则 `Xiaohe`、`Ziranma`、`MS`、`ABC`、`PinyinJiaJia`、`Ziguang`、`GB` 分别对应小鹤、自然码、微软、智能 ABC、拼音加加、紫光、国标；
- C 双拼使用 [fcitx5-chinese-addons 的 sp.dat.example](https://github.com/fcitx/fcitx5-chinese-addons/blob/e8d930f402e359cfd76a101ee3e46815d1331d83/im/pinyin/sp.dat.example)；
- fcitx 无对应规则的搜狗、蓝天、白云、小月、开源小鹳、小浪、韵标块拼、星空、大牛、键道双拼 3、键道双拼 6 及推荐码 / 兼容编码补充数据来自 [BlueSky-07/Shuang](https://github.com/BlueSky-07/Shuang)（GPL-3.0）。

## 命令

```bash
pnpm data:curriculum # 生成 / 更新 14 套通用课程与课程索引（可重复运行）
pnpm data:sync       # 重建方案包并同步 apps/web/public/data/
pnpm data:packages   # 仅重建 public 方案包
pnpm verify          # typecheck + lint + sync + test + build + validate
```

`pnpm dev` / `pnpm build` 会自动运行 `data:sync`。

## 校验

`scripts/validate-all.mjs` 覆盖：

- 19 套方案与判题用例规模；
- 19 套课程：5 套手写课程按 v1 模板严格校验；14 套通用课程校验章节顺序、每原子逐课、期中边界、最终章顺序与编码 tips 完整性；全部课程校验命名法、cumulative、learn 原子覆盖与版本重算；
- 统一 Lexicon 的词/字/音节示例数量、唯一性、字段与版本；
- 方案包与 `data/schemes/<id>/` 源数据一致；
- `manifest` 版本链与 `data/` ↔ `public/data/` 逐字节一致；
- 文档入口、图片与本地链接、README 导航覆盖。
