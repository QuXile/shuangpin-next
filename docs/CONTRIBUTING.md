# 贡献指南

[← 文档导航](../README.md#文档导航)

本页面向修改仓库代码、数据或文档的开发者。使用产品请看 [使用说明](USAGE.md)，实现细节见 [架构说明](ARCHITECTURE.md)。

## 环境依赖

| 用途 | 依赖 |
|---|---|
| 安装、运行、构建源码 | **Node.js ≥ 24**、**pnpm 11.28.5** |
| 启动 / 自测静态包 | Python 3（只需标准库；`start.py` 无第三方依赖） |
| 本地打 ZIP | 系统 `zip` / 7-Zip（CI 已内置） |
| 重新生成词库 | 可选，需要 `data/raw/jieba-dict.txt`（构建脚本会自动下载） |

Node.js 24 是硬性要求：数据脚本用 Node 原生 TypeScript 类型擦除直接 `import` `packages/core/src/*.ts`，因此脚本与运行时共用同一份拼音 / 方案 / 课程逻辑。

推荐通过 Corepack 启用仓库声明的 pnpm：

```bash
corepack enable
pnpm --version   # 11.28.5
```

## 安装与本地开发

```bash
pnpm install --frozen-lockfile
pnpm dev          # http://127.0.0.1:5199（strictPort）
```

`pnpm dev` 会先从根 `data/` 生成并同步运行时数据到 `apps/web/public/data/`（`scripts/sync-data.mjs`，内部会先重建方案包），再启动 Vite。`apps/web/public/data/` 与 `data/raw/` 是生成物 / 原始下载文件，已在 `.gitignore` 中忽略。

## 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 同步数据并启动开发服务器（5199） |
| `pnpm build` | 同步数据 → `vue-tsc` 类型检查 → Vite 生产构建 |
| `pnpm preview` | 预览生产构建结果 |
| `pnpm test` | core 与 web 的 Vitest 单测 |
| `pnpm typecheck` | core `tsc --noEmit` + web `vue-tsc --noEmit` |
| `pnpm lint:ui` | UI 约定静态检查（`scripts/check-ui-conventions.mjs`） |
| `pnpm validate` | 数据 / 版本链 / 同步 / 文档校验（`scripts/validate-all.mjs`） |
| `pnpm verify` | 完整校验：typecheck + lint:ui + data:sync + test + build + validate |
| `pnpm data:words` | 生成公共词库与记忆锚点 |
| `pnpm data:curriculum` | 由课程模板生成 5 套课程 JSON |
| `pnpm data:pools` | 生成 40 课词池 |
| `pnpm data:packages` | 由扁平数据组装方案包（`data/packages/`） |
| `pnpm data:sync` | 原子同步 `data/` → `apps/web/public/data/` 并写 manifest |

数据重建的完整顺序、各文件口径与版本链见 [数据说明](DATA.md)。

## 仓库结构

```text
apps/web/       Vue 3 + Vite 前端（pages / components / stores / composables / lib / styles）
packages/core/  纯 TS 领域层：拼音、方案引擎、选词、会话、阶段、评分（无 Vue / DOM 依赖）
data/           方案、课程、词库、词池、训练库等源数据与生成数据
scripts/        数据构建、方案打包、同步、校验脚本；静态包启动器
docs/           本套文档与界面截图
```

各组件的职责与依赖关系见 [架构说明](ARCHITECTURE.md#2-仓库结构)。

## 改动指引

| 想改什么 | 从哪里入手 | 约束 |
|---|---|---|
| 判题 / 选词 / 阶段 / 评分等规则 | `packages/core/src/` | 领域规则只能放在 core；Web 不做领域计算 |
| 页面与交互 | `apps/web/src/pages/`、`composables/`、`stores/` | 页面只做编排；快捷键统一走 `useGlobalKeys` |
| 视觉样式 | `apps/web/src/styles/tokens.css` + `base.css` | 组件样式只用 token / `color-mix`，禁止裸 hex / rgba；见 [界面与设计](UI.md) |
| 词库 / 词池 / 课程数据 | `data/` + `scripts/` | 改动后按 [数据说明](DATA.md) 重建并 `pnpm validate` |
| 快捷键 | `apps/web/src/lib/shortcuts.ts` + 各页 `useGlobalKeys` 绑定 | 帮助面板与本页 [快捷键](SHORTCUTS.md) 同步更新 |
| 文档 / 截图 | `README.md`、`docs/` | 保持与当前功能一致 |

## 提交前检查

```bash
pnpm verify
```

`pnpm verify` 依次执行：

1. `typecheck`：core 与 web 类型检查；
2. `lint:ui`：组件无裸色值、设计 token 无未使用项、训练场色调契约、文档引用的截图存在；
3. `data:sync`：重建方案包并把 `data/` 同步到 `apps/web/public/data/`；
4. `test`：core 与 web 单测；
5. `build`：生产构建（含类型检查）；
6. `validate`：数据契约 / 版本链 / public 逐字节一致 / 文档与截图守卫。

如果只改文档，至少运行：

```bash
node scripts/check-ui-conventions.mjs
node scripts/validate-all.mjs
```

CI 的 `verify` 与 `release-static` 工作流会执行同一套检查，见 [发布说明](RELEASE.md)。

**生成数据的提交规则**：

- `apps/web/public/data/`、`data/raw/`、`dist/`、`release/`、`tmp/` 不入库；
- `data/schemes/`、`data/curriculum/`、`data/pools/`、`data/packages/`、`data/words/`、`data/training/` 中的生成数据入库，改动后应提交重新生成的结果并附带通过的 `pnpm validate`；
- 不要手动改 `data/packages/`（由 `scripts/scheme-packages/build.mjs` 生成）。

## 贡献流程

1. Fork 仓库并从 `main` 拉出分支；
2. 按上面的指引修改，必要时补充单测（core 规则改动必须有对应测试）；
3. 本地运行 `pnpm verify`；
4. 提交 PR，说明改动动机、影响范围与验证方式。

本项目采用 GPL-3.0-only，贡献即视为同意以相同许可证发布；第三方来源与许可见 [README](../README.md#来源与第三方许可)。
