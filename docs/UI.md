# 界面与设计

[← 文档导航](../README.md#文档导航)

浅色卡片表面 + 细线条 + 大圆角，紧凑的语义化排版，品牌蓝作为唯一强调色；绿色只用于通过 / 完成态，红色只用于错误 / 未通过态。截图见[界面截图](SCREENSHOTS.md)。

- **只用 token**：组件样式只消费 `styles/tokens.css`，不写裸 `hex` / `rgba`；派生颜色用 `color-mix`。深色主题只覆盖 token，组件内不写主题特判。
- **先共享原语**：面板、标题、分段控件、按钮、徽标、chip、键帽等已有全局类，页面只做布局与少量组合覆盖。
- **统一密度**：控制件高度集中在 26 / 30 / 34 / 42px；卡片圆角 16–20px；正文 13.5px，辅助信息 11–12.5px。

## 布局

| 场景 | 规则 |
|---|---|
| 浏览类页面 | `--page-max` 1440px 居中，`--page-pad-x` 桌面 28 / 移动 14px，`--page-top-gap` 桌面 24 / 移动 12px |
| 顶栏 | 固定顶部，高度 `--topbar-h`（桌面 64 / 移动 54px），内容与页面同宽对齐 |
| 沉浸式练习 | 1080px 居中窄栏；练习会话页面不滚动，内容区独立滚动 |
| 页面骨架 | `App.vue`：固定顶栏 + 路由视图 + 页脚（练习 / 练习场隐藏页脚并锁定视口高度） |

`html` 使用 `overflow-y: scroll` + `scrollbar-gutter: stable`，键位图显隐不会导致横向跳动。

## 设计 token

`styles/tokens.css` 按语义分组，深色主题在 `html[data-theme='dark']` 覆盖：

- 页面骨架：`--topbar-h`、`--page-max`、`--page-pad-x`、`--page-top-gap`、`--hero-keycap-size`
- 表面 / 文字 / 线条：`--bg`、`--surface-2/3`、`--ink-2/3/4`、`--line*`、`--text-xs/sm/base/md`
- 品牌与状态：`--brand-*`、`--success*`、`--danger*`、`--star*`、`--state-success-*`、`--state-danger-*`
- 拼音分色 / 键帽：`--ini`、`--fin`、`--focus-*`、`--cap-*`、`--keycap-*`、`--hero-tint`
- 圆角 / 阴影 / 动效：`--r-control`(9px)、`--r-card`(16px)、`--r-sm`…`--r-xl`、`--shadow-sm/md`、`--dur-*`、`--ease`

品牌色派生（`--brand-line`、`--brand-glow`）与深浅主题适配都在 token 层完成，新增颜色先加 token。

## 共享原语

| 原语 | 用途 |
|---|---|
| `.panel` / `.panel-title` / `.panel-head` / `.eyebrow` | 卡片表面、16px/850 卡标题、卡头行、10px 英文眉题 |
| `.page` / `.state-card` / `.spinner` | 页面容器、加载 / 错误状态卡、加载指示 |
| `.segmented` / `.segmented-btn` / `.segmented--sm` | 分段控件：顶栏导航、练习场页签、字 / 词切换、文章输入 / 导入 |
| `.meta-btn` / `.count-badge` / `.chip` / `.common-capsule` | 卡片小操作、计数徽标、练习范围标签、「全拼沿用」胶囊 |
| `.btn` / `.btn--primary` | 主次按钮，主按钮使用品牌填充与辉光 |
| `kbd` / `.icon` / `.mono` / `.sr-only` / `.thin-scroll` | 快捷键提示、图标、等宽数字、屏读文本、细滚动条 |

## 键位图与键帽

**KeyboardMap** 是课程、练习场与底部 Dock 共用的键位图：

- 三行等宽按键（按单行最多 10 键计算，行内居中）；第三行末尾固定等尺寸「退格」键，所有页面可点击 / 高亮。
- 键帽内显示声母（品牌色）与韵母（橙色）映射，本课 focus 反白 + 底色强调；改造声母可单独标记。
- 无提示模式隐藏全部映射、图例、零声母与兼容编码，只保留按键外观；hover / pressed / focus 反馈与按下态始终保留。
- 「练习时隐藏」按 atom 过滤映射标签，只影响显示、不影响判题。
- 底部「零声母」与「兼容编码」行共用 `MappingStrip`：同样的小标签、溢出计数、hover/focus 浮层和溢出滚动规则；无提示阶段整行隐藏。
- 练习场配置页也复用底部键位图；点击和物理按键都会同步高亮，并由相同的键输入管线驱动 Hero 键帽。

**SchemeKeycaps**（Hero 键帽）：

- 文案逐字取拼音再经方案引擎求主键，标题中的拉丁字母原样展示。
- 随机离位 / 旋转，层叠顺序按阅读顺序固定（同一行右侧压左侧、下一行压上一行）；答对部分键后闲置 8 秒重新散落。
- 支持 1–10 个键帽，每行最多 5 个；存在合法断点时优先分行，汉字组不可断、连续英文尽量不断，同类候选取左右最均衡的断点。
- 订阅统一键输入层，键盘敲击与键位图点击都会触发键帽动画；练习场 Hero 固定单行「练习场」，不受分行规则影响。

**统一输入**：`KeyboardMap` 点击和物理键盘都经 `useKeyInput` 派发，`KeyboardMap` / `SchemeKeycaps` / 练习判题订阅同一个输入事件；声音由键帽或练习页单独负责。

**统一底栏**：底部键位图由 App 级 `BottomDockHost` 统一挂载和过渡；页面只注册内容，不在模板分支中各自创建 `DockReveal`。

### 兼容编码行

`KeyboardMap` 在零声母行下方追加「兼容编码」行，仅当方案 `compatCodes` 非空时显示；两行都由 `MappingStrip` 统一渲染：

- 标签、按键小格、溢出计数和 hover/focus 浮层完全一致；
- 只有内容一行放不下时，才显示「共 N 个」和可滚动面板；
- 兼容编码使用和零声母完全相同的键帽样式，不用 `/`；
- hover / focus 时浮层可进入并滚动，不被 hover 消失打断。

## 顶栏


- **品牌**：SVG 圆角方块使用 `var(--brand)` → `var(--brand-fill-hover)` 渐变，四个白色方块保持白色；旁边是「双拼」与 `NEXT` 标签。hover / focus 品牌展示项目信息浮层（作者、开源协议、开源地址、在线体验），可从浮层直接打开链接。
- **主导航**：`.segmented` + `.segmented-btn`，课程 / 练习切换带 `aria-current="page"`，按钮内显示 `Alt+H` / `Alt+P`。
- **上下文**：练习页显示返回路线、课名与阶段标签；课程 / 练习场显示品牌与当前方案徽标。
- **操作区**：快捷键帮助（`?`）、底部键盘显隐（`Ctrl+K`，仅支持的页面出现）、音效（`Alt+B`）、主题（`Alt+T`），统一为 34px 高 surface 卡片（`--line`、`--shadow-sm`、`--r-control`）。
- **响应式**：≤640px 高度 54px、内边距 14px，按钮收为图标；练习进行中隐藏主导航，优先展示课名与阶段标签。

## 动效与无障碍

- 全局 `@keyframes ui-*` 提供淡入、弹出、错误抖动、输入格反馈等动画；路由切换 200ms 淡入 / 位移；`prefers-reduced-motion` 下统一降为瞬时。
- `:focus-visible` 提供品牌色轮廓；图标按钮带 `aria-label` / `title` / `aria-pressed` / `aria-keyshortcuts`，分段控件使用 `aria-current` / `aria-pressed` / `aria-selected`。
- 快捷键面板为 `role="dialog"` + `aria-modal`，焦点限制在面板内；仅指针点击后清除按钮焦点，文本输入类控件保留焦点。
