/** 快捷键帮助面板的唯一展示数据；页面绑定仍由各自 useGlobalKeys 负责。 */
export interface ShortcutItem {
  keys: string[]
  label: string
}

export interface ShortcutGroup {
  title: string
  items: ShortcutItem[]
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: '全局',
    items: [
      { keys: ['Alt', 'H'], label: '回到课程路线' },
      { keys: ['Alt', 'P'], label: '进入练习场' },
      { keys: ['Alt', 'T'], label: '切换亮色 / 暗色主题' },
      { keys: ['Alt', 'B'], label: '开启 / 关闭音效' },
      { keys: ['Home'], label: '回到页面顶部' },
      { keys: ['Ctrl', 'K'], label: '显示 / 隐藏底部键位图' },
      { keys: ['Alt', 'K'], label: '显示 / 隐藏底部键位图（兼容）' },
      { keys: ['?'], label: '打开 / 关闭本面板' },
      { keys: ['Esc'], label: '关闭面板或返回上一级' },
    ],
  },
  {
    title: '学习路线',
    items: [
      { keys: ['Alt', 'S'], label: '聚焦当前双拼方案' },
      { keys: ['Alt', '1–5'], label: '切换主要双拼方案' },
      { keys: ['Alt', '6'], label: '打开「其他方案」选择器' },
      { keys: ['←', '→'], label: '在方案按钮 / 其他方案之间移动' },
      { keys: ['↑', '↓'], label: '在学习路线课程卡之间移动' },
      { keys: ['Enter'], label: '开始当前课程' },
      { keys: ['Alt', 'U'], label: '解锁全部课程 / 恢复锁定' },
      { keys: ['Alt', 'C'], label: '清除当前方案进度' },
    ],
  },
  {
    title: '课程详情 / 入门课',
    items: [
      { keys: ['Enter'], label: '开始练习 / 下一页 / 完成试打' },
      { keys: ['Alt', '←'], label: '返回上一页' },
      { keys: ['Space'], label: '清空错误输入' },
      { keys: ['Esc'], label: '返回路线' },
    ],
  },
  {
    title: '练习 / 考核',
    items: [
      { keys: ['Enter'], label: '主操作（开始 / 下一阶段 / 完成本课）' },
      { keys: ['Alt', 'Enter'], label: '进入无尽练习（阶段结束后）' },
      { keys: ['Alt', '←'], label: '上一阶段' },
      { keys: ['Alt', 'R'], label: '重新开始当前阶段' },
      { keys: ['Backspace'], label: '退格撤销当前输入' },
      { keys: ['Space'], label: '清空错误输入' },
      { keys: ['Esc'], label: '退出练习' },
    ],
  },
  {
    title: '练习场',
    items: [
      { keys: ['Alt', 'D'], label: '专项练习' },
      { keys: ['Alt', 'A'], label: '文章练习' },
      { keys: ['Alt', '1–5'], label: '切换主要双拼方案' },
      { keys: ['Alt', '6'], label: '打开「其他方案」选择器' },
      { keys: ['←', '→'], label: '在方案按钮 / 其他方案之间移动' },
      { keys: ['Enter'], label: '开始练习' },
      { keys: ['Alt', 'R'], label: '重新开始当前会话' },
      { keys: ['Esc'], label: '结束练习会话' },
    ],
  },
  {
    title: '通用',
    items: [
      { keys: ['Tab'], label: '按顺序聚焦下一个控件（Shift+Tab 反向）' },
      { keys: ['Enter'], label: '激活当前按钮 / 确认' },
      { keys: ['Space'], label: '激活当前按钮 / 切换勾选' },
    ],
  },
]
