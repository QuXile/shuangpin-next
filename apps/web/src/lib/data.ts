/**
 * 数据加载层：读取 apps/web/public/data/（由 scripts/sync-data.mjs 从根 data/ 生成）。
 * - 同一数据只加载一次；
 * - 加载失败不缓存 rejected Promise，允许重试；
 * - 类型全部来自 @shuangpin/core 的数据文件契约。
 */
import type {
  Curriculum,
  PoolExample,
  SchemeDef,
  SchemeIndexFile,
  WordEntry,
} from '@shuangpin/core'

export interface SchemePackageManifest {
  schemaVersion: number
  id: string
  name: string
  version: string
  license: string
  capabilities: {
    course: boolean
    training: boolean
    article: boolean
    zeroInitial: boolean
    customStages: boolean
  }
  curriculum: { profile: string; version: string; file: string } | null
  data: { scheme: string }
  shared: { lexicon?: string; pools?: string; words?: string; training?: string }
}

const cache = new Map<string, Promise<unknown>>()

async function getJSON<T>(relPath: string): Promise<T> {
  const url = `${import.meta.env.BASE_URL}data/${relPath}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`加载数据失败：${relPath}（HTTP ${response.status}）`)
  }
  return (await response.json()) as T
}

function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit) return hit as Promise<T>
  const promise = loader().catch((error: unknown) => {
    cache.delete(key)
    throw error
  })
  cache.set(key, promise)
  return promise
}

export const loadSchemeIndex = (): Promise<SchemeIndexFile> =>
  cached('schemes-index', () => getJSON<SchemeIndexFile>('packages/index.json'))

export const loadScheme = (id: string): Promise<SchemeDef> =>
  cached(`scheme:${id}`, () => getJSON<SchemeDef>(`packages/${id}/scheme.json`))

export const loadCurriculum = (id: string): Promise<Curriculum> =>
  cached(`curriculum:${id}`, () => getJSON<Curriculum>(`packages/${id}/curriculum.json`))

/** 读取单个方案包的 manifest；practice-only 包读取时没有 curriculum。 */
export const loadSchemePackage = (id: string): Promise<SchemePackageManifest> =>
  cached(`package:${id}`, () => getJSON<SchemePackageManifest>(`packages/${id}/manifest.json`))

/** 统一公共词表：课程与练习场共用。 */
export interface LexiconFile {
  schemaVersion: number
  dataVersion: string
  description?: string
  source?: Record<string, string>
  words: WordEntry[]
  chars: WordEntry[]
  syllableExamples: Record<string, PoolExample>
}

export const loadLexicon = (): Promise<LexiconFile> =>
  cached('lexicon', () => getJSON<LexiconFile>('lexicon/lexicon.json'))

/** 练习场训练库（字/词，一次加载缓存） */
export interface TrainingBank {
  schemaVersion: string
  dataVersion: string
  generatedAt?: string
  description?: string
  chars: WordEntry[]
}

export interface CommonWordsFile {
  dataVersion: string
  count: number
  words: WordEntry[]
}

export const loadTrainingBank = (): Promise<TrainingBank> =>
  cached('training-bank', () => getJSON<TrainingBank>('training/bank.json'))

export const loadCommonWords = (): Promise<CommonWordsFile> =>
  cached('common-words', () => getJSON<CommonWordsFile>('words/words.sample.json'))
