/**
 * 数据加载层：读取 apps/web/public/data/（由 scripts/sync-data.mjs 从根 data/ 生成）。
 *
 * 运行时文件：
 *   index.json             方案索引（SchemeIndexFile）
 *   schemes/<id>.json      SchemeDef
 *   curriculum/<id>.json   仅 5 套定制课程的源数据
 *   lexicon/lexicon.json   词表（构建期预解析的紧凑格式，运行时只解码）
 *
 * 其余方案的课程由 buildUniversalCurriculum(scheme) 在内存中生成。
 *
 * 约定：同一数据只加载一次；加载失败不缓存 rejected Promise，允许重试。
 */
import type {
  Curriculum,
  ResolvedLexicon,
  SchemeDef,
  SchemeIndexFile,
  StoredCurriculum,
} from '@shuangpin/core'
import { buildUniversalCurriculum, createSchemeEngine, freeAtomIdsOf, hydrateCurriculum } from '@shuangpin/core'
import { decodeRuntimeLexicon, type RuntimeLexiconFile } from './lexicon'

/** 词表：构建期已解析拼音，运行时只把紧凑格式解码成运行时词表 */
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
    return hydrateCurriculum(id, source, freeAtomIdsOf(createSchemeEngine(scheme)))
  })

/** 词表：课程、入门课与练习场共用；浏览器只做紧凑格式解码（不再调用 pinyin-pro）。 */
export const loadLexicon = (): Promise<LexiconFile> =>
  cached('lexicon', async () =>
    decodeRuntimeLexicon(await getJSON<RuntimeLexiconFile>('lexicon/lexicon.json')),
  )
