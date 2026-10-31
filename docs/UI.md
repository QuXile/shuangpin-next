# 界面与设计

[← 文档导航](../README.md#文档导航)

本页说明新版界面（2026-10 重构）的视觉语言、设计 token、共享原语、布局骨架与关键组件规范。组件样式必须遵守这里的约定；`pnpm lint:ui` 会自动检查其中可静态验证的部分。截图见 [界面截图](SCREENSHOTS.md)，页面行为见 [学习指南](LEARNING.md) / [练习场](TRAINING.md)。

## 视觉语言

界面以学习地图为基准统一：浅色卡片表面 + 细线条 + 大圆角、紧凑的语义化排版、品牌蓝作为唯一强调色，绿色只用于通过 / 完成态，红色只用于错误 / 未通过态。

- **只用 token**：组件样式只消费 `apps/web/src/styles/tokens.css` 的语义变量，不写裸 `hex` / `rgba`；需要派生颜色时用 `color-mix(in srgb, var(--token) …)`。深色主题只覆盖 token，组件内不写 `html[data-theme='dark']` 特判。
- **先共享原语，再局部样式**：面板、标题、分段控件、按钮、徽标、chip、键帽等已有全局类，页面只做布局与少量组合覆盖。
- **统一密度**：控制件高度集中在 26 / 30 / 34 / 42px；卡片圆角 16–20px；正文 13.5px，辅助信息 11–12.5px。

## 布局骨架

| 场景 | 规则 |
|---|---|
| 浏览类页面（学习路线、练习场、顶栏、页脚） | `--page-max` 1440px 居中，`--page-pad-x` 桌面 28px / 移动 14px，`--page-top-gap` 桌面 24px / 移动 12px |
| 顶栏 | 固定顶部，高度 `--topbar-h`（桌面 64px / 移动 54px），内部左右与页面内容同宽对齐 |
| 沉浸式练习（课程详情、单课练习、入门课、练习会话） | 1080px 居中窄栏，聚焦输入；练习会话页面整体不滚动，内容区独立滚动 |
| 页面骨架 | `App.vue`：固定顶栏 + 路由视图 + 页脚（练习 / 练习场页面隐藏页脚并锁定视口高度） |

`html` 统一 `overflow-y: scroll` + `scrollbar-gutter: stable`，练习页键位图显隐时不会因滚动条出现 / 消失而横向跳动。

## 设计 token

`styles/tokens.css` 分语义组维护，深色主题位于 `html[data-theme='dark']`：

| 分组 | 代表 token |
|---|---|
| 页面骨架 | `--topbar-h`、`--page-max`、`--page-pad-x`、`--page-top-gap`、`--hero-keycap-size` |
| 表面与线条 | `--bg`、`--surface`、`--surface-2/3`、`--line`、`--line-strong`、`--line-faint` |
| 文字 | `--ink`、`--ink-2/3/4`、`--text-xs/sm/base/md` |
| 品牌 | `--brand`、`--brand-fill`、`--brand-fill-hover`、`--brand-soft`、`--brand-ink`、`--brand-line`、`--brand-glow` |
| 状态 | `--success*`、`--danger*`、`--star*`、`--state-success-*`、`--state-danger-*` |
| 拼音分色 / 键帽 | `--ini`、`--fin`、`--focus-*`、`--cap-*`、`--keycap-*`、`--hero-tint` |
| 圆角 / 阴影 | `--r-control`(9px)、`--r-card`(16px)、`--r-sm`…`--r-xl`、`--shadow-sm/md` |
| 动效 | `--dur-fast/mid/slow`、`--ease` |

`--brand-line` 与 `--brand-glow` 等本身由 `color-mix` 从品牌色派生，深浅主题都会自动适配。新增颜色时必须先加 token，再在组件中引用。

## 共享原语（base.css）

| 原语 | 用途 |
|---|---|
| `.panel` / `.panel-title` / `.panel-head` / `.eyebrow` | 统一卡片表面、16px/850 卡标题、卡头行、10px 英文眉题 |
| `.page` / `.state-card` / `.spinner` | 页面容器、加载 / 错误状态卡、加载指示 |
| `.segmented` / `.segmented-btn` / `.segmented--sm` | 分段控件：顶栏主导航、练习场页签、字 / 词切换、文章输入 / 导入；带选中滑块动画 |
| `.meta-btn` / `.count-badge` / `.chip` | 卡片上的浅色小操作、计数徽标、练习范围的标签按钮 |
| `.btn` / `.btn--primary` | 主次按钮；主按钮使用品牌填充与品牌辉光 |
| `.common-capsule` | 练习设置的「全拼沿用」胶囊（颜色由所属 SetupCard 的 tone 变量控制） |
| `kbd` / `.icon` / `.mono` / `.sr-only` / `.thin-scroll` | 快捷键提示、图标尺寸、等宽数字、屏幕阅读器文本、细滚动条 |

`kbd` 的边框与底色由 `currentColor` 混合生成，因此放在不同文字颜色的按钮里会自动协调。

## 组件骨架

- **HeroLayout**（`components/common/HeroLayout.vue`）：课程与练习场共用的 Hero 骨架。英文眉题固定顶部、中文标语贴右侧键帽区底边；方案选择行位于两者较低处下方 18px；卡片高度完全由内容撑开，两端共用 `--hero-keycap-size` 与间距。
- **CardHeader**（`components/common/CardHeader.vue`）：继续学习、键位图、学习进度、练习设置等卡片的统一卡头，固定 58px 高，左侧 `panel-title`、右侧操作区同行。
- **StateCard / Spinner**：加载、错误、空状态的统一卡片。
- **BackToTop**：学习路线滚动超过 320px 后出现的固定回顶按钮（图标 + `Home`），平滑滚动并尊重 `prefers-reduced-motion`。
- **DockReveal**：底部键位图容器，通过 `ResizeObserver` 测量内容高度做 `height` + opacity 过渡；收起后 `inert + aria-hidden`，不进入 Tab 顺序。

## 交互动效

- 全局 `@keyframes ui-*` 提供 fade-up、fade-in、pop-in、shake（错误）、slot-pop / slot-success（输入格）、success-pulse、row-focus 等反馈；组件只在实际状态变化时触发，不在挂载时整屏播放。
- 路由切换使用全局 `<Transition name="page">`（200ms 淡入 / 位移）；练习页用 `:key="stage"` 在阶段切换时重放进入动画；文章输入 / 导入模式切换淡入。
- 按钮按下使用 `transform: scale()` / `translateY` 提供按下反馈；指针点击后才清除焦点，键盘激活不清除。
- `prefers-reduced-motion: reduce` 下所有动画与过渡统一降为瞬时，`scroll-behavior` 改为 `auto`。

## 键位图与键帽

**KeyboardMap**（`components/keyboard/KeyboardMap.vue`）是课程、练习场与底部 Dock 共用的键位图：

- 三行键盘布局，所有按键等宽（按单行最多 10 键计算，行内居中）；第三行末尾固定一个等尺寸「退格」键，所有页面都显示且可点击 / 可高亮（练习页撤销输入，教学页只给按下反馈）。
- 键帽内分别显示声母（品牌色）与韵母（橙色）映射；本课 focus 对应的映射文字反白 + 底色强调；改造声母可单独标记。
- **遮挡模式**只隐藏映射文字，不改变键帽外观；hover / pressed / focus 反馈始终保留，按下态统一显示绿色。
- 「练习时隐藏」按 atom 过滤映射标签，仅影响显示、不影响判题。
- **零声母行**：所有键位图底部渲染独立「零声母」行，按方案 `zeroInitial` 展示最多 12 个零声母及其实按键序列；隐藏设置会过滤对应项，遮挡阶段整行隐藏。

**SchemeKeycaps**（Hero 键帽）：

- 文案逐字取拼音，再经当前方案 engine 求主键；标题中的拉丁字母原样展示。
- 键帽固定随机离位 / 旋转；层叠顺序按阅读顺序固定（同一行右侧压左侧、下一行压上一行），保证不遮挡阅读；答对部分键后闲置 8 秒会自动重新散落，切换方案 / 点击方案按钮会重新排布。
- Hero 键帽接收键盘与键位图输入，顺序正确变绿；`fixedRows` 控制预留行数——学习路线为两行，练习场固定单行。
- 整音节编码方案（C 双拼）的方案名无法逐字映射出按键时，使用 `E R R O R` 五个键帽兜底，避免空 Hero。

## 顶栏

- **品牌**：SVG 圆角方块使用 `var(--brand)` → `var(--brand-fill-hover)` 渐变，内部四个白色方块（`var(--on-accent)`）保持白色；旁边是「双拼」与 `NEXT` 胶囊标签。
- **主导航**：`.segmented` + `.segmented-btn`，课程 / 练习切换带 `aria-current="page"`，按钮内直接显示 `Alt+H` / `Alt+P`。
- **左侧上下文**：练习页显示「返回路线 + 课名 + 阶段标签」；课程 / 练习场显示品牌、当前方案徽标与阶段标签（如有）。
- **右侧操作**：快捷键帮助（`?`）、底部键盘显隐（仅当前页支持时出现，`Ctrl+K`）、音效开关（`Alt+B`）、主题切换（`Alt+T`）；统一为 34px 高的 surface 卡片（`--line` 边框、`--shadow-sm`、`--r-control`）。
- **响应式**：≤640px 顶栏高度 54px、内边距 14px，按钮收为图标；练习进行中隐藏主导航，优先展示课名与阶段标签。

## 主题与状态色

- 亮 / 暗主题只切换 token；首屏在 `index.html` 内联脚本中先应用已保存 / 系统主题，避免深色闪白。
- 品牌蓝用于强调与主操作；通过 / 完成态用 `--state-success-*`（内部统计、规则、次级按钮使用 `--state-success-surface`，避免深色主题下绿底与深蓝块对比过强）；未通过态用 `--state-danger-*`；错误提示用 `--danger*`；教学键位 focus 用 `--focus-initial/final`。

## 无障碍与键盘

- 全局 `:focus-visible` 提供 2.5px 品牌色轮廓；隐藏菜单 / 键位图收起后不进入 Tab 顺序。
- 图标按钮均有 `aria-label` / `title` / `aria-pressed` / `aria-keyshortcuts`；分段控件使用 `aria-current` / `aria-pressed` / `role="tab"` + `aria-selected`。
- 快捷键面板是 `role="dialog"` + `aria-modal`，焦点限制在面板内，关闭后恢复原焦点。
- 仅指针点击后清除按钮焦点，避免键盘误触；文本输入类控件保留焦点。
- 所有动效尊重 `prefers-reduced-motion`；滚动位置恢复与平滑滚动在 reduced-motion 下改为瞬时。

## 音效

`stores/sound.ts` 用 Web Audio 合成键盘敲击、错误与完成三种音效，不依赖音频资源：

- 默认开启，顶栏喇叭按钮或 `Alt+B` 切换，开关状态持久化；
- 首次用户手势时解锁 `AudioContext`，避免自动播放策略吞掉第一个按键声；
- 键位图点击与物理按键共用同一入口，12ms 内去重，避免 Hero 键帽与键位图同时触发双声；
- 错误音使用低频下降音、完成音使用上行琶音，与普通敲击声明确区分。

## 校验

`scripts/check-ui-conventions.mjs`（`pnpm lint:ui`）静态检查：

- 组件 `<style>` 与 `base.css` 不得出现裸 `hex` / `rgba`；
- `tokens.css` 中定义的 token 必须至少被引用一次；
- 练习场 `SetupCard` / `SetupGroup` / `CommonCapsule` 的上下文色调与 `aria-pressed` 约定；
- `.chip` 选中样式统一在 `base.css` 维护，训练页不得重复定义；
- 文档（README 与 `docs/**/*.md`）引用的 `docs/assets/impl` 截图必须存在。

## 相关文档

- 实现结构与状态管理 → [架构说明](ARCHITECTURE.md)
- 全部截图与维护规则 → [界面截图](SCREENSHOTS.md)
- 快捷键行为 → [快捷键](SHORTCUTS.md)
