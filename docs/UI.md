# 界面与设计

[← 文档导航](../README.md#文档导航)

本应用采用**单一设计系统**：一个品牌色（品牌蓝）+ 两个状态色（通过绿 / 错误红）+ 一套中性表面与文字色。所有页面、组件共用同一份 `styles/tokens.css` 令牌与 `styles/base.css` 共享原语；组件样式只做布局和局部组合，不再各自定义颜色、字号档位、圆角、阴影或动效时长。

- 观感同源：品牌色相与整体布局骨架不变，细节（字号/圆角/间距/高度/动效）规范化到固定档位。
- 只消费 token：组件 `<style>` 禁止裸色值、裸 `font-size`、裸 `border-radius`、裸 `box-shadow`、裸动效时长（`pnpm lint:ui` 强制）。
- 先共享原语：面板、卡片、按钮、chip、键帽、徽标、滚动容器、弹层、状态色等均已有全局类，页面只做布局与少量组合覆盖。
- 不为「未来扩展」预留参数；能合并的实现合并，新增共享文件必须有明确职责。

---

## 1. 设计令牌（93 个）

令牌定义在 `apps/web/src/styles/tokens.css`，深色主题在 `html[data-theme='dark']` 覆盖同名令牌；组件内不写主题特判。新增颜色/字号/圆角必须先加 token，再使用。

### 1.1 字体与页面骨架（11）

| 令牌 | 值 | 用途 |
|---|---|---|
| `--font-ui` | Inter / PingFang SC / Microsoft YaHei … | 界面字体（默认继承到 body） |
| `--font-mono` | SFMono / Cascadia / Consolas … | 拼音、键帽、数字 |
| `--topbar-h` | 64px（移动 54px） | 固定顶栏高度，App 内容区据此留白 |
| `--page-max` | 1440px | 浏览类页面最大宽度 |
| `--page-pad-x` | 28px（移动 14px） | 页面左右安全边距 |
| `--page-top-gap` | 24px（移动 12px） | 页面顶部间距 |
| `--content-narrow` | 1080px | 沉浸式练习/课程窄栏 |
| `--content-reading` | 620px | 说明文字阅读宽度 |
| `--content-session` | 860px | 会话流/底栏键位图宽度 |
| `--hero-keycap-size` | clamp(42px, 4.5vw, 74px) | Hero 区方案键帽尺寸 |
| `--hero-tint` | radial-gradient(…) | Hero 卡片右上角品牌/韵母色晕（深色单独覆盖） |

### 1.2 表面与线条（6）

| 令牌 | 亮色 / 深色 | 用途 |
|---|---|---|
| `--bg` | `#f3f5f9` / `#0f141e` | 页面底色 |
| `--surface` | `#ffffff` / `#171d28` | 卡片/面板表面 |
| `--surface-2` | `#f6f7fa` / `#1c2330` | 次级表面（内嵌块、hover 底） |
| `--surface-3` | `#edf0f5` / `#222b3a` | 三级表面（徽标、进度槽） |
| `--line` | `#e6ebf2` / `#283141` | 默认描边/分割线 |
| `--line-strong` | `#dce2eb` / `#3a4658` | 强调描边、输入框边界 |

### 1.3 文字（4）

| 令牌 | 亮色 / 深色 | 用途 |
|---|---|---|
| `--ink` | `#18243a` / `#edf1f8` | 主文字、标题 |
| `--ink-2` | `#4b5a70` / `#c0c9d8` | 正文/次级文字 |
| `--ink-3` | `#5f6c80` / `#8b96a7` | 辅助文字（≥11px 正文辅助，WCAG AA） |
| `--ink-4` | `#6b7789` / `#8894a6` | 弱提示/占位（小字需谨慎，必要时改用 `--ink-3`） |

### 1.4 品牌（9）

| 令牌 | 用途 |
|---|---|
| `--brand` | 品牌色（文字/图标/进度填充） |
| `--brand-ink` | 品牌色在浅底上的可读文字色 |
| `--brand-fill` / `--brand-fill-hover` | 主按钮填充 / hover 填充（深色单独取值保证白字对比） |
| `--brand-soft` / `--brand-soft-2` | 品牌浅底 / 更实一档的选中底 |
| `--brand-line` | 品牌色与线条混出的描边 |
| `--brand-glow` | 主按钮辉光阴影 |
| `--on-accent` | 品牌/状态填充上的文字色（白） |

### 1.5 拼音分色 / 键盘 focus（7）

| 令牌 | 用途 |
|---|---|
| `--ini` / `--fin` | 声母蓝 / 韵母橙（拼音分色 + 键位图普通映射） |
| `--fin-strong` | 橙色在浅底上的深色文字 |
| `--ini-soft` / `--fin-soft` | 声母/韵母浅底（`color-mix` 派生） |
| `--mapping-fill-initial` / `--mapping-fill-final` | 键位图映射强调胶囊的填充底（白字，深色主题单独给深色值保证对比度） |

### 1.6 范围内映射强调（4）

| 令牌 | 用途 |
|---|---|
| `--mapping-focus` | 本课 focus / 零声母 / 兼容编码统一强调紫 |
| `--mapping-focus-soft` | 强调浅底 |
| `--mapping-focus-ink` | 强调底上的文字 |
| `--mapping-focus-line` | 强调描边 |

### 1.7 键帽（8）

| 令牌 | 用途 |
|---|---|
| `--keycap-face` / `--keycap-border` / `--keycap-edge` / `--keycap-shadow` | 通用键帽表面、描边、立体边与阴影（scheme 键帽使用） |
| `--keycap-final-ink` | 韵母键帽文字色（深色保留暖色深调） |
| `--keycap-hidden-bg` / `--keycap-hidden-border` / `--keycap-hidden-ink` | 练习「隐藏映射」键帽态 |

> 声母键帽 ink 复用 `--brand-ink`；声母/韵母键帽的底色与描边由 `--ini`/`--fin` + `color-mix` 派生，不再单列 token。

### 1.8 通过态（8）与错误态（6）

| 令牌 | 用途 |
|---|---|
| `--success` / `--success-strong` | 通过基色 / 悬停与强调填充 |
| `--success-soft` / `--success-surface` | 通过浅底 / 卡片级通过表面 |
| `--success-ink` / `--success-line` / `--success-line-hover` | 通过态文字 / 描边 / hover 描边 |
| `--success-glow` | 通过态光晕 |
| `--danger` | 错误基色（填充/文字） |
| `--danger-soft` / `--danger-surface` | 错误浅底 / 卡片级错误表面 |
| `--danger-ink` / `--danger-line` / `--danger-glow` | 错误态文字 / 描边 / 光晕 |

> 通过/错误态的整卡渐变与 tone 变量集中在 `base.css` 的 `.tone-success` / `.tone-danger`，组件只消费 `--tone-*`。

### 1.9 星级、阴影与焦点环（6）

| 令牌 | 用途 |
|---|---|
| `--star` | 星级唯一颜色（金色） |
| `--shadow-sm` / `--shadow-md` | 轻阴影（控件）/ 面板阴影 |
| `--shadow-pop` | 浮层阴影 |
| `--badge-shadow` | 键帽徽标阴影 |
| `--ring-brand` | 品牌焦点环（`0 0 0 3px var(--brand-soft)`） |

### 1.10 圆角（5 档）

| 令牌 | 值 | 用途 |
|---|---|---|
| `--r-xs` | 4px | kbd、色块、微徽标 |
| `--r-control` | 9px | 按钮、chip、tag、输入框、浮层 |
| `--r-card` | 14px | 卡片、内嵌统计块、弹层 |
| `--r-panel` | 20px | 页面级面板 / 对话框 / 大容器 |
| `--r-pill` | 999px | 胶囊、徽标、进度槽 |

> 圆形头像/序号使用 `50%`；比例圆角（键帽/输入格）用 cqw，不进档位。

### 1.11 字号（7 档固定 + 3 fluid）

| 令牌 | 值 | 用途 |
|---|---|---|
| `--text-2xs` | 10px | kbd 提示、徽标、eyebrow、micro label |
| `--text-xs` | 11px | 辅助信息、卡头标签 |
| `--text-sm` | 12.5px | 次要正文、小按钮 |
| `--text-base` | 14px | 正文（body 基准） |
| `--text-md` | 16px | 卡片标题、`.btn` 文案、面板标题 |
| `--text-lg` | 20px | 区块标题、统计大数字 |
| `--text-xl` | 24px | 面板大标题、弹层标题 |
| `--text-display-sm` | clamp(22px, 2.3vw, 30px) | 入门课/区块 h1 |
| `--text-display` | clamp(28px, 3.2vw, 40px) | Hero 主标题 |
| `--text-display-lg` | clamp(34px, 4.4vw, 52px) | 拼音解剖/大型展示字 |

> 容器内流体字号（`13.5cqw` 等）与键帽字号（`calc(var(--cap) * 0.5)`）属于尺寸联动，不属于字号档位，保持相对单位。

### 1.12 动效（4 档）与控件高度（4 档）

| 令牌 | 值 | 用途 |
|---|---|---|
| `--dur-press` | 90ms | 键帽/按键按下 |
| `--dur-fast` | 120ms | hover、颜色/描边过渡 |
| `--dur-mid` | 220ms | 面板/浮层进出、布局过渡 |
| `--dur-slow` | 380ms | 进度填充、卡片浮现 |
| `--ease` | cubic-bezier(.22,.61,.36,1) | 统一缓动（spinner 用 `linear`） |
| `--h-control-xs` | 26px | 移动端 chip / 小分段 |
| `--h-control-sm` | 30px | chip、分段按钮、会话按钮 |
| `--h-control` | 34px | 次级按钮、图标按钮、会话主按钮 |
| `--h-control-lg` | 42px | 主按钮（`.btn`） |

### 1.13 层级（z-index 约定，实施为字面量）

| 层级 | 值 | 用途 |
|---|---|---|
| 内容 | 0 / 1 | 卡片内层叠 |
| sticky | 20 | 固定顶栏 |
| 浮层 | 40 | 品牌浮层、映射浮层、返回顶部（30） |
| modal | 100 | 快捷键面板 |

> 新增固定/浮层元素沿用它三档；不为单个组件新增任意 z-index。

---

## 2. 共享原语（`styles/base.css`）

| 原语 | 用途 | 示例 |
|---|---|---|
| `.panel` | 页面级面板表面（20px 圆角 + 面板阴影） | `<section class="panel">` |
| `.card` | 卡片表面（14px 圆角，无阴影） | `<div class="card">` |
| `.panel--flush` | 无阴影面板（内嵌大区域） | `<section class="panel--flush">` |
| `.panel-head` / `.panel-title` | 标题行 / 16px 卡标题 | `<header class="panel-head"><h2 class="panel-title">…</h2></header>` |
| `.eyebrow` | 10px 英文眉题 | `<p class="eyebrow">KEYBOARD MAP</p>` |
| `.btn` / `.btn--primary` | 主/次按钮（42px） | `<button class="btn btn--primary">开始</button>` |
| `.btn--quiet` / `.btn--sm` / `.btn--xs` | 34px 次级 / 34px 小 / 30px 行内按钮 | `<button class="btn btn--quiet">重试</button>` |
| `.segmented` / `.segmented-btn` / `.segmented--sm` | 分段控件/页签；配 `role="group"` + `aria-pressed` | `<div class="segmented"><button class="segmented-btn is-active">…</button></div>` |
| `.chip` / `.chip.is-selected` / `.is-special` / `.is-zero-chip` | 练习范围 chip（含 tone 变量适配） | `<button class="chip is-selected">zh</button>` |
| `.cap` + `.cap--mini` / `.cap--xs` / `.cap--primary` / `.cap--compat` / `.cap--initial` / `.cap--final` / `.cap--hidden` | 键帽结构（static mini / 小 kbd）；练习字卡键帽另由 `common/KeyCap.vue` 提供 `practice` 尺寸 | `<span class="cap cap--mini cap--primary">he</span>` |
| `.meta-btn` | 卡头小操作（30px，品牌浅底） | `<button class="meta-btn">清除进度</button>` |
| `.badge` / `.count-badge` | 计数/状态徽标 | `<span class="count-badge">3 课</span>` |
| `.tone-success` / `.tone-danger` | 通过/错误 tone 上下文（提供 `--tone-*`，不直接设色） | `<article class="panel tone-success">` |
| `.criteria-line` | 评分标准行（2.6em 标签 + 说明） | `<p class="criteria-line"><b>A</b><span>…</span></p>` |
| `.card-meta` / `.card-type` | 课程卡元信息列 / 次要标签 | `<span class="card-meta"><span class="card-type">第 3 课</span></span>` |
| `.stars` / `common/StarRating.vue` | 星级（颜色统一 `--star`） | `<StarRating :stars="lesson.stars" />` |
| `.scroll-y` + `.thin-scroll` | 滚动容器（细滚动条 + 稳定 gutter + 含 overscroll） | `<div class="scroll-y thin-scroll">` |
| `common/ScrollTail.vue` | 滚动区底部「… 还有内容」提示（未滚到底时显示） | `<ScrollTail :scroller="bodyRef" />`（父容器需 `position: relative`） |
| `.popover` | 浮层（14px 圆角 + `--shadow-pop`） | `<div class="popover">` |
| `.icon` / `.icon--sm` / `.icon--lg` | 图标尺寸 18/14/22px | `<svg class="icon">` |
| `.icon-circle` | 圆形图标/序号容器 | `<span class="icon-circle">` |
| `.progress` / `.progress-fill` | 进度槽/填充（宽度用 `--progress`） | `<div class="progress"><i class="progress-fill" /></div>` |
| `.ring-brand` | 品牌焦点环工具类 | `<div class="card ring-brand">` |
| `.empty-note` | 空态说明 | `<p class="empty-note">暂无数据</p>` |
| `.toolbar` | 横向操作条容器 | `<div class="toolbar">…</div>` |
| `.state-card` / `.spinner` | 页面级加载/错误状态卡与加载指示 | `<StateCard loading message="…" />` |
| `.page` / `.sr-only` / `.mono` / `kbd` / `.kbd--xs` | 页面容器、屏读文本、等宽数字、快捷键提示 | `<kbd>Enter</kbd>` |
| `.session-btn` / `.session-primary` / `.session-icon` / `.session-item` / `.session-sep` / `.session-danger` / `.session-speed` | 会话顶栏插槽内容（全局类，SessionBar 只管布局与 tone） | `<button class="session-btn">上一页<kbd>Alt+←</kbd></button>` |

---

## 3. 布局与页面骨架

| 场景 | 规则 |
|---|---|
| 浏览类页面 | `--page-max` 1440 居中，左右 `--page-pad-x`（桌面 28 / 移动 14），顶部 `--page-top-gap` |
| 顶栏 | 固定顶部 `--topbar-h`（64/54px），内容与页面同宽；品牌区与操作区拆为 `BrandPopover` / `TopbarActions` |
| 沉浸式练习 | `--content-narrow` 1080px 窄栏；会话区独立滚动 |
| 页面骨架 | `App.vue`：固定顶栏 + 路由视图 + 页脚；练习/练习场隐藏页脚并锁视口高度 |
| 响应式断点 | 仅 3 档：`640px`（手机）、`1024px`（平板/窄桌面）、`min-width: 1280px`（宽桌面） |
| 容器查询 | 练习字卡（CharacterCard）用 `container-type: inline-size` + cqw 等比缩放；键盘图/键帽宽度用 clamp/cqw，不依赖视口断点 |

---

## 4. 统一输入管线与底部键位图

- 字符输入只允许经 `useKeyInput`（`composables/useKeyInput.ts`）派发；页面级快捷键只允许经 `useGlobalKeys` 注册。禁止在组件里直接 `window.addEventListener('keydown')`（仅 `App.vue` / `LearnMapPage.vue` 两个既有例外，快捷键面板 modal 监听已注释说明）。
- `KeyboardMap` 点击与物理键盘走同一输入事件；`pressedKeys` 全局共享按下反馈。
- 底部键位图由 App 级 `BottomDockHost` 统一挂载与开合；页面只通过 `useBottomDockContent` 注册内容（`useSchemeView.baseDockContent` 提供基础字段），不在模板分支中重复创建 `DockReveal`。
- 底栏开合用高度过渡（`DockReveal`）；练习页内容随高度重排，重内容滚动区（如教学页「示例」）需按行窗口化。

## 5. 键位图与键帽规则

**KeyboardMap**（课程/练习/练习场/底栏共用）

- 三行等宽按键，第三行末尾固定「退格」键；视图模型来自 `lib/keyboardView.ts` 纯函数。
- 普通声母映射用 `--ini`、普通韵母用 `--fin`；进入课程范围的强调映射、零声母、兼容编码统一用 `--mapping-focus` 紫。
- 兼容编码没有独立选择状态：只有构成该音节的声母与韵母都在当前范围内（零声母音节看零声母是否在范围内）时才强调，表示这条编码可能出现在题目里。
- 与全拼一致的 free 映射不显示；「练习时隐藏」按 atom 过滤显示、不影响判题。
- 无提示模式隐藏全部映射/图例/零声母/兼容编码，保留 hover/pressed/focus 反馈。
- 底部「零声母」「兼容编码」统一由 `MappingStrip` 渲染（标签、溢出计数、hover/focus 浮层、滚动一致）。

**键帽层级**

1. `KeyboardMap` 的 `.kbd-key`：键位图平面按键（60/46px 高）。
2. `common/KeyCap.vue`：统一键帽组件，两个尺寸：
   - `size="mini"`：静态小键帽（推荐码/兼容码/示例），走 `.cap--mini`；
   - `size="practice"`：练习字卡键帽，`variant` 声母/韵母/隐藏，`focus`/`completed` 状态；
3. `SchemeKeycaps`：Hero 区装饰键帽（动画/随机散落），视觉结构走 `.cap` 系列 + 自身动效。

**SchemeKeycaps**：文案经 `lib/keyboardView.keycapsOf` 取拼音主键 → `splitKeycapLines` 分行（≤2 行/每行 ≤5，汉字两键不断）→ `scatterLayout` 随机散落；订阅统一输入管线驱动正确/错误动画。

## 6. 可访问性约定

- 所有图标按钮带 `aria-label` + `title`（可含快捷键），用 `aria-pressed`/`aria-current`/`aria-selected` 表达状态，用 `aria-keyshortcuts` 标注快捷键。
- 键位图/映射条/键帽组等容器使用 `role="group"` + `aria-label`；星级使用 `role="img"` + aria-label；禁止在无 role 的 generic `div/span` 上写 `aria-label`。
- 可点击卡片用 `<button>` 或 `role="button"` + 键盘 Enter/Space 处理，不使用裸 div 点击。
- 分段控件/页签二选一：真 tab（`role=tablist` + `tabpanel` + 方向键）或 `role="group"` + `aria-pressed`；当前统一采用后者（页面 tab 已改）。
- 浮层/弹窗：`aria-modal` + 焦点限制 + Esc 关闭；装饰性重复浮层加 `aria-hidden="true"`。
- 焦点：全局 `:focus-visible` 2px 品牌色描边 + 2px offset；输入类可用 `--ring-brand`，不为单个组件自造焦点样式。
- 动效：全局 `prefers-reduced-motion` 统一降级；组件不得再写局部降级（除必要 JS 行为判断）。
- 文字对比度：11–12.5px 辅助文本使用 `--ink-3`（AA 达标）；`--ink-4` 只用于装饰/占位，小字慎用。

## 7. 改样式时的硬规则

1. **只消费 token**：颜色、字号、圆角、阴影、动效时长、控件高度必须走 `tokens.css`；如缺档位，先在 `tokens.css` 新增（并同步深色主题，若为颜色）。
2. **禁止裸值**：组件 `<style>` 内禁止 `#hex`/`rgba()`、`font-size: Npx/clamp()`、`border-radius: Npx`、无 `var()` 的 `box-shadow`、非 `var(--dur-*)` 的 `transition/animation` 时长。`pnpm lint:ui` 会失败。
3. **禁止重定义共享原语**：`.panel/.card/.btn/.chip/.cap/.segmented/.eyebrow/.badge/.popover/.state-card/...` 只能在 `base.css` 定义；组件只能组合使用。
4. **未声明 token 守卫**：组件 `var(--x)` 必须是已声明的 token 或本组件局部属性，避免删 token 后残留。
5. **新增 token 默认不用**：新增后必须立即有真实消费点；`lint:ui` 会检查未使用 token。
6. **字号/圆角/高度/动效档位固定**：新增尺寸优先复用现有档位；确需新档位需先更新本文件与 `tokens.css`。
7. **色相不变**：品牌色、声母蓝、韵母橙、映射紫、通过绿、错误红、星金色的语义不得互换；不要引入第二种强调色。
8. **深色主题**：颜色 token 必须在 `html[data-theme='dark']` 提供覆盖；结构性 token（字号/圆角/动效/版心）不需要。
9. **响应式**：只允许 640 / 1024 / 1280 三档断点；可复用容器查询时优先容器查询。
10. **验证**：`npx vite build`（SFC 编译）+ `pnpm typecheck` + `pnpm lint:ui` + `pnpm test`。
