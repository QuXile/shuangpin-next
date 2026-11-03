# 贡献指南

[← 文档导航](../README.md#文档导航)

开发环境、命令、数据维护、验证与发布。

## 环境

| 用途 | 依赖 |
|---|---|
| 安装、运行、构建 | Node.js ≥ 24、pnpm 11.28.5 |
| 本地启动 / 自测静态包 | Python 3（标准库） |
| 本地打包 | 系统 `zip` / 7-Zip |

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev        # http://127.0.0.1:5199
```

`pnpm dev` 先运行 `pnpm data:sync` 同步数据，再启动 Vite。数据脚本与运行时共用 `packages/core/src/index.ts` 的领域逻辑。

## 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 同步数据并启动开发服务器 5199 |
| `pnpm build` | 同步数据 → 类型检查 → Vite 构建 |
| `pnpm preview` | 预览生产构建 |
| `pnpm test` | core 与 web 的 Vitest 测试 |
| `pnpm typecheck` | core `tsc --noEmit` + web `vue-tsc --noEmit` |
| `pnpm lint:ui` | UI 约定检查（token / 共享原语 / 输入守卫） |
| `pnpm data:lexicon` | 从 `data/raw/jieba-dict.txt` 重建词表 |
| `pnpm data:sync` | 单向原子同步 `data/` → `apps/web/public/data/` |
| `pnpm validate` | 五域数据与文档校验 |
| `pnpm verify` | typecheck + lint:ui + data:sync + test + build + validate |

## 仓库结构

```text
apps/web/          Vue 3 + Vite + TS 前端
packages/core/     纯 TS 领域层（types / pinyin / scheme / selector / session / lesson / training / progress / index）
data/              权威源数据（schemes/ + lexicon/，2 空格缩进）
scripts/           数据生成 / 同步 / 校验 / 静态包启动器 / UI 约定检查
docs/              文档，README 为导航入口
```

脚本：

```text
scripts/
  build-lexicon.mjs                   从 jieba 词典重建词表
  sync-data.mjs                       同步 data/ → apps/web/public/data/
  validate-all.mjs                    校验入口
  validate/                           schemes / lexicon / curriculum / public-data / docs
  lib/data-contract.mjs               路径、JSON 原子读写、深比较、内容 hash
  lib/pinyin-resolve.mjs              构建期拼音解析
  check-ui-conventions.mjs            UI 约定检查（pnpm lint:ui）
  static-package-server.py            静态包启动器
```

## 改动指引

| 目标 | 入口 | 约束 |
|---|---|---|
| 判题 / 选词 / 阶段 / 评分 | `packages/core/src/` | 领域规则只在 core，改后跑 `pnpm test` |
| 通用课程模板 | `packages/core/src/curriculum.ts` | 纯函数生成；改后跑 `pnpm test` 与 `pnpm validate` |
| 词表 / 方案 / 定制课程 | `data/lexicon/`、`data/schemes/`、`scripts/build-lexicon.mjs` | 见[数据说明](DATA.md)，改后 `pnpm data:sync` + `pnpm validate` |
| 页面与交互 | `apps/web/src/` | 页面只做编排；快捷键走 `useGlobalKeys` |
| 视觉样式 | `apps/web/src/styles/tokens.css` + `base.css` | 只使用 token 与 `color-mix` |
| 快捷键 | `apps/web/src/lib/shortcuts.ts` + 各页 `useGlobalKeys` | 帮助面板与[快捷键](USAGE.md#快捷键)同步 |
| UI 约定 | `scripts/check-ui-conventions.mjs` | 只增加可验证规则 |

## 验证

提交前：

```bash
pnpm verify
```

涉及数据时：

```bash
pnpm data:sync
pnpm validate
git diff --stat data/
```

`validate` 的 `public-data` 域要求先生成运行时数据，因此顺序为 `data:sync` → `validate`。只改文档时运行 `node scripts/validate-all.mjs`，检查文档入口、README 导航与本地链接。

## 数据与生成物

- `data/` 下的方案、课程、判题用例与词表入库，是权威源数据；
- `apps/web/public/data/`、`dist/`、`release/` 不入库；public 数据由 `pnpm data:sync` 重建；
- 5 套定制课程的结构 / 文案人工维护；14 套通用课程由 `packages/core/src/curriculum.ts` 在运行期生成；
- 键位、记忆锚点、教学示例、推荐码 / 兼容码提示由运行时生成，课程文件只含结构与人工文案；
- 改动数据后 `pnpm validate` 需全绿。

## 贡献流程

1. 从 `main` 拉出分支；
2. 修改并补充必要单测，core 规则改动必须有测试；
3. `pnpm verify` 通过后提交 PR，说明改动与验证方式。

项目采用 GPL-3.0-only，贡献即视为同意以相同许可证发布。

## 文档约定

- README 是文档导航的唯一入口，必须链接 `docs/` 下全部 Markdown；
- 文档只写当前事实，不写版本历史、迁移过程或临时状态；
- 本地链接必须可解析，不保留容易过期的界面截图；
- 改数据、命令、目录或页面行为时同步更新对应文档。

## 发布

### 版本与产物

- 版本以根 `package.json` 的 `version` 为准（当前 `1.5.1`），许可证 GPL-3.0-only；
- 发布产物为静态包 `shuangpin-next-<版本>-static.zip` 与 `SHA256SUMS`；
- 手动触发工作流时版本记为 `dev-<commit 前 7 位>`，只上传 Actions 产物，不创建 Release。

### 构建

```bash
pnpm install --frozen-lockfile
pnpm verify
pnpm build
```

`pnpm build` 先执行 `data:sync`，再运行 `vue-tsc` 与 Vite，输出到 `apps/web/dist/`。部署子路径时：

```bash
VITE_BASE=/shuangpin-next/ pnpm build
```

### 运行时数据

构建链路：`data/` → `apps/web/public/data/`（`data:sync`，紧凑 JSON）→ `apps/web/dist/data/`（Vite 拷贝 `public/`）。

`dist/data/` 只包含 4 类文件，共 26 个、约 1.7 MiB：

```text
dist/data/
  index.json              方案索引
  schemes/<id>.json       19 套方案
  curriculum/<id>.json    5 套定制课程
  lexicon/lexicon.json    词表（文本 + 词频）
```

pinyin-pro 是 Web 运行时依赖（动态 import，独立 chunk）；构建期脚本与测试也用它解析拼音。

### 静态包

```bash
VITE_BASE=./ VITE_ROUTER_MODE=hash pnpm build
cp scripts/static-package-server.py apps/web/dist/start.py
cp LICENSE apps/web/dist/LICENSE
```

Windows PowerShell：

```powershell
$env:VITE_BASE = './'
$env:VITE_ROUTER_MODE = 'hash'
pnpm build
```

打包：

```bash
cd apps/web/dist
zip -qr ../../../release/shuangpin-next-<版本>-static.zip .
cd ../../../release
sha256sum shuangpin-next-<版本>-static.zip > SHA256SUMS
```

包内包含 `index.html`、`assets/`、`data/`、`start.py`、`LICENSE`、`使用说明.txt`。`start.py` 打印地址并打开浏览器，支持 `--port` / `--no-browser` / `--root`；不要直接双击 `index.html`，浏览器会阻止本地页面读取同目录 JSON。

### CI

- `verify.yml`：推送 `main` 或 PR 时运行 `pnpm verify`；
- `release-static.yml`：推送 `v*` tag 或手动触发；`pnpm verify` 后以静态包配置构建，附加 `LICENSE`、`start.py`、`使用说明.txt`，生成 ZIP / `SHA256SUMS`；tag 触发时创建 GitHub Release；
- `deploy-pages.yml`：推送 `v*` tag 或手动触发；以 `VITE_BASE=/shuangpin-next/` 构建，复制 `index.html` 为 `404.html`，发布到 `gh-pages`；在线地址 <https://quxile.github.io/shuangpin-next/>。

## 发布流程

1. `pnpm verify` 全绿；
2. 确认版本号与 tag 一致（如 `1.5.1` ↔ `v1.5.1`）；
3. 打 tag 并推送：

   ```bash
   git tag v1.5.1
   git push origin v1.5.1
   ```

4. 观察 `release-static` 与 `deploy-pages`；下载 ZIP 自测数据加载、`#/training` 与 `#/practice/<lessonId>` 路由、断网可用、`LICENSE` / `使用说明.txt` / `SHA256SUMS` 齐全。
