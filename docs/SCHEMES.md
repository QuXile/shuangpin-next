# 适配新方案

[← 文档导航](../README.md#文档导航)

本文说明如何新增一套双拼方案，以及如何正确填写推荐码与兼容编码。

## 目录结构

一套方案一个文件夹：

```text
data/schemes/
  index.json                 方案索引
  curriculum-index.json      课程索引
  engine-cases.json          全部方案的判题用例
  xiaohe/
    scheme.json              键位、推荐码、兼容编码
    curriculum.json          课程（19 套方案均有）
  c/
    scheme.json
  ...
```

运行时方案包由脚本生成到 `apps/web/public/data/packages/`；不要编辑生成物，也不要在 `data/` 下保留第二份方案包。

## SchemeDef

```json
{
  "id": "scheme-id",
  "name": "方案名",
  "type": "compositional",
  "initials": { "zh": ["o", "v"] },
  "finals": { "uang": ["z"], "uo": ["p", "b"] },
  "zeroInitial": { "a": ["ah"] },
  "recommended": { "zhu": "of" },
  "compatCodes": { "zhu": ["vf"] },
  "umlautNote": "可选",
  "sameKeyGroups": [],
  "source": {},
  "notes": []
}
```

- `initials` / `finals`：声母、韵母对应的一个或多个键；
- `zeroInitial`：零声母的完整键序列；
- `recommended`：**仅多码音节需要**的推荐/标答键序列；
- `compatCodes`：**只保存不能由声母/韵母组合出来的兼容序列**；
- `sameKeyGroups`：键位图/说明元数据，不参与判题。

## 判题规则

```text
accepted = recommended ∪ compatCodes ∪ (initials × finals)
primary = recommended ?? compatCodes[0] ?? composition[0]
```

- 课程 Hero、入门试打与练习场都接受全部 accepted；显示键帽仍使用 `primary`；
- 练习场接受全部 accepted；
- 推荐码不显示在兼容编码 UI；
- 兼容编码是额外接受，不会禁用基础组合。

## recommended 与 compatCodes

### 什么时候必须写 recommended

只要同一个音节有多于一种合法编码，就必须写推荐码，即使多码只是由多个声母键/韵母键造成：

```text
ch = U / ;
ua = A / M
=> chua 有 UA / UM / ;A / ;M 四种组合
```

此时：

```json
"recommended": { "chua": "ua" }
```

`UA` 是标答；`UM / ;A / ;M` 由声母/韵母组合回退接受，不写入 `compatCodes`。

没有多码的音节不需要推荐码；没有多码的方案不需要 `recommended` / `compatCodes`。

### 什么时候写 compatCodes

只把**无法由声母/韵母组合得到**的序列写入 `compatCodes`：

```json
"recommended": { "zhu": "of" },
"compatCodes": { "zhu": ["vf"] }
```

- `OF` 是推荐码/标答；
- `VF` 是真正的兼容编码；
- `OU`、`VU` 是 `zh × u` 的组合结果，只由组合回退接受，不进入兼容编码表。

`dun` 同理：

```json
"recommended": { "dun": "dc" },
"compatCodes": { "dun": ["d;"] }
```

`DC` 来自组合但仍保留在 recommended 中，因为它必须是标答；`D;` 才是不能由组合得到、需要写入兼容表的编码。

## ü 与 u/v

### 标准拼音

- `j/q/x/y` 后的 ü 标准写作 `u`：
  - `ju / jue / juan / jun`
  - `qu / que / quan / qun`
  - `xu / xue / xuan / xun`
  - `yu / yue / yuan / yun`
- `n/l` 后的 ü 保留：
  - `nü / lü`，键盘输入常用 `nv / lv`
  - `nüe / lüe`，键盘输入常用 `nve / lve`
- `jve / jvan / jvn` 不是标准拼音拼写。

### 输入法兼容

Rime 的小鹤、自然码、微软、智能 ABC schema 都有：

```yaml
derive/^([jqxy])u$/$1v/
```

它只为**单独的 `ju/qu/xu/yu`** 增加 `jv/qv/xv/yv` 别名，并保留原拼写；不会生成 `jve/jvan/jvn`。

因此：

```text
ju   → ju（标准）/ jv（兼容）
jue  → jue 标准；是否接受 jv 取决于该方案 ue 是否映射到 V 键
juan → juan 标准
jun  → jun 标准
```

`j/q/x/y + u` 的 V 键兼容码写入各方案的 `compatCodes`（如 `ju → jv`），键位图会显示；核心引擎只读取方案数据。

例如：

- 小鹤、自然码：`ju` 标答，`jv` 由数据 `compatCodes` 兼容接受；`jue` 只有 `jt`；
- 微软：`ju` 标答，`jy` 兼容；`ue=[t,v]`，所以 `jue` 可 `jt/jv`；
- 智能 ABC：`ju` 标答，`jv` 兼容；`ue=[m,v]`，所以 `jue` 可 `jm/jv`。

参考：

- [汉语拼音方案](https://zh.wiktionary.org/wiki/Appendix:%E6%B1%89%E8%AF%AD%E6%8B%BC%E9%9F%B3%E6%96%B9%E6%A1%88)
- [Rime 小鹤双拼](https://github.com/rime/rime-double-pinyin/blob/master/double_pinyin_flypy.schema.yaml)
- [Rime 自然码](https://github.com/rime/rime-double-pinyin/blob/master/double_pinyin.schema.yaml)
- [Rime 微软双拼](https://github.com/rime/rime-double-pinyin/blob/master/double_pinyin_mspy.schema.yaml)
- [Rime 智能 ABC](https://github.com/rime/rime-double-pinyin/blob/master/double_pinyin_abc.schema.yaml)

## 新增方案

1. 新建 `data/schemes/<id>/scheme.json`；
2. 在 `data/schemes/index.json` 注册方案；
3. 在 `data/schemes/engine-cases.json` 增加正例 / 反例；
4. 多码音节补 `recommended`；真正无法由组合得到的序列补 `compatCodes`；
5. 运行：

```bash
pnpm data:packages
pnpm data:sync
pnpm validate
```

6. 课程推荐用 `pnpm data:curriculum` 生成通用课程，或手写自有路线；不要伪造 curriculum。
7. 新增方案默认由生成器接入通用课程。

## 验收清单

- 方案能构造 engine；
- 所有多码音节都有 `recommended`；
- `compatCodes` 只包含无法由声母/韵母组合出来的序列；
- `recommended` 是 primary；
- engine-cases 正例全过、反例全拒绝；
- 练习场范围过滤正常；
- `pnpm verify` 通过；
- 文档中的目录、字段名与数据一致。

## 当前数据状态

- 19 套方案；
- 18 套存在多码音节，均有 recommended；
- C 与 大牛存在真正的兼容编码（C 32 组、大牛 12 组）；
- 小鹤等方案的多码来自声母/韵母或 ü 兼容码，兼容编码行只显示数据中的 compatCodes；
- C 的 `chua` 只有声韵组合多解，不进入兼容表；
- C 的 `zhu`：`OF` 推荐，`VF` 兼容；`OU/VU` 为组合；
- C 的 `dun`：`DC` 推荐，`D;` 兼容；
- `yunbiaokuaipin` 没有多码，不需要 recommended/compatCodes。

## 相关文件

- [数据说明](DATA.md)
- [架构说明](ARCHITECTURE.md)
- [练习场](TRAINING.md)
