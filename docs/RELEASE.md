# 发布说明

[← 文档导航](../README.md#文档导航)

## 版本与产物

- 版本以根 `package.json` 的 `version` 为准（当前 `1.1.0`），许可证 GPL-3.0-only。
- 发布产物为静态包 ZIP `shuangpin-next-<版本>-static.zip`，另附 `SHA256SUMS`。
- 手动触发工作流时版本记为 `dev-<commit 前 7 位>`，只上传 Actions 产物，不创建 Release。

## 构建

```bash
pnpm install --frozen-lockfile
pnpm verify   # 推荐；CI 会执行
pnpm build
```

构建先同步数据（内部重建方案包），再执行 `vue-tsc` 与 Vite 生产构建，输出到 `apps/web/dist/`。部署在子路径时注入 base：

```bash
VITE_BASE=/shuangpin-next/ pnpm build
```

## 静态包构建

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

包内应包含 `index.html`、`assets/`、`data/`、`start.py`、`LICENSE`、`使用说明.txt`。`start.py` 打印地址、数据目录与停止方式并自动打开浏览器，支持 `--port` / `--no-browser` / `--root`。不要单独分发或双击 `index.html`，浏览器会阻止本地页面读取同目录 JSON。

## CI 工作流

- **`verify.yml`**：推送 `main` 或 PR 时触发；安装依赖、下载构建期 jieba 词典后运行 `pnpm verify`。
- **`release-static.yml`**：推送 `v*` tag 或手动触发；运行 `pnpm verify` 后以 `VITE_BASE=./ VITE_ROUTER_MODE=hash` 构建静态包，附加 `LICENSE`、`start.py`、`使用说明.txt`，生成 ZIP 与 `SHA256SUMS`，上传 Actions artifact，tag 触发时创建 GitHub Release。
- **`deploy-pages.yml`**：推送 `v*` tag 或手动触发；以 `VITE_BASE=/shuangpin-next/` 构建，复制 `index.html` 为 `404.html` 作为 SPA 回退，用 `peaceiris/actions-gh-pages` 发布到 `gh-pages`。在线地址 <https://quxile.github.io/shuangpin-next/>。

## 发布流程

1. `pnpm verify` 全绿；如改过 UI，重新导出[界面截图](SCREENSHOTS.md)。
2. 确认根 `package.json` 的版本与要打的 tag 一致（如 `1.1.0` ↔ `v1.1.0`）。
3. 打 tag 并推送：

   ```bash
   git tag v1.1.0
   git push origin v1.1.0
   ```

4. 观察 `release-static` 与 `deploy-pages` 工作流；下载 ZIP 自测：数据加载、`#/training` 与 `#/practice/<lessonId>` 路由、断网可用、`LICENSE` / `使用说明.txt` / `SHA256SUMS` 齐全。
