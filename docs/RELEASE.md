# 发布说明

[← 文档导航](../README.md#文档导航)

本页说明构建、静态包与 GitHub Actions 发布流程。日常开发与提交前检查见 [贡献指南](CONTRIBUTING.md)，静态包的使用方式见 [使用说明](USAGE.md)。

## 版本与产物

- 项目版本以根 `package.json` 的 `version` 为准（当前 `1.1.0`），许可证为 GPL-3.0-only。
- 发布产物是 **静态包 ZIP**：`shuangpin-next-<版本>-static.zip`，另附 `SHA256SUMS`。
- 手动触发工作流（非 tag）时版本记为 `dev-<commit 前 7 位>`，只上传 Actions 构建产物，不创建 Release。

## 构建

常规构建（在线站点，默认 history 路由）：

```bash
pnpm install --frozen-lockfile
pnpm verify   # 可选但推荐；CI 会执行
pnpm build
```

构建命令会先同步数据（`scripts/sync-data.mjs`，内部重建方案包），再执行 `vue-tsc` 类型检查与 Vite 生产构建，输出到 `apps/web/dist/`。

部署在子路径（如 GitHub Pages 的 `/shuangpin-next/`）时通过环境变量注入 base：

```bash
VITE_BASE=/shuangpin-next/ pnpm build
```

## 静态包构建

静态包使用**相对资源路径 + hash 路由**，可以放在任意静态目录、无需服务器的 SPA 重写规则：

```bash
VITE_BASE=./ VITE_ROUTER_MODE=hash pnpm build
```

然后把启动器、许可证与使用说明放进 `apps/web/dist/`：

```bash
cp scripts/static-package-server.py apps/web/dist/start.py
cp LICENSE apps/web/dist/LICENSE
# 使用说明.txt 的内容见 release-static.yml 中的 heredoc，按版本手动生成即可
```

Windows PowerShell 下设置环境变量：

```powershell
$env:VITE_BASE = './'
$env:VITE_ROUTER_MODE = 'hash'
pnpm build
```

打包 ZIP：

```bash
cd apps/web/dist
zip -qr ../../../release/shuangpin-next-<版本>-static.zip .
cd ../../../release
sha256sum shuangpin-next-<版本>-static.zip > SHA256SUMS
```

**包内应包含**：`index.html`、`assets/`、`data/`（与构建产物同目录的运行时数据）、`start.py`、`LICENSE`、`使用说明.txt`。其中 `start.py` 由 `scripts/static-package-server.py` 复制而来：打印可点击地址、数据目录与停止方式，自动打开浏览器，并支持 `--port` / `--no-browser` / `--root`。

> 不要把 `apps/web/dist/` 里的 `index.html` 单独分发或直接双击打开：浏览器会阻止本地页面读取同目录 JSON，静态包必须通过 `start.py` 或任意静态服务器启动。

## CI 工作流

### `.github/workflows/verify.yml`

- 触发：推送到 `main`、Pull Request；
- 步骤：checkout → pnpm 11.28.5 → Node 24（pnpm 缓存）→ `pnpm install --frozen-lockfile` → 下载构建期 jieba 词典到 `data/raw/` → `pnpm verify`。

`pnpm verify` 包含 typecheck、UI 约定检查、数据同步、测试、构建与 `validate`，任何一步失败都会让 PR 变红。

### `.github/workflows/release-static.yml`

- 触发：推送 `v*` tag，或手动 `workflow_dispatch`；
- 权限：`contents: write`（创建 Release 需要）；
- 步骤：与 `verify.yml` 相同的安装与 jieba 下载 → `pnpm verify` → 解析版本（tag 去掉 `v`，手动触发用 `dev-<sha7>`）→ 以 `VITE_BASE=./ VITE_ROUTER_MODE=hash` 构建 → 复制 `LICENSE` 与 `start.py`、生成 `使用说明.txt` → ZIP → `SHA256SUMS` → 上传 Actions artifact → tag 触发时用 `softprops/action-gh-release` 创建 GitHub Release（自动生成 release notes）。
- Release 附件：ZIP 与 `SHA256SUMS`。

### `.github/workflows/deploy-pages.yml`

- 触发：推送 `v*` tag，或手动 `workflow_dispatch`；
- 权限：`contents: write`（更新 `gh-pages` 分支）；
- 构建：`VITE_BASE=/shuangpin-next/ pnpm build`，随后把 `index.html` 复制为 `404.html` 作为 SPA 回退；
- 发布：用 `peaceiris/actions-gh-pages` 强制孤儿提交到 `gh-pages`，保持 GitHub Pages legacy 分支源不变；
- 在线地址：<https://quxile.github.io/shuangpin-next/>。

## 发布流程

1. **确认代码与文档就绪**：`pnpm verify` 全绿；如改过 UI，按 [界面截图](SCREENSHOTS.md) 重新导出截图并更新说明；
2. **确认版本**：根 `package.json` 的 `version` 与将要打的 tag 一致（如 `1.1.0` ↔ `v1.1.0`）；
3. **打 tag 并推送**：

   ```bash
   git tag v1.1.0
   git push origin v1.1.0
   ```

4. **观察工作流**：`release-static` 应生成 `shuangpin-next-1.1.0-static.zip` 与 `SHA256SUMS` 并创建 Release；
5. **下载自测**：下载 ZIP、解压，运行 `python start.py`，确认首页数据加载正常、`#/training` 与 `#/practice/<lessonId>` 路由可用、无控制台报错、断网仍可用；
6. **核对发布内容**：Release 说明、ZIP 内 `LICENSE` / `使用说明.txt` / `SHA256SUMS` 齐全，SHA256 校验一致；
7. 如需重发，按团队流程处理已发布的 tag 与 Release，并重新校验附件哈希。

## 发布检查清单

- [ ] `pnpm verify` 通过（CI `verify` 工作流为绿）
- [ ] 文档与 README 导航、截图引用通过 `node scripts/validate-all.mjs`
- [ ] 根 `package.json` 版本与 tag 一致
- [ ] 静态包使用 `VITE_BASE=./ VITE_ROUTER_MODE=hash` 构建
- [ ] ZIP 内含 `LICENSE`（GPL-3.0-only）、`使用说明.txt`、`start.py`
- [ ] `SHA256SUMS` 已生成并随 Release 上传
- [ ] 静态包本地启动自测：数据加载、hash 路由、主题 / 音效 / 练习流程正常
- [ ] 第三方来源声明与 [README · 来源与第三方许可](../README.md#来源与第三方许可) 一致

## 许可证

发布包内必须包含 [LICENSE](../LICENSE) 全文（GPL-3.0-only）；第三方来源与许可说明见 [README · 来源与第三方许可](../README.md#来源与第三方许可)。
