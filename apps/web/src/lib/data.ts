/**
 * 数据加载层：读取 apps/web/public/data/（由 scripts/sync-data.mjs 从根 data/ 生成）。
 *
 * 运行时只读 4 类文件（单份数据）：
 *   index.json             方案索引（SchemeIndexFile）
 *   schemes/<id>.json      SchemeDef
 *   curriculum/<id>.json   Curriculum（仅课程方案有）
 *   lexicon/lexicon.json   统一词库 LexiconFile
 *
 * 约定：同一数据只加载一次；加载失败不缓存 rejected Promise，允许重试。
 */
import type {
  Curriculum,
  Lexicon,
  SchemeDef,
  SchemeIndexFile,
} from '@shuangpin/core'

/** 统一词库文件契约（与 core Lexicon 一致；buildLessonPool 只消费其中三件套） */
export type LexiconFile = Lexicon

const cache = new Map<string, Promise<unknown>>()

async function getJSON<T>(relPath: string): Promise<T> {
  const url = `${import.meta.env.BASE_URL}data/${relPath}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`加载数据失败：${relPath} HTTP ${response.status}`)
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

/** 方案索引：默认方案、推荐顺序、课程能力、19 套方案摘要。 */
export const loadIndex = (): Promise<SchemeIndexFile> =>
  cached('index', () => getJSON<SchemeIndexFile>('index.json'))

/** 单个方案的键位定义。 */
export const loadScheme = (id: string): Promise<SchemeDef> =>
  cached(`scheme:${id}`, () => getJSON<SchemeDef>(`schemes/${id}.json`))

/** 单个方案的课程数据（仅 courseSupported 方案有）。 */
export const loadCurriculum = (id: string): Promise<Curriculum> =>
  cached(`curriculum:${id}`, () => getJSON<Curriculum>(`curriculum/${id}.json`))

/** 统一词库：课程、入门课与练习场共用。 */
export const loadLexicon = (): Promise<LexiconFile> =>
  cached('lexicon', () => getJSON<LexiconFile>('lexicon/lexicon.json'))
