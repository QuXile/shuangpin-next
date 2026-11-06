/**
 * 运行时词表编解码契约：构建期把 data/lexicon/lexicon.json 预解析成紧凑格式，
 * 浏览器只做 JSON.parse + 廉价解码，不再在运行时调用 pinyin-pro 逐词解析。
 *
 * 运行时文件（apps/web/public/data/lexicon/lexicon.json，schemaVersion 3）：
 *   meta             源数据归一化哈希 / 解析口径版本 / pinyin-pro 版本 / 规模（sync 缓存与陈旧产物检测）
 *   syllableTable    唯一 [char, pinyin, tone] 三元组；解码时按 id 共享同一音节对象
 *   entries          保持源 entries 顺序的 [freq, ...syllableId]（首项词频，其余为音节表下标，
 *                    项数 - 1 即词长）；解码按音节数分到 words / chars
 *   syllableExamples 原样透传
 *
 * 一致性契约（最高约束）：
 *   decodeRuntimeLexicon(encodeRuntimeLexicon(source)) 与 resolveLexicon(source)
 *   的 words / chars / syllableExamples 逐字段相等。编码器写完前自检一次，
 *   scripts/validate/public-data.mjs 再独立做「重建 + 往返」双重校验。
 */
import { createRequire } from 'node:module'
import { firstJSONDifference, sha256Text } from './data-contract.mjs'
import { resolveLexicon } from './pinyin-resolve.mjs'
import { decodeRuntimeLexicon } from '../../apps/web/src/lib/lexicon.ts'

/** 构建期实际使用的 pinyin-pro 版本：依赖升级后自动让 sync 缓存失效。 */
export const PINYIN_PRO_VERSION = createRequire(import.meta.url)('pinyin-pro/package.json').version

/** 运行时词表格式版本；apps/web/src/lib/lexicon.ts 里的常量必须与此一致。 */
export const RUNTIME_LEXICON_SCHEMA_VERSION = 3

/**
 * 解析 / 编码口径版本：pinyin-pro 选项、core 音节规范化或本文件编码规则变化时 +1。
 * 它写入产物 meta，使 sync 的缓存自动失效，避免复用旧口径生成的词表。
 */
export const RUNTIME_LEXICON_RESOLVER_VERSION = 1

/** 词表在 public/data 下的相对路径（与 data-contract 的产物清单一致）。 */
export const LEXICON_RUNTIME_REL_PATH = 'lexicon/lexicon.json'

/**
 * 源词表的归一化内容哈希：只取决于解析后的 JSON 内容，与源文件排版无关。
 * sync 用它判断上次产物是否还由同一份源数据生成。
 */
export function sourceHashOf(lexicon) {
  return sha256Text(JSON.stringify(lexicon))
}

/** 源数据 → 源顺序词条 + 唯一音节表（内部步骤，供 encodeRuntimeLexicon 使用）。 */
function encodeParts(lexicon, resolved) {
  // resolveLexicon 已按音节数把词条分流到 words / chars；这里按文本取回每个源词条的解析结果。
  // 数据契约要求词条文本唯一（validate/lexicon.mjs 校验）；重复文本用队列兜底以保持源顺序。
  const pending = new Map()
  for (const entry of [...resolved.words, ...resolved.chars]) {
    const queue = pending.get(entry.text)
    if (queue) queue.push(entry)
    else pending.set(entry.text, [entry])
  }

  const syllableTable = []
  const syllableIds = new Map()
  const entries = []
  for (const sourceEntry of lexicon.entries ?? []) {
    const text = String(sourceEntry.text ?? '')
    const freq = Number(sourceEntry.freq)
    // 与 resolveLexicon 的跳过条件保持一致，避免非法词条偏移后续文本队列。
    if (!text || !Number.isFinite(freq)) continue
    const entry = pending.get(text)?.shift()
    // 无法解析为本应用音节的词条：与 resolveLexicon 一样跳过。
    if (!entry) continue
    const ids = []
    for (const syllable of entry.syllables) {
      // 音节唯一键：同一 (汉字, 无声调拼音, 声调) 的规范音节字段一定相同，可安全共享。
      const key = `${syllable.text}\u0000${syllable.pinyin}\u0000${syllable.tone}`
      let id = syllableIds.get(key)
      if (id === undefined) {
        id = syllableTable.length
        syllableIds.set(key, id)
        syllableTable.push([syllable.text, syllable.pinyin, syllable.tone])
      }
      ids.push(id)
    }
    // 扁平存放：[词频, 音节下标...]；比 [freq,[ids]] 少一层数组括号，整份产物约省 0.1 MB。
    entries.push([entry.freq, ...ids])
  }
  return { syllableTable, entries }
}

/** 编码自检：解码结果必须与构建期解析逐字段一致；任何偏差都中止，不写出错误产物。 */
function verifyRuntimeLexicon(file, resolved) {
  let decoded
  try {
    decoded = decodeRuntimeLexicon(file)
  } catch (error) {
    throw new Error(`运行时词表编码自检失败：解码抛错（${error.message}）`)
  }
  for (const key of ['words', 'chars', 'syllableExamples']) {
    const difference = firstJSONDifference(resolved[key], decoded[key])
    if (difference) throw new Error(`运行时词表编码自检失败（${key}）：${difference}`)
  }
}

/**
 * 源词表 → 运行时紧凑格式（确定性输出：同一源数据总是得到相同字节）。
 * @param {object} lexicon data/lexicon/lexicon.json 的解析结果
 * @param {{ resolved?: object }} [options] 已有构建期解析结果可传入，避免重复解析（validate 复用）
 */
export function encodeRuntimeLexicon(lexicon, { resolved = resolveLexicon(lexicon) } = {}) {
  const { syllableTable, entries } = encodeParts(lexicon, resolved)
  const file = {
    schemaVersion: RUNTIME_LEXICON_SCHEMA_VERSION,
    meta: {
      sourceHash: sourceHashOf(lexicon),
      resolverVersion: RUNTIME_LEXICON_RESOLVER_VERSION,
      pinyinVersion: PINYIN_PRO_VERSION,
      wordCount: resolved.words.length,
      charCount: resolved.chars.length,
      syllableCount: syllableTable.length,
    },
    syllableTable,
    entries,
    syllableExamples: resolved.syllableExamples,
  }
  verifyRuntimeLexicon(file, resolved)
  return file
}

/** 上次产物是否可复用：格式版本、解析口径版本与源数据哈希全部一致。 */
export function isReusableRuntimeLexicon(file, lexicon) {
  return (
    file?.schemaVersion === RUNTIME_LEXICON_SCHEMA_VERSION &&
    file?.meta?.resolverVersion === RUNTIME_LEXICON_RESOLVER_VERSION &&
    file?.meta?.pinyinVersion === PINYIN_PRO_VERSION &&
    file?.meta?.sourceHash === sourceHashOf(lexicon)
  )
}
