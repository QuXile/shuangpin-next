# 贡献指南

[← 文档导航](../README.md#文档导航)

开发环境、命令、验证流程与发布说明。

## 环境依赖

| 用途 | 依赖 |
|---|---|
| 安装、运行、构建 | **Node.js ≥ 24**、**pnpm 11.28.5** |
| 本地启动 / 自测静态包 | Python 3，只用标准库 |
| 本地打 ZIP | 系统 `zip` / 7-Zip，CI 已内置 |

Node.js 24 是硬性要求：数据脚本以 Node 原生 TypeScript 类型擦除直接 `import` `packages/core/src/index.ts`，与运行时共用同一份领域逻辑。用 Corepack 启用仓库声明的 pnpm：

```bash
corepack enable
pnpm --version   # 11.28.5
```

## 安装与本地开发

```bash
pnpm install --frozen-lockfile
pnpm dev          # http://127.0.0.1:5199
```

`pnpm dev` 会先运行 `pnpm data:sync`，把 `data/` 单向同步到 `apps/web/public/data/`，再启动 Vite。`apps/web/public/data/` 是紧凑 JSON 生成物，已在 `.gitignore` 中忽略。

## 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 同步数据并启动开发服务器，默认 5199 |
| `pnpm build` | 同步数据 → `vue-tsc` 类型检查 → Vite 生产构建 |
| `pnpm preview` | 预览生产构建结果 |
| `pnpm test` | core 与 web 的 Vitest 单测 |
| `pnpm typecheck` | core `tsc --noEmit` + web `vue-tsc --noEmit` |
| `pnpm lint:ui` | UI 约定静态检查（样式 token / 共享原语 / 输入守卫） |
| `pnpm data:curriculum` | 重建 14 套 simplified 课程，并更新索引的课程能力字段 |
| `pnpm data:sync` | 单向原子同步 `data/` → `apps/web/public/data/`（紧凑 JSON） |
| `pnpm validate` | 数据 / 版本链 / 同步 / 文档的五域校验 |
| `pnpm verify` | typecheck + lint:ui + data:sync + test + build + validate |

数据重建顺序与各文件口径见[数据说明](DATA.md)。

## 仓库结构

```text
apps/web/          Vue 3 + Vite + TS 前端
packages/core/     纯 TS 领域层（types / pinyin / scheme / selector / session / lesson / training / progress / index）
data/              权威源数据（schemes/ + lexicon/，2 空格缩进可读）
scripts/           数据生成 / 同步 / 校验（见下）
docs/              文档（本目录，README 为导航入口）
```

脚本层职责：

```text
scripts/
  generate-universal-curriculum.mjs   生成 14 套 simplified 课程（函数可被 validate import）
  sync-data.mjs                       单向原子同步 data/ → apps/web/public/data/
  validate-all.mjs                    校验入口：只做编排与汇总
  validate/                           schemes / lexicon / curriculum / public-data / docs 五个域模块
  lib/data-contract.mjs               路径常量、JSON 原子读写、深比较、public/data 产物清单、内容 hash
  lib/curriculum-template.mjs         课程模板唯一来源（章节顺序 / 边界算法 / 编码分组；阶段门槛复用 core）
  check-ui-conventions.mjs            UI 约定静态检查（pnpm lint:ui）
  static-package-server.py            静态包启动器（发布产物用，不参与开发）
```

模块职责见[架构说明](ARCHITECTURE.md)；数据管线见[数据说明](DATA.md)。

## 改动指引

| 想改什么 | 从哪里入手 | 约束 |
|---|---|---|
| 判题 / 选词 / 阶段 / 评分 | `packages/core/src/` | 领域规则只放在 core，改后跑 `pnpm test` |
| 课程模板（阶段门槛 / 词量 / 章节顺序 / 边界算法） | `scripts/lib/curriculum-template.mjs` | 生成器与校验器共用；改后 `pnpm data:curriculum` 并检查 `data/` diff |
| 词表 / 方案数据 / 定制课程 | `data/lexicon/`、`data/schemes/` | 见[数据说明](DATA.md)，改后 `pnpm data:sync` + `pnpm validate` |
| 页面与交互 | `apps/web/src/pages/`、`composables/`、`stores/` | 页面只做编排；快捷键走 `useGlobalKeys` |
| 视觉样式 | `apps/web/src/styles/tokens.css` + `base.css` | 只用 token / `color-mix`，禁止裸 hex / rgba / 裸字号 |
| 快捷键 | `apps/web/src/lib/shortcuts.ts` + 各页 `useGlobalKeys` | 帮助面板与[快捷键](USAGE.md#快捷键)同步 |
| UI 约定守卫 | `scripts/check-ui-conventions.mjs` | 只增加有实际约束的规则，避免误报 |

## 验证流程

提交前统一跑：

```bash
pnpm verify
```

`pnpm verify` 依次执行 typecheck、lint:ui、data:sync、test、build、validate；数据同步与校验已包含在内。

涉及数据或生成课程的改动，至少再确认一遍数据侧闭环：

```bash
pnpm data:curriculum   # 涉及方案数据 / 课程模板 / 生成器时
pnpm data:sync
pnpm validate
git diff --stat data/  # 确认数据变更符合预期
```

`pnpm validate` 的 `public-data` 域要求先生成运行时数据，因此不能跳过 `data:sync`。生成课程是重新生成的：修改模板或方案数据后 `data/` 出现非预期 diff 时，以权威数据与模板语义为准逐项核对。

只改文档时至少运行：

```bash
node scripts/validate-all.mjs
```

它包含文档入口、README 导航、本地链接与截图引用检查。若工作区尚未生成 `apps/web/public/data`，先运行 `pnpm data:sync`，否则 `public-data` 域会提示缺文件。

## 生成数据提交规则

- `apps/web/public/data/`、`dist/`、`release/` 不入库；
- `data/` 下的方案、课程、判题用例与 Lexicon 入库，是权威源数据；`data/` 源文件保持 2 空格缩进可读；
- `apps/web/public/data/` 由 `scripts/sync-data.mjs` 生成（紧凑 JSON），不要手改，可随时删除重建；
- 14 套 simplified 课程由生成器重建，不要直接手改；定制 full 课程是权威数据，可以直接编辑，但需按内容更新 `dataVersion`；
- 改动数据后 `pnpm validate` 必须全绿。

## 贡献流程

1. Fork 并从 `main` 拉出分支；
2. 修改并补充必要单测，core 规则改动必须有测试；
3. 本地 `pnpm verify` 通过后提交 PR，说明改动与验证方式。

本项目采用 GPL-3.0-only，贡献即视为同意以相同许可证发布。

## 发布说明

### 版本与产物

- 版本以根 `package.json` 的 `version` 为准，当前 `1.4.0`，许可证 GPL-3.0-only。
- 发布产物为静态包 ZIP `shuangpin-next-<版本>-static.zip`，另附 `SHA256SUMS`。
- 手动触发工作流时版本记为 `dev-<commit 前 7 位>`，只上传 Actions 产物，不创建 Release。

### 构建

```bash
pnpm install --frozen-lockfile
pnpm verify   # 推荐；CI 会执行
pnpm build
```

`pnpm build` 先执行 `scripts/sync-data.mjs` 把 `data/` 单向同步为 `apps/web/public/data/`，再执行 `vue-tsc` 与 Vite 生产构建，输出到 `apps/web/dist/`。`apps/web/public/data/` 是 gitignored 生成物，干净克隆无需预先准备。部署在子路径时注入 base：

```bash
VITE_BASE=/shuangpin-next/ pnpm build
```

### 运行时数据产物

构建时的数据链路是单向的：`data/`（权威源数据）→ `apps/web/public/data/`（`pnpm data:sync` 生成，紧凑 JSON）→ `apps/web/dist/data/`（Vite 原样拷贝 `public/`）。

`dist/data/` 只包含 4 类运行时文件，共 40 个、约 10.9 MiB：

```text
dist/data/
  index.json              方案索引
  schemes/<id>.json       19 套方案
  curriculum/<id>.json    19 套课程
  lexicon/lexicon.json    统一词表
```

- `dist/data/` 只包含上述 4 类文件；运行时只按这 4 条路径加载，无需额外服务器配置。
- 数据目录从旧版约 28 MiB 降到约 10.9 MiB（紧凑序列化 + 去掉重复镜像），静态包整体相应变小。
- 不要手工编辑 `apps/web/public/data/` 或 `apps/web/dist/data/`；改数据请改 `data/` 后重新构建，详见[数据说明](DATA.md)。

### 静态包构建

静态包使用相对资源路径 + hash 路由，可放在任意静态目录、无需服务器 SPA 重写：

```bash
VITE_BASE=./ VITE_ROUTER_MODE=hash pnpm build
cp scripts/static-package-server.py apps/web/dist/start.py
cp LICENSE apps/web/dist/LICENSE
```

Windows PowerShell 设置环境变量的写法：

```powershell
$env:VITE_BASE = './'
$env:VITE_ROUTER_MODE = 'hash'
pnpm build
```

生成 `使用说明.txt` 后打包：

```bash
cd apps/web/dist
zip -qr ../../../release/shuangpin-next-<版本>-static.zip .
cd ../../../release
sha256sum shuangpin-next-<版本>-static.zip > SHA256SUMS
```

包内应包含 `index.html`、`assets/`、`data/`、`start.py`、`LICENSE`、`使用说明.txt`；其中 `data/` 就是上文 4 类运行时文件。`start.py` 打印地址、数据目录与停止方式并自动打开浏览器，支持 `--port` / `--no-browser` / `--root`。不要单独分发或双击 `index.html`，浏览器会阻止本地页面读取同目录 JSON。

### CI 工作流

数据管线改造对 CI **透明，无需修改工作流**：三个工作流都只调用 `pnpm verify` / `pnpm build`，而这两条命令会自动执行数据同步。

- **`verify.yml`**：推送 `main` 或 PR 时触发；安装依赖后运行 `pnpm verify`（内部包含 `data:sync` 与 `validate`）。
- **`release-static.yml`**：推送 `v*` tag 或手动触发；运行 `pnpm verify` 后以 `VITE_BASE=./ VITE_ROUTER_MODE=hash` 构建静态包，附加 `LICENSE`、`start.py`、`使用说明.txt`，生成 ZIP 与 `SHA256SUMS`，上传 Actions artifact，tag 触发时创建 GitHub Release。
- **`deploy-pages.yml`**：推送 `v*` tag 或手动触发；以 `VITE_BASE=/shuangpin-next/` 构建，复制 `index.html` 为 `404.html` 作为 SPA 回退，用 `peaceiris/actions-gh-pages` 发布到 `gh-pages`。在线地址 <https://quxile.github.io/shuangpin-next/>。

### 发布流程

1. `pnpm verify` 全绿。
2. 确认根 `package.json` 的版本与要打的 tag 一致，如 `1.4.0` ↔ `v1.4.0`。
3. 打 tag 并推送：

   ```bash
   git tag v1.4.0
   git push origin v1.4.0
   ```

4. 观察 `release-static` 与 `deploy-pages` 工作流；下载 ZIP 自测：数据加载、`#/training` 与 `#/practice/<lessonId>` 路由、断网可用、`LICENSE` / `使用说明.txt` / `SHA256SUMS` 齐全。
