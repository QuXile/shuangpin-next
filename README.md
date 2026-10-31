# 双拼 NEXT

> 版本 1.0.0 · 在线体验：https://quxile.github.io/shuangpin-next/

给已经会用全拼、想学会双拼的人。

一个把「学键位 → 练单字 → 练词语 → 无提示考核」串成一条线的双拼练习应用。课程之外还有自由练习场，支持 5 种双拼方案、亮/暗主题和完整键盘快捷键。

## 它解决什么问题

双拼要记的键位很多。大多数教程一次把一整张键位表推给你，结果就是：

- 一开始觉得信息量太大，背不下来；
- 勉强背了，却不知道该练什么，练两下就放弃；
- 练习题固定不变，做着做着变成背题；
- 学到后面忘了前面，越学越乱。

双拼 NEXT 把这些问题拆开处理：

- **一次只学一个键位，学过内容自动变成复习**。每一课只引入一个新声母或韵母；每次出的题都只包含已经学过的内容，刚学完就能立刻开始打，不会因为没学过而卡住，也不需要先背完整张表。到了后面的课程，前面学过的键位会自然出现在新练习里，边学新键边复习旧键，不必单独回头“补课”。
- **每一课都随机出题**。同样的知识点，每次练习到的字词都不一样，避免记住某几道题。
- **用日常词汇练真实打字**。练习词汇来自日常常用词：新课每课约 500 词，复习/考核每课约 1000 词，40 课合计约 2.6 万条；另补充三字词、四字成语与五字词，既能反复练习而不容易撞题，也更接近日常打字时会用到的表达。
- **先单字，再词语，最后不看提示考核**。新课先用手把手的方式熟悉键位，再用常用词模拟日常打字，最后把提示全部藏起来检验真实水平。
- **打错不会卡死，也不会让你蒙混过去**。打错会保留输入并提醒；可以逐键退回，也可以一次清空重来。一个词错三次，会直接显示答案，保证继续练得下去。
- **每课都有清楚的评分**。按正确率和速度给出 1 到 3 星，1 星就是最低通过标准，知道自己练到什么程度。
- **可以全程不碰鼠标**。`?` 打开完整快捷键面板，`Ctrl+K` 显示 / 隐藏底部键位图，`Alt+1–5` 切换双拼方案；常用操作旁都直接标出快捷键。
- **随时切换亮 / 暗主题**。跟随系统，或手动选择适合当前光线的主题。

## 界面一览

### 学习路线

课程地图、继续学习、键位图与学习进度集中在一屏；支持 5 种双拼方案，方案按钮直接标出 `Alt+数字` 快捷键。

![学习路线主界面：课程地图、继续学习、键位图与学习进度](docs/assets/impl/main-overview.png)

### 课程详情

每一课先看键位讲解和课程范围，再进入单字、词语和无提示考核；右侧示例与评分标准随时可查。

![课程详情：键位讲解、课程范围、示例与评分标准](docs/assets/impl/tutorial-1440.png)

### 练习

练习场支持专项练习、文章练习和提示隐藏；练习时可以用 `Ctrl+K` 随时唤出键位图，输入时键位会实时高亮。

![练习场：词语半遮挡练习与实时键位提示](docs/assets/impl/word-practice.png)

## 使用方法

### 在线使用

直接访问 https://quxile.github.io/shuangpin-next/ 即可，无需安装任何依赖。

支持现代 Chrome、Edge、Firefox、Safari。学习进度、主题和课程解锁状态都保存在浏览器本地。

### 下载静态包

