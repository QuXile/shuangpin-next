# 贡献指南

[← 文档导航](../README.md#文档导航)

## 环境依赖

| 用途 | 依赖 |
|---|---|
| 安装、运行、构建 | **Node.js ≥ 24**、**pnpm 11.28.5** |
| 本地启动 / 自测静态包 | Python 3（只用标准库） |
| 本地打 ZIP | 系统 `zip` / 7-Zip（CI 已内置） |

Node.js 24 是硬性要求：数据脚本以 Node 原生 TypeScript 类型擦除直接 `import` `packages/core/src/*.ts`，与运行时共用同一份逻辑。用 Corepack 启用仓库声明的 pnpm：

```bash
corepack enable
pnpm --version   # 11.28.5
```

## 安装与本地开发

```bash
pnpm install --frozen-lockfile
pnpm dev          # http://127.0.0.1:5199
```

`pnpm dev` 会先重建方案包并同步 `data/` 到 `apps/web/public/data/`，再启动 Vite。`apps/web/public/data/` 是生成物，已在 `.gitignore` 中忽略。

## 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 同步数据并启动开发服务器（5199） |
| `pnpm build` | 同步数据 → `vue-tsc` 类型检查 → Vite 生产构建 |
| `pnpm preview` | 预览生产构建结果 |
| `pnpm test` | core 与 web 的 Vitest 单测 |
| `pnpm typecheck` | core `tsc --noEmit` + web `vue-tsc --noEmit` |
| `pnpm lint:ui` | UI 约定静态检查 |
| `pnpm validate` | 数据 / 版本链 / 同步 / 文档校验 |
| `pnpm verify` | typecheck + lint:ui + data:sync + test + build + validate |
| `pnpm data:packages` | 从每方案源目录生成 public 方案包 |
| `pnpm data:sync` | 原子同步 `data/` 到 `apps/web/public/data/` 并写 manifest |

数据重建的顺序与各文件口径见[数据说明](DATA.md)。

## 仓库结构

顶层为 `apps/web`（Vue 前端）、`packages/core`（纯 TS 领域层）、`data`（数据）、`scripts`（构建与校验）与 `docs`。模块职责见[架构说明](ARCHITECTURE.md)。

## 改动指引

| 想改什么 | 从哪里入手 | 约束 |
|---|---|---|
| 判题 / 选词 / 阶段 / 评分 | `packages/core/src/` | 领域规则只放在 core |
| 页面与交互 | `apps/web/src/pages/`、`composables/`、`stores/` | 页面只做编排；快捷键走 `useGlobalKeys` |
| 视觉样式 | `apps/web/src/styles/tokens.css` + `base.css` | 只用 token / `color-mix`，禁止裸 hex / rgba |
| 词表 / 课程数据 | `data/lexicon/`、`data/schemes/<id>/curriculum.json` | 修改后 `pnpm data:sync` + `pnpm validate` |
| 快捷键 | `apps/web/src/lib/shortcuts.ts` + 各页 `useGlobalKeys` | 帮助面板与[快捷键](SHORTCUTS.md)同步 |

## 提交前检查

```bash
pnpm verify
```

`pnpm verify` 依次执行 typecheck、lint:ui、data:sync、test、build、validate。只改文档时至少运行：

```bash
node scripts/check-ui-conventions.mjs
node scripts/validate-all.mjs
```

CI 工作流见[发布说明](RELEASE.md)。

生成数据的提交规则：

- `apps/web/public/data/`、`dist/`、`release/`、`tmp/` 不入库；
- `data/` 下的方案、课程、Lexicon、方案包入库；Lexicon 与 curriculum 是权威数据，改动后直接运行校验与同步；
- `apps/web/public/data/packages/` 由 `scripts/scheme-packages/build.mjs` 生成，不要手改；
- 不再保留旧词池 / words.sample / training bank 或对应生成器。

## 贡献流程

1. Fork 并从 `main` 拉出分支；
2. 修改并补充必要单测（core 规则改动必须有测试）；
3. 本地 `pnpm verify` 通过后提交 PR，说明改动与验证方式。

本项目采用 GPL-3.0-only，贡献即视为同意以相同许可证发布。
