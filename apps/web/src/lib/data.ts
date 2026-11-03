/**
 * 数据加载层：读取 apps/web/public/data/（由 scripts/sync-data.mjs 从根 data/ 生成）。
 *
 * 运行时只读 4 类文件（单份数据）：
 *   index.json             方案索引（SchemeIndexFile）
 *   schemes/<id>.json      SchemeDef
 *   curriculum/<id>.json   Curriculum（仅课程方案有）
 *   lexicon/lexicon.json   词表（entries + 音节示例，拼音运行时解析）
 *
 * 约定：同一数据只加载一次；加载失败不缓存 rejected Promise，允许重试。
 */
import type {
  Curriculum,
  Lexicon,
  ResolvedLexicon,
  SchemeDef,
  SchemeIndexFile,
} from '@shuangpin/core'
import { resolveLexicon } from './lexicon'

/** 词表：磁盘只存词条与词频，加载时由 pinyin-pro 解析成运行时词表 */
export type LexiconFile = ResolvedLexicon & { dataVersion: string }

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

/** 词库源 JSON（只加载一次；解析拼音由需要词表三件套的页面触发）。 */
const loadLexiconSource = (): Promise<Lexicon> =>
  cached('lexicon-source', () => getJSON<Lexicon>('lexicon/lexicon.json'))

/** 词库元信息：只需展示规模时用，避免提前加载 pinyin-pro 与解析全量词条。 */
export interface LexiconMeta {
  wordCount: number
  dataVersion: string
}

export const loadLexiconMeta = (): Promise<LexiconMeta> =>
  cached('lexicon-meta', async () => {
    const source = await loadLexiconSource()
    return {
      wordCount: source.entries.filter((entry) => entry.text.length >= 2).length,
      dataVersion: source.dataVersion,
    }
  })

/** 词表：课程、入门课与练习场共用；拼音在加载时解析。 */
export const loadLexicon = (): Promise<LexiconFile> =>
  cached('lexicon', async () => resolveLexicon(await loadLexiconSource()))
