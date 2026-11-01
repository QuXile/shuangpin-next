# 数据说明

[← 文档导航](../README.md#文档导航)

## 运行期数据

运行期只发布三类数据：

| 目录 | 内容 |
|---|---|
| `data/schemes/<id>/` | 每套方案的 `scheme.json`，课程方案另有 `curriculum.json` |
| `data/schemes/index.json` / `curriculum-index.json` | 方案与课程索引 |
| `data/lexicon/lexicon.json` | 课程与练习场共用的唯一词表 |

运行时方案包生成到 `apps/web/public/data/packages/`；`apps/web/public/data/` 由 `pnpm data:sync` 从源数据生成，不手工编辑。

## 统一 Lexicon

`data/lexicon/lexicon.json` 是唯一词表，包含：

- `words`：26,883 条 2–5 字词；
- `chars`：5,022 个常用单字；
- `syllableExamples`：405 个音节的代表字示例。

课程按 lesson 的已学原子 / focus 在 core 选词器中筛选；练习场按当前选择范围筛选。题目统一来自 Lexicon。

Lexicon 是权威数据：修改词表直接编辑并校验 `lexicon.json`。

## 课程

`data/schemes/<id>/curriculum.json` 是课程方案的标准课程，包含章节、课程节点、focus / blocking / prerequisites、wordPlan、passCriteria 与教学示例元信息。

课程数据是权威数据；C 双拼保持 practice-only，没有课程。修改课程时直接编辑对应 curriculum，再运行 `pnpm data:sync` 与 `pnpm verify`。

## 数据版本

| 数据 | 版本 |
|---|---|
| Lexicon | `lexicon-fe0e0bd32c56` |
| 课程（xiaohe / ziranma / weiruan / sougou / zhinengabc） | `curriculum-e9aea6cd5fd3` / `curriculum-be4a8fb23d2a` / `curriculum-e7ccb68d065f` / `curriculum-e13751ee90b9` / `curriculum-9c6985cf8133` |

`apps/web/public/data/manifest.json` 的 `versions` 只记录 `curriculum` 与 `lexicon`；`manifest.files` 登记全部同步文件。

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
pnpm data:sync     # 重建方案包并同步 apps/web/public/data/
pnpm data:packages # 仅重建 public 方案包
pnpm verify        # typecheck + lint + sync + test + build + validate
```

`pnpm dev` / `pnpm build` 会自动运行 `data:sync`。

## 校验

`scripts/validate-all.mjs` 覆盖：

- 19 套方案与判题用例规模；
- 5 套课程、章节/课程结构、命名法、cumulative、learn 原子覆盖、版本重算；
- 统一 Lexicon 的词/字/音节示例数量、唯一性、字段与版本；
- 方案包与 `data/schemes/<id>/` 源数据一致；
- `manifest` 版本链与 `data/` ↔ `public/data/` 逐字节一致；
- 文档入口、图片与本地链接、README 导航覆盖。