在 [GitHub Releases](https://github.com/QuXile/shuangpin-next/releases) 下载 `shuangpin-next-<版本>-static.zip`，解压后选择一个静态文件服务器启动即可：

**Python 3 方式**（只要安装了 Python 3，无需 Node.js）：

```bash
cd shuangpin-next-*-static
python -m http.server 8080
```

然后打开 http://localhost:8080/。

**Node.js 方式**（已安装 Node.js 18+）：

```bash
cd shuangpin-next-*-static
npx serve .
```

静态包启动后不依赖网络，也不依赖 Node.js / Python 运行时；只需要一个能够把目录作为静态网站提供的服务器。

> 请不要直接双击 `index.html`。浏览器的 `file://` 安全策略会阻止应用读取同目录下的 JSON 数据，这是浏览器限制，不是包损坏。

静态包使用 hash 路由（地址栏会出现 `#/training` 等），因此不需要服务器配置 SPA 重写规则，直接放在任意静态目录下即可访问。

## 学习路线

40 课，分 10 章，大约 5 个半小时的正式课程：

1. 认识双拼
2. 声母与零声母
3. a 家族
4. o 家族
5. 期中检验
6. e 家族
7. i 家族
8. u 与 ü 家族
9. 综合冲刺
10. 通关考核

前半程在教新键位，中间安排复习和速度练习，最后用混合内容检验是否真的能在日常文字中用出来。

## 练习场

课程之外，还有一个可以自己支配的练习场：

- **专项练习**：自己选想练的声母、韵母或零声母音节，只练这些内容，一直练到主动退出。
- **提示隐藏**：可以挑一些键位在练习时隐藏提示，逼自己回忆，而不是照着键帽打。
- **文章练习**：粘贴一篇文章或导入文本文件，按原文顺序逐字练习；标点自动断行，每行最多五个字，练完给出正确率和速度。

## 支持哪些双拼方案

- 小鹤双拼
- 自然码
- 微软双拼
- 搜狗双拼
- 智能 ABC 双拼

## 适合谁

- 会全拼，想学双拼但一直被键位表劝退的人；
- 学过双拼，但长期不用、想重新捡起来的人；
- 想找一个能每天练十分钟、有明确进度和反馈的练习工具的人。

不需要注册账号。学习进度、主题和课程解锁状态都保存在你自己的浏览器里。

## 开发指南

### 环境依赖

| 用途 | 依赖 |
|---|---|
| 安装、运行、构建源码 | **Node.js >= 24**、**pnpm 11.28.5** |
| 启动下载后的静态包 | Python 3，或任意静态文件服务器；不需要 Node.js |
| 打包 ZIP | GitHub Actions 已内置 `zip`；本地打包需系统 `zip` / 7-Zip |
| 重新生成词库 | 可选，需要 `data/raw/jieba-dict.txt`（CI 会自动下载） |

项目根 `package.json` 已声明 `engines.node >= 24` 和 `packageManager: pnpm@11.28.5`。推荐通过 Corepack 启用对应 pnpm：

```bash
corepack enable
pnpm --version   # 11.28.5
```

### 安装与开发

```bash
pnpm install --frozen-lockfile
pnpm dev          # http://127.0.0.1:5199
```

首次启动会自动执行 `pnpm data:sync`，把根目录 `data/` 同步到 `apps/web/public/data/`（生成物已加入 .gitignore）。

常用命令：

```bash
pnpm build        # 生产构建（默认 history 路由，用于 GitHub Pages）
pnpm preview      # 预览构建结果
pnpm test         # core + web 测试
pnpm typecheck    # TypeScript / Vue 类型检查
pnpm lint:ui      # UI 约定检查
pnpm verify       # 完整校验：typecheck + UI + 数据同步 + 测试 + 构建 + validate
```

### 构建可下载静态包

静态包使用相对资源路径和 hash 路由，因此可以放到任意静态目录：

```bash
VITE_BASE=./ VITE_ROUTER_MODE=hash pnpm build
```

把 `apps/web/dist/` 打包，并保留 `LICENSE` 与使用说明。Windows PowerShell 下设置环境变量的写法：

```powershell
$env:VITE_BASE = './'
$env:VITE_ROUTER_MODE = 'hash'
pnpm build
```

推送形如 `v1.0.0` 的 tag 会触发 [release-static.yml](.github/workflows/release-static.yml)：

```bash
git tag v1.0.0
git push origin v1.0.0
```

工作流会先运行 `pnpm verify`，再生成 `shuangpin-next-<版本>-static.zip`、`SHA256SUMS`，上传到 GitHub Release。发布包内包含 `LICENSE` 和 `使用说明.txt`。

### 项目结构

```text
apps/web/          Vue 3 + Vite 前端
packages/core/     双拼领域逻辑、出题/判分/会话状态机
data/              课程、方案、词库源数据
scripts/           数据构建、同步和校验脚本
docs/             架构说明与界面截图
```

更多实现细节见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，词库生成流程见 [docs/WORDS.md](docs/WORDS.md)。

## 更多

- [实现说明](docs/ARCHITECTURE.md)
- [词库说明](docs/WORDS.md)

## 许可证

本项目采用 **GNU General Public License v3.0（GPL-3.0-only）** 授权；完整文本见 [LICENSE](LICENSE)。

Copyright (C) 2026 QuXile。你可以自由使用、修改和分发本项目，分发衍生作品时需要遵守 GPL-3.0 的开源与声明要求。

## 来源与第三方许可

第三方来源与许可如下：

- 键位数据参考 [BlueSky-07/Shuang](https://github.com/BlueSky-07/Shuang)（GPL-3.0），仅使用其键位映射作为事实来源。
- 词表和词频来自 [jieba](https://github.com/fxsjy/jieba)（MIT）。
- 拼音转换使用 [pinyin-pro](https://github.com/zh-lx/pinyin-pro)（MIT），仅在生成数据时使用。
