# 数据说明

[← 文档导航](../README.md#文档导航)

## 运行期数据

运行期只发布三类数据：

| 目录 | 内容 |
|---|---|
| `data/schemes/<id>/` | 每套方案的 `scheme.json`，课程方案另有 `curriculum.json` |
| `data/schemes/index.json` / `curriculum-index.json` | 方案与课程索引 |
| `data/lexicon/lexicon.json` | 课程与练习场共用的唯一词表 |

运行时方案包只在 `apps/web/public/data/packages/` 生成，不再写回 `data/packages/`；`apps/web/public/data/` 由 `pnpm data:sync` 从上述数据生成，不手工编辑。

## 统一 Lexicon

`data/lexicon/lexicon.json` 是唯一词表，包含：

- `words`：26,883 条 2–5 字词；
- `chars`：5,022 个常用单字；
- `syllableExamples`：405 个音节的代表字示例。

课程按 lesson 的已学原子/focus 在 core 选词器中筛选；练习场按当前选择范围筛选。每课不再有独立词池。

Lexicon 是权威数据：修改词表意味着直接编辑并校验 `lexicon.json`，不再从 `words.sample` / 每课词池合并生成。

## 课程

`data/schemes/<id>/curriculum.json` 是课程方案的标准课程，包含章节、40 课、focus / blocking / prerequisites、wordPlan、passCriteria 与教学示例元信息。

课程数据是权威数据；C 双拼保持 practice-only，没有课程。修改课程时直接编辑对应 curriculum，再运行 `pnpm data:sync` 与 `pnpm verify`。

## 数据版本

| 数据 | 版本 |
|---|---|
| Lexicon | `lexicon-fe0e0bd32c56` |
| 课程（xiaohe / ziranma / weiruan / sougou / zhinengabc） | `curriculum-8c11b27afd64` / `curriculum-7315038dab09` / `curriculum-577f9f01f258` / `curriculum-8fd0acef60f6` / `curriculum-32a71a1c61db` |

`apps/web/public/data/manifest.json` 的 `versions` 只记录 `curriculum` 与 `lexicon`；`manifest.files` 登记全部同步文件。

## 方案数据

- `data/schemes/<id>/scheme.json`：单方案文件夹，包含 `initials` / `finals` / `zeroInitial` / `recommended` / `compatCodes` 等；
- `data/schemes/index.json`：方案索引、默认方案、课程能力；`curriculum-index.json`：课程索引。
- `data/schemes/engine-cases.json`：判题正反例；
- `recommended`：仅多码音节需要的推荐/标答序列；`compatCodes`：仅不能由声母/韵母组合出来的特殊序列；C 的 `zhu` 推荐 `of`，`vf` 进入特殊表；`ou/vu` 由组合回退接受，不进入特殊表。
- 课程 Hero 只接受推荐码；练习场接受推荐码、特殊码和组合码。
- `apps/web/public/data/packages/`：由 `scripts/scheme-packages/build.mjs` 生成，不手改；源在 `data/schemes/<id>/`。

C 双拼的规则参考 [fcitx5-chinese-addons 的 C双拼配置](https://github.com/fcitx/fcitx5-chinese-addons/blob/e8d930f402e359cfd76a101ee3e46815d1331d83/im/pinyin/sp.dat.example)（LGPL-2.1），仅作规则与映射比对，不复制代码。

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
- 5 套课程 × 40 课、命名法、cumulative、learn 原子覆盖、版本重算；
- 统一 Lexicon 的词/字/音节示例数量、唯一性、字段与版本；
- 方案包与 `data/schemes/<id>/` 源数据一致；
- `manifest` 版本链与 `data/` ↔ `public/data/` 逐字节一致；
- 文档入口、图片与本地链接、README 导航覆盖。
