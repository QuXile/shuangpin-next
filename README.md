# 双拼 NEXT

> 版本 1.3.5 · 在线体验：<https://quxile.github.io/shuangpin-next/>

给已经会用全拼、想学会双拼的人：把「学键位 → 练单字 → 练词语 → 无提示考核」串成一条线，课程之外还有自由练习场和文章练习。

欢迎在 GitHub 上 **Star** 本项目，也欢迎通过 Issues 提出建议：<https://github.com/QuXile/shuangpin-next>。

## 特点

- **19 套双拼方案**：5 套带完整课程，其余 14 套可直接进入练习场；覆盖主流方案及 C、键道、大牛等特色方案。
- **自由练习**：可按声母 / 韵母 / 零声母组合范围，支持字、词、文章三种练习。
- **易于扩展**：新增方案可复用键位图、练习场和课程。
- **纯前端、无账号**：进度和设置只保存在浏览器本地，也提供可离线使用的静态包。

## 结构化学习路线

当前五套课程按「入门 → 新课 → 复习 → 期中 / 综合 → 通关」推进；每课按「单字全显 → 词语半遮挡 → 全遮挡考核」进行，最后一场始终隐藏提示。

- 每课只引入一个新的声母或韵母，题目只包含已学内容；
- 同样的知识点每次随机出题，避免背答案；
- 练习模拟日常词汇输入，内置 25000+ 离线词库，题量够大。

课型、阶段和星级规则见[学习指南](docs/LEARNING.md)。

## 19 套双拼方案

| 类型 | 方案 |
|---|---|
| 带完整课程（5） | 小鹤双拼（默认）、自然码、微软双拼、搜狗双拼、智能 ABC |
| 仅支持练习（14） | 拼音加加、紫光双拼、蓝天双拼、白云双拼、小月双拼、国标双拼、开源小鹳、小浪双拼、韵标块拼、星空双拼、大牛双拼、键道双拼 3、键道双拼 6、C 双拼 |

方案数据、推荐码与兼容编码的适配方式见[适配新方案](docs/SCHEMES.md)。

## 核心功能

- **学习路线地图**：继续学习、键位图、进度和章节路线集中展示；
- **三档提示**：分为三档逐步移除提示，循序渐进；
- **自由练习场**：专项范围组合、字 / 词模式、文章粘贴或 `.txt` 导入；
- **键位图与兼容编码**：课程、练习场和页面底部共用键位图，兼容编码按真实规则展示；
- **亮 / 暗主题、合成音效、完整快捷键**：随时切换，练习中可用键盘完成主要操作。

## 快速开始

- **在线使用**：<https://quxile.github.io/shuangpin-next/>，无需安装。
- **离线静态包**：从 [GitHub Releases](https://github.com/QuXile/shuangpin-next/releases) 下载 `shuangpin-next-<版本>-static.zip`，解压后运行 `python start.py`，详见[使用说明](docs/USAGE.md)。
- **本地开发**（Node.js ≥ 24、pnpm 11.28.5）：

  ```bash
  pnpm install --frozen-lockfile
  pnpm dev        # http://127.0.0.1:5199
  ```

## 文档导航

| 文档 | 内容 |
|---|---|
| [学习指南](docs/LEARNING.md) | 课型、阶段、星级、入门课、进度解锁 |
| [练习场](docs/TRAINING.md) | 专项 / 文章练习、范围与设置 |
| [快捷键](docs/SHORTCUTS.md) | 全局与各页面快捷键 |
| [使用说明](docs/USAGE.md) | 在线使用、静态包、本地数据与常见问题 |
| [界面与设计](docs/UI.md) | 布局、设计 token、共享原语、键位图与键帽 |
| [界面截图](docs/SCREENSHOTS.md) | 主要界面截图 |
| [架构说明](docs/ARCHITECTURE.md) | 领域层、选词与评分、Web 层与数据契约 |
| [数据说明](docs/DATA.md) | 方案 / 课程 / 统一词表数据与校验 |
| [适配新方案](docs/SCHEMES.md) | 新增方案、推荐码与兼容编码规则 |
| [发布说明](docs/RELEASE.md) | 构建、静态包与 GitHub Actions |
| [贡献指南](docs/CONTRIBUTING.md) | 开发环境、命令与提交前检查 |

## 已知限制

- **只支持纯双拼，不支持音形方案**：当前编码模型只有「声母 + 韵母」两层，没有汉字形码表、字根/拆字规则、形码取码和完整编码组合逻辑。音形、形码辅助、候选窗和系统级输入法均未接入，`scheme.json` 不能直接表达这类方案。
- **多音字不做上下文消歧**：练习词表中的字按词库读音取键，同一个字在不同词语中的特殊读音不会单独推断。
- **进度仅保存在浏览器本地**：没有账号和云同步；清除站点数据、换浏览器或换设备后进度不会自动迁移。

## 许可证

本项目采用 **GNU General Public License v3.0（GPL-3.0-only）** 授权，完整文本见 [LICENSE](LICENSE)。Copyright (C) 2026 QuXile。

## 来源与第三方许可

- 双拼键位规则来自 [fcitx/libime](https://github.com/fcitx/libime) 与 [fcitx5-chinese-addons](https://github.com/fcitx/fcitx5-chinese-addons)（LGPL-2.1-or-later）：libime 内建规则 `Xiaohe`、`Ziranma`、`MS`、`ABC`、`PinyinJiaJia`、`Ziguang`、`GB` 分别对应小鹤、自然码、微软、智能 ABC、拼音加加、紫光、国标；C 双拼使用 fcitx5-chinese-addons 的 `sp.dat` 示例。
- fcitx 无对应规则的搜狗、蓝天、白云、小月、开源小鹳、小浪、韵标块拼、星空、大牛、键道双拼 3、键道双拼 6 来自 [BlueSky-07/Shuang](https://github.com/BlueSky-07/Shuang)（GPL-3.0）；推荐码 / 兼容编码补充数据同样参考该项目。
- 词表与词频来自 [jieba](https://github.com/fxsjy/jieba)（MIT），拼音转换使用 [pinyin-pro](https://github.com/zh-lx/pinyin-pro)（MIT），二者只用于生成数据。
