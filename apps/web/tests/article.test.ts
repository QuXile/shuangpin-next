import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createSchemeEngine, type SchemeDef } from '@shuangpin/core'
import { buildArticlePractice } from '../src/lib/article.ts'

const scheme = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../data/schemes/xiaohe/scheme.json', import.meta.url)), 'utf8'),
) as SchemeDef
const engine = createSchemeEngine(scheme)

describe('buildArticlePractice · 文章 → 逐字练习词', () => {
  it('按上下文解析多音字并保持行内顺序', async () => {
    const practice = await buildArticlePractice(engine, '银行行长')
    expect(practice.words.map((word) => word.text)).toEqual(['银', '行', '行', '长'])
    expect(practice.words.map((word) => word.syllables[0]?.pinyin)).toEqual([
      'yin',
      'hang',
      'hang',
      'zhang',
    ])
    expect(practice.plan.skipped).toBe(0)
  })

  it('读音无法解析的汉字标记为跳过', async () => {
    const practice = await buildArticlePractice(engine, '嗯好')
    expect(practice.words.map((word) => word.text)).toEqual(['好'])
    expect(practice.plan.skipped).toBe(1)
  })
})
