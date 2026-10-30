# 双拼 NEXT

> 版本 1.0.0 · 在线预览：https://quxile.github.io/shuangpin-next/

面向全拼熟练者的结构化双拼学习应用：从认识双拼开始，一课只引入一个键位主题，经过单字、词语、复习与考核，最后进入混合训练与通关考核；另附自由训练场。

![学习地图](docs/assets/impl/map-1440.png)

## 快速开始

要求 Node.js ≥ 24。

```bash
pnpm install
pnpm dev            # http://127.0.0.1:5199/
pnpm verify         # typecheck + 测试 + 构建 + 数据校验
pnpm validate       # 单独做数据版本链 / 同步 / 规模校验
```

## 主要能力

- **40 课 / 10 章**：认识双拼 → 声母与零声母 → a/o 家族 → 期中检验 → e/i/u·ü 家族 → 综合冲刺 → 通关考核；27 节新授课、11 节复习、1 节通关考核。
- **三阶段练习**：新课为单字 10 → 半遮挡词 10 → 全遮挡考核 20；复习 40 词、通关 80 词，每课最后都是全遮挡考核。
- **星级规则**：仅 ★/★★/★★★ 三档，1★ 即最低通过；正确率、速度门槛由 `packages/core` 单一实现。
- **教学页**：示例按焦点音节全量生成；记忆锚点与技巧文案自动整理，范围容器固定、可滚动。
- **训练场**：专项练习（字/词、声母韵母自由组合、零声母逐项选择、无尽练习）与文章练习（输入/导入 .txt、按标点断行、每行最多 5 字）。
- **5 套完整课程**（小鹤、自然码、微软、搜狗、智能 ABC），19 套方案键位数据。
- 纯前端静态数据；进度、主题与解锁状态保存在 localStorage。

## 项目结构

```text
apps/web/           Vue 3 + TypeScript + Vite 前端
packages/core/      纯 TS 领域层：拼音、方案引擎、选词、会话、评分
data/               方案 / 课程 / 词池 / 词表 / 训练库
scripts/            数据管线、同步与全局校验
docs/               架构说明与词库审计
```

## 数据重建

```bash
pnpm data:words        # 词表 + 记忆锚点
pnpm data:curriculum   # 5 套课程
pnpm data:pools        # 40 课词池
pnpm data:sync         # 同步到 apps/web/public/data/ + manifest
pnpm validate          # 版本链 / 同步 / 规模 / 文档入口校验
```

首次生成词表需要 `data/raw/jieba-dict.txt`（缺失时脚本自动下载）与 `scripts/word-pipeline` 的依赖：

```bash
cd scripts/word-pipeline && npm install && cd ../..
```

## 文档

- [架构与实现说明](docs/ARCHITECTURE.md)
- [词库审计](docs/WORDS.md)

## 来源与许可

- 参考项目：[BlueSky-07/Shuang](https://github.com/BlueSky-07/Shuang)（GPL-3.0）：仅键位映射作为事实来源，未复制实现代码。
- 词表/词频：[jieba](https://github.com/fxsjy/jieba)（MIT）。
- 拼音转换：[pinyin-pro](https://github.com/zh-lx/pinyin-pro)（MIT），仅构建期使用。
