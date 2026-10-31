# 使用说明

[← 文档导航](../README.md#文档导航)

## 在线使用

直接访问 <https://quxile.github.io/shuangpin-next/>，无需安装或注册。支持现代 Chrome、Edge、Firefox、Safari 桌面版；浏览器过旧时部分选中态 / 主题效果可能缺失。

## 本地数据

主题、当前方案、学习进度（按方案分开）、解锁标记、音效开关、练习场配置都只保存在浏览器 `localStorage`；学习地图滚动位置保存在 `sessionStorage`。不会上传到服务器。清除站点数据、换浏览器、无痕模式都会导致这些内容不可用。

## 下载静态包（离线使用）

在 [GitHub Releases](https://github.com/QuXile/shuangpin-next/releases) 下载 `shuangpin-next-<版本>-static.zip`，解压后**不要双击 `index.html`**，用包内启动器：

```bash
cd shuangpin-next-*-static
python start.py
```

启动器会打印本地地址、数据目录与停止方式，并自动打开浏览器；只需要 Python 3，无需第三方包或 Node.js。可选参数：

```bash
python start.py --port 8080     # 指定端口（默认 8080，占用时向后尝试）
python start.py --no-browser    # 不自动打开浏览器
python start.py --root <目录>   # 指定静态目录（默认 start.py 所在目录）
```

也可用任意静态文件服务器（如 `python -m http.server 8080`、`npx serve .`），然后访问终端显示的 `http://127.0.0.1:<端口>/`。

静态包使用 hash 路由（地址栏有 `#/training` 等），不依赖 SPA 重写，可放在任意子目录，也不连接外网。包内包含 `LICENSE` 与 `使用说明.txt`，发布页另附 `SHA256SUMS`。更新静态包时整个目录替换即可。

## 常见问题

**打开后提示「数据加载失败」**
多为直接双击 `index.html` 导致浏览器禁止读取同目录 JSON。请用 `python start.py` 或任意静态服务器，并确认解压完整（`data/` 目录存在）。

**静态包地址为什么有 `#`？**
静态包使用 hash 路由，避免依赖服务器 SPA 回退；在线站点使用普通路径。

**学习进度丢了 / 换方案后进度不见了**
进度按方案保存在浏览器本地，切换方案会加载对应进度；清除站点数据、无痕模式或换设备都会导致原进度不可见。

**音效没有声音**
浏览器要求先与页面交互才能播放音频；检查顶栏喇叭按钮或 `Alt+B` 是否关闭、系统音量与站点静音即可。

**在手机上能用吗？**
移动端可浏览和操作界面，练习主要按物理键盘设计（底部键位图可点击输入），推荐桌面浏览器。

**支持哪些方案？**
应用自带 19 套双拼方案，与系统输入法无关；只想自由练习时可用练习场。
