/**
 * 数据加载层：读取 apps/web/public/data/（由 scripts/sync-data.mjs 从根 data/ 生成）。
 *
 * 运行时文件：
 *   index.json             方案索引（SchemeIndexFile）
 *   schemes/<id>.json      SchemeDef
 *   curriculum/<id>.json   仅 5 套定制课程的源数据
 *   lexicon/lexicon.json   词表（entries + 音节示例，拼音运行时解析）
 *
 * 其余方案的课程由 buildUniversalCurriculum(scheme) 在内存中生成。
 *
 * 约定：同一数据只加载一次；加载失败不缓存 rejected Promise，允许重试。
 */
import type {
  Curriculum,
  Lexicon,
  ResolvedLexicon,
  SchemeDef,
  SchemeIndexFile,
  StoredCurriculum,
} from '@shuangpin/core'
import { buildUniversalCurriculum, hydrateCurriculum } from '@shuangpin/core'
import { resolveLexicon } from './lexicon'

/** 词表：磁盘只存词条与词频，加载时由 pinyin-pro 解析成运行时词表 */
export type LexiconFile = ResolvedLexicon

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

/** 方案索引：默认方案、推荐顺序、19 套方案与有定制课程的方案 id。 */
export const loadIndex = (): Promise<SchemeIndexFile> =>
  cached('index', () => getJSON<SchemeIndexFile>('index.json'))

/** 单个方案的键位定义。 */
export const loadScheme = (id: string): Promise<SchemeDef> =>
  cached(`scheme:${id}`, () => getJSON<SchemeDef>(`schemes/${id}.json`))

/**
 * 课程：定制方案读取 curriculum/<id>.json 并补齐运行期字段；
 * 其余方案按 scheme.json 直接生成通用课程。
 */
export const loadCurriculum = (
  id: string,
  scheme: SchemeDef,
  custom: boolean,
): Promise<Curriculum> =>
  cached(`curriculum:${id}`, async () => {
    if (!custom) return buildUniversalCurriculum(scheme)
    const source = await getJSON<StoredCurriculum>(`curriculum/${id}.json`)
    return hydrateCurriculum(id, source)
  })

/** 词库源 JSON（只加载一次；解析拼音由需要词表三件套的页面触发）。 */
const loadLexiconSource = (): Promise<Lexicon> =>
  cached('lexicon-source', () => getJSON<Lexicon>('lexicon/lexicon.json'))

/** 词库元信息：只需展示规模时用，避免提前加载 pinyin-pro 与解析全量词条。 */
export interface LexiconMeta {
  wordCount: number
}

export const loadLexiconMeta = (): Promise<LexiconMeta> =>
  cached('lexicon-meta', async () => {
    const source = await loadLexiconSource()
    return { wordCount: source.entries.filter((entry) => entry.text.length >= 2).length }
  })

/** 词表：课程、入门课与练习场共用；拼音在加载时解析。 */
export const loadLexicon = (): Promise<LexiconFile> =>
  cached('lexicon', async () => resolveLexicon(await loadLexiconSource()))
