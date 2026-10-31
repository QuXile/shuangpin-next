/**
 * 训练配置持久化：按方案保存「出现范围 / 隐藏选择 / 字词模式 / tab」。
 * 纯函数 + 可注入 storage，便于在 Node 环境单测，不依赖浏览器。
 */
export type TrainingTab = 'drill' | 'article'
export type TrainingDrillMode = 'char' | 'word'
export type TrainingArticleInputMode = 'input' | 'import'

export interface TrainingConfigSnapshot {
  tab: TrainingTab
  drillMode: TrainingDrillMode
  articleInputMode: TrainingArticleInputMode
  selectedInitials: string[]
  selectedFinals: string[]
  selectedZeroFinals: string[]
  hiddenInitials: string[]
  hiddenFinals: string[]
  hiddenZeroFinals: string[]
  articleHiddenInitials: string[]
  articleHiddenFinals: string[]
  articleHiddenZeroFinals: string[]
}

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const PREFIX = 'shuangpin-next:training-config:'
export const trainingConfigKey = (schemeId: string): string => `${PREFIX}${schemeId}`

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function emptyTrainingConfig(): TrainingConfigSnapshot {
  return {
    tab: 'drill',
    drillMode: 'word',
    articleInputMode: 'input',
    selectedInitials: [],
    selectedFinals: [],
    selectedZeroFinals: [],
    hiddenInitials: [],
    hiddenFinals: [],
    hiddenZeroFinals: [],
    articleHiddenInitials: [],
    articleHiddenFinals: [],
    articleHiddenZeroFinals: [],
  }
}

/** 读取并校验配置；损坏/缺省时返回 null，由页面回退到默认全选。 */
export function readTrainingConfig(
  storage: Pick<StorageLike, 'getItem'>,
  schemeId: string,
): TrainingConfigSnapshot | null {
  try {
    const raw = storage.getItem(trainingConfigKey(schemeId))
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<TrainingConfigSnapshot> | null
    if (!value || typeof value !== 'object') return null
    return {
      tab: value.tab === 'article' ? 'article' : 'drill',
      drillMode: value.drillMode === 'char' ? 'char' : 'word',
      articleInputMode: value.articleInputMode === 'import' ? 'import' : 'input',
      selectedInitials: strings(value.selectedInitials),
      selectedFinals: strings(value.selectedFinals),
      selectedZeroFinals: strings(value.selectedZeroFinals),
      hiddenInitials: strings(value.hiddenInitials),
      hiddenFinals: strings(value.hiddenFinals),
      hiddenZeroFinals: strings(value.hiddenZeroFinals),
      articleHiddenInitials: strings(value.articleHiddenInitials),
      articleHiddenFinals: strings(value.articleHiddenFinals),
      articleHiddenZeroFinals: strings(value.articleHiddenZeroFinals),
    }
  } catch {
    return null
  }
}

/** 写入失败（隐私模式/配额）静默忽略，不影响训练。 */
export function writeTrainingConfig(
  storage: StorageLike,
  schemeId: string,
  snapshot: TrainingConfigSnapshot,
): boolean {
  try {
    storage.setItem(trainingConfigKey(schemeId), JSON.stringify(snapshot))
    return true
  } catch {
    return false
  }
}
