# 界面与设计

[← 文档导航](../README.md#文档导航)

单一设计系统：一个品牌色、通过 / 错误两个状态色、一套中性表面与文字色。所有页面共用 `apps/web/src/styles/tokens.css` 的设计令牌与 `apps/web/src/styles/base.css` 的共享原语；组件样式只做布局与局部组合。

## 设计令牌

令牌定义在 `tokens.css`，深色主题通过 `html[data-theme='dark']` 覆盖同名变量；组件不写主题特判。当前共 96 个令牌：

| 类别 | 令牌示例 | 用途 |
|---|---|---|
| 字体与骨架 | `--font-ui` `--font-mono` `--topbar-h` `--page-max` `--page-pad-x` `--content-narrow` `--content-reading` `--content-session` `--hero-keycap-size` `--hero-tint` | 字体、页面宽度、顶栏、阅读与会话栏、Hero |
| 表面与线条 | `--bg` `--surface` `--surface-2` `--surface-3` `--line` `--line-strong` | 页面底色、面板、内嵌块、描边 |
| 文字 | `--ink` `--ink-2` `--ink-3` `--ink-4` | 标题、正文、辅助、弱提示 |
| 品牌 | `--brand` `--brand-ink` `--brand-fill` `--brand-fill-hover` `--brand-soft` `--brand-soft-2` `--brand-line` `--brand-glow` `--on-accent` | 品牌蓝与主按钮 |
| 拼音分色 | `--ini` `--fin` `--fin-strong` `--ini-soft` `--fin-soft` `--mapping-fill-initial` `--mapping-fill-final` | 声母蓝、韵母橙与映射胶囊 |
| 范围强调 | `--mapping-focus` `--mapping-focus-soft` `--mapping-focus-ink` `--mapping-focus-line` | 本课 focus、零声母、兼容编码统一紫色 |
| 键帽 | `--keycap-size-mini` `--keycap-face` `--keycap-border` `--keycap-edge` `--keycap-shadow` `--keycap-final-ink` `--keycap-hidden-*` | 通用键帽尺寸、面与隐藏态 |
| 通过 / 错误 | `--success*` `--danger*` | 通过绿、错误红；整卡 tone 变量在 `base.css` 的 `.tone-success` / `.tone-danger` |
| 星级 / 阴影 / 焦点 | `--star` `--shadow-sm` `--shadow-md` `--shadow-pop` `--badge-shadow` `--ring-brand` | 星级、阴影、焦点环 |
| 圆角 | `--r-xs` `--r-control` `--r-card` `--r-panel` `--r-pill` `--r-keycap` `--r-keycap-xs` | 4 / 9 / 14 / 20 / 999px；键帽按尺寸等比圆角 |
| 字号 | `--text-2xs` … `--text-xl` + `--text-display*` | 10–24px 固定档 + 流体展示字号 |
| 动效 / 控件高度 | `--dur-press` `--dur-fast` `--dur-mid` `--dur-slow` `--ease`；`--h-control-xs` … `--h-control-lg` | 90 / 120 / 220 / 380ms；26–42px 控件 |
| 层级 | 字面量约定 | 内容 0/1、sticky 20、浮层 40、modal 100 |

## 共享原语

| 原语 | 用途 |
|---|---|
| `.panel` / `.card` / `.panel--flush` | 页面面板、卡片、无阴影面板 |
| `.panel-head` / `.panel-title` / `.eyebrow` | 面板标题行与眉题 |
| `.btn` / `.btn--primary` / `.btn--quiet` / `.btn--sm` / `.btn--xs` | 主 / 次 / 小按钮 |
| `.segmented` / `.segmented-btn` / `.segmented--sm` | 分段控件与页签（`role="group"` + `aria-pressed`） |
| `.chip` `.is-selected` `.is-special` `.is-zero-chip` | 练习范围 chip |
| `.cap` + `.cap--mini` / `.cap--primary` / `.cap--compat` / `.cap--initial` / `.cap--final` / `.cap--danger` / `.cap--hidden` | 静态键帽结构；字卡键帽由 `common/KeyCap.vue` 的 `practice` 尺寸提供 |
| `.meta-btn` / `.badge` / `.count-badge` | 卡头小操作、计数与状态徽标 |
| `.tone-success` / `.tone-danger` / `.criteria-line` | 通过 / 错误上下文与评分标准行 |
| `.stars` / `StarRating.vue` | 星级（统一 `--star`） |
| `.scroll-y` / `.thin-scroll` / `ScrollTail.vue` | 滚动容器与底部「… 还有内容」提示 |
| `.popover` / `.state-card` / `.spinner` / `.empty-note` | 浮层、加载 / 空态 |
| `.session-btn` / `.session-primary` / `.session-icon` / `.session-item` / `.session-sep` / `.session-danger` / `.session-speed` / `.session-stage` | 会话顶栏插槽与题目区 + 暂停遮罩定位容器 |
| `.page` / `.sr-only` / `.mono` / `kbd` / `.kbd--xs` | 页面容器、屏读文本、等宽数字、快捷键提示 |

## 布局

| 场景 | 规则 |
|---|---|
| 浏览页 | `--page-max` 居中，左右 `--page-pad-x`，顶部 `--page-top-gap` |
| 顶栏 | 固定 `--topbar-h`；品牌区 `BrandPopover`，操作区 `TopbarActions` |
| 沉浸式练习 | `--content-narrow` 窄栏，会话区独立滚动 |
| 页面骨架 | `App.vue`：顶栏 + 路由视图 + 页脚；练习 / 练习场隐藏页脚并锁定视口 |
| 响应式 | 仅 `640px` / `1024px` / `1280px` 三档断点 |
| 容器查询 | 练习字卡用 `container-type: inline-size` + cqw 缩放；键位图宽度用 clamp / cqw |

## 输入与底栏

- 字符输入只经 `useKeyInput`；页面快捷键只经 `useGlobalKeys` 注册。
- `KeyboardMap` 点击与物理键盘派发同一输入事件，`pressedKeys` 共享按下反馈。
- 底栏由 App 级 `BottomDockHost` 挂载，页面通过 `useBottomDockContent` 注册内容；`DockReveal` 用高度过渡。
- 底栏开合会引起练习页重排，重内容滚动区（教学页示例）按行窗口化。

## 键位图与键帽

**KeyboardMap**

- 三行等宽按键，第三行末尾固定「退格」；视图模型来自 `lib/keyboardView.ts`。
- 普通声母 `--ini`、普通韵母 `--fin`；范围内强调映射、零声母、兼容编码统一 `--mapping-focus` 紫。
- 兼容编码没有独立选择状态：构成音节的声母与韵母都在范围内（零声母看零声母）时才强调。
- 与全拼一致的 free 映射不显示；隐藏映射以「?」占位。
- 无提示模式隐藏全部映射、图例、零声母与兼容编码；字卡标答键帽显示「?」，拼音始终显示。
- 底部「零声母」「兼容编码」由 `MappingStrip` 渲染，含溢出计数与浮层。

**键帽层级**

1. `KeyboardMap` 的 `.kbd-key`：键位图平面按键；
2. `common/KeyCap.vue`：统一键帽，`size="mini"` 用于推荐码 / 兼容码 / 示例 / 错误键位 / `FocusTagList`，`size="practice"` 用于练习字卡；mini 与 practice 都采用等比方形圆角，`hidden` 显示灰色「?」，`focus` / `completed` 表达状态；
3. `SchemeKeycaps`：Hero 装饰键帽，`keycapsOf` → `splitKeycapLines` → `scatterLayout`，订阅输入管线驱动动画。

## 可访问性

- 图标按钮带 `aria-label` 与 `title`，用 `aria-pressed` / `aria-current` / `aria-selected` 表达状态，`aria-keyshortcuts` 标注快捷键；
- 键位图、映射条、键帽组用 `role="group"` + `aria-label`；星级用 `role="img"` + aria-label；
- 可点击卡片使用 `<button>` 或 `role="button"` 并处理 Enter / Space；
- 分段页签使用 `role="group"` + `aria-pressed`；
- 浮层与弹窗使用 `aria-modal`、焦点限制与 Esc 关闭；
- 全局 `:focus-visible` 使用 2px 品牌描边 + 2px offset；
- `prefers-reduced-motion` 全局降级；
- 11–12.5px 辅助文字使用 `--ink-3`，`--ink-4` 只用于装饰 / 占位。

## 页面与组件

| 区域 | 组件 |
|---|---|
| 全局框架 | `App.vue`、`Topbar`、`TopbarActions`、`BrandPopover`、`BottomDockHost`、`ShortcutHelp`、`SessionBar` |
| 学习地图 | `SchemeHero`、`SchemeSelector`、`CurrentLearningCard`、`LearningProgressCard`、`ChapterSection`、`LessonCard`、`MapKeymapPanel` |
| 教学 / 入门 | `TutorialStage`、`TutorialExamples`、`IntroLesson`、`IntroPageShell`、`FocusTagList`、`AnchorTips`、`CodeExampleCard` |
| 练习 | `PracticeStream`、`CharacterCard`、`InputSlots`、`StageSummaryCard`、`SessionSummaryCard`、`SessionPauseOverlay` |
| 练习场 | `SetupCard`、`SetupGroup`、`SelectionSummary`、`FocusMappingGroups`、`HiddenMappingGroups`、`CommonCapsule`、`ArticleGrid` |
| 键位图 | `KeyboardMap`、`MappingStrip`、`KeyCap`、`KeymapLegend`、`SchemeKeycaps` |

组件只负责展示与组合，判题 / 选词 / 进度规则来自 core。

## 样式规则

1. 组件只消费 token；颜色、字号、圆角、阴影、动效时长与控件高度都来自 `tokens.css`；
2. 组件 `<style>` 不使用裸 hex / `rgba()` / 裸字号 / 裸圆角 / 裸阴影 / 裸动效时长；`pnpm lint:ui` 检查；
3. `.panel` / `.card` / `.btn` / `.chip` / `.cap` / `.segmented` 等共享原语只在 `base.css` 定义，组件组合使用；
4. 组件 `var(--x)` 必须是已声明 token 或本组件局部属性；
5. 新增 token 必须有真实消费点，`lint:ui` 检查未使用 token；
6. 字号 / 圆角 / 高度 / 动效使用固定档位，新档位先更新本文档与 `tokens.css`；
7. 品牌蓝、声母蓝、韵母橙、映射紫、通过绿、错误红、星金色的语义固定；
8. 颜色 token 在深色主题提供覆盖；字号、圆角、动效、版心等结构 token 不需要；
9. 响应式只用 640 / 1024 / 1280 三档断点，可复用容器查询时优先容器查询；
10. 验证：`pnpm typecheck`、`pnpm lint:ui`、`pnpm test`、`pnpm build`。
