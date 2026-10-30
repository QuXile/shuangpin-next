# 词库审计（WORDS）

当前词库与词池的数据快照、质量指标与口径说明。

- 统计脚本：`node scripts/word-pipeline/audit-words.mjs`（只读，输出 JSON）
- 口径文件：`data/words/word-policy.json`（build / build-pools / validate 共用）
- 校验入口：`node scripts/validate-all.mjs`

## 1. 数据规模与版本

| 数据 | 规模 | 版本 |
|---|---|---|
| 基础词表 `data/words/words.sample.json` | 8,000 词 | `words-fed4e16a8e5b` |
| 记忆锚点 `data/words/anchors.json` | 音节 406 / 韵母 34 / 声母 23 | 随词表构建 |
| 音节补丁 `data/words/syllable-patches.json` | 2 条（zhei→这、eng→鞥） | 数据文件 |
| 词库口径 `data/words/word-policy.json` | 词性 / 儿化 / 规模 / 质量阈值 | 数据文件 |
| 课程 | 5 套 × 40 课 / 10 章 / 326 分钟 | 模板 1.0.0，xiaohe `curriculum-ccbddb388b0a` |
| 词池 | 40 课 / 20,000 条 / 19,302 唯一词 | `pools-bd34aa65678b` |
| 训练库 | 2,161 字 / 8,000 词 | `training-f914efc941c2` |

## 2. 全局 8,000 词表特征

| 指标 | 数值 | 说明 |
|---|---|---|
| 长度分布 | 2 字 7,144 / 3 字 688 / 4 字 168 | 2 字占 89.3% |
| 词频范围 | jieba 词频 top 8000 | 全部带全局 `freqRank` |
| 轻声（tone 5） | 199 个音节 / 199 词（词数 2.5%） | |
| 多音字标记 | 127 词（1.6%） | 词条 `polyphone` 字段 |
| 生僻字（minCharRank>2000） | 1,146 词（14.3%） | p90=2381、p99=5095、max=10,617 |
| 极生僻字（minCharRank>4000） | 179 词（2.2%） | 词池质量过滤按 policy 使用 |
| 词性/专名 | nr 322、nz 100、nrt 20、nrfg 7、ns 433、nt 40 | 词池构建已屏蔽 nr/nz/x/ns/nt/nrt/nrfg |
| 非汉字/重复 | 0 / 0 | CJK-only、词条唯一 |

## 3. 词池特征（40 课 × 500 条）

- 每课词数 **500**；单字池 40–52 字；词池共 20,000 条；唯一词 **19,302**。
- 跨课重复：出现 698 次（**3.5%**），694 个词跨 ≥2 课；最高重复 3 池（而且 / 旅游 / 按照 / 安全）。
- 专名/地名：blocked POS 条目 **0**（intro 试打词「双拼」按策略保留）。
- 单字池多音字：**0** 条被判定为多音风险（按 8,000 词上下文统计读音集合）。
- 示例代表字：2,319 张；
  - rank>2000 共 172 张；rank>4000 共 45 张；缺 jieba 单字排名 9 张（补丁字「鞥」）；
  - 生僻占比 **2.3%**（阈值 3%）；**可避免生僻 0**；
  - 剩余生僻均来自天然无常用字的音节：chua(欻)、ei(诶)、dia(嗲)、kei(尅)、den(扥)、miu(谬)、nve(虐)。
- 池条目 minCharRank>2000 共 3,320（16.6%）、>4000 共 33。
- 稀有韵母课词池仍为 500 词，示例音节数天然较小：L8.3（ue/ve/v）8 张、L3.6（ia/ua）11、L3.9（iang/uang）11、L4.3（ong/iong）17；综合/通关课 336 张。

## 4. 词库口径

- 词性过滤：`word-policy.pools.blockedPosTags = nr/nz/x/ns/nt/nrt/nrfg`（intro 试打词例外）。
- 单字池多音字：第一轮只收上下文单读音字，不足最小规模时再回退。
- 复习/考核池：按全局词使用计数，在质量分层内优先低使用词。
- 示例代表字：优先 `minCharRank ≤ 4000`；无常用候选时按 anchors 顺序回退。
- 校验阈值由 `validate-all.mjs` 统一断言（生僻示例占比 ≤3%、可避免生僻 0、跨课重复 ≤20% 等）。

## 5. 复现

```bash
node scripts/word-pipeline/audit-words.mjs   # 只读统计
node scripts/validate-all.mjs                # 数据契约与质量校验
pnpm --filter @shuangpin/core test           # core 数据契约测试
```
