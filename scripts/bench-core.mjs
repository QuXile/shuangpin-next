#!/usr/bin/env node
/**
 * 领域层性能基准（Node 原生执行 TS，不依赖浏览器）。
 *
 * 用途：性能改动前后跑同一份基准，比较核心热路径的耗时，避免凭感觉优化。
 * 数据：直接读 data/ 源数据（不需要先 data:sync），词表用构建期拼音解析；
 *      因此本基准只衡量 core 算法本身，不含浏览器 JSON 解码与渲染。
 *
 * 用法：
 *   node scripts/bench-core.mjs            # 输出各基准项平均耗时
 *   node scripts/bench-core.mjs --json     # 输出 JSON（便于脚本对比）
 */
import fs from 'node:fs'
import path from 'node:path'
import { ROOT } from './lib/data-contract.mjs'
import { resolveLexicon } from './lib/pinyin-resolve.mjs'

const core = await import(new URL('../packages/core/src/index.ts', import.meta.url).href)
const selector = await import(new URL('../packages/core/src/selector.ts', import.meta.url).href)

const AS_JSON = process.argv.includes('--json')

function readDataJSON(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'))
}

/** 重复执行取平均（默认先做一次预热，避免把解析/缓存构建混入测量）。 */
function measure(label, fn, { iters = 1 } = {}) {
  fn()
  const start = performance.now()
  for (let index = 0; index < iters; index += 1) fn()
  return { label, ms: (performance.now() - start) / iters, iters }
}

function main() {
  const scheme = readDataJSON('data/schemes/xiaohe/scheme.json')
  const curriculumSource = readDataJSON('data/schemes/xiaohe/curriculum.json')
  const lexiconSource = readDataJSON('data/lexicon/lexicon.json')

  const results = []
  results.push(
    measure('词表构建期解析（全量 5 万词）', () => resolveLexicon(lexiconSource), { iters: 1 }),
  )
  const lexicon = resolveLexicon(lexiconSource)
  const engine = core.createSchemeEngine(scheme)
  const freeAtoms = core.freeAtomIdsOf(engine)
  const curriculum = core.hydrateCurriculum('xiaohe', curriculumSource, freeAtoms)
  const drillLesson = curriculum.lessons.find(
    (lesson) => lesson.kind === 'drill' && lesson.focusAtoms.length === 1,
  )
  const examLesson = curriculum.lessons.find((lesson) => lesson.kind === 'exam')
  if (!drillLesson || !examLesson) throw new Error('基准课程缺失')
  const drillPool = core.buildLessonPool(drillLesson, lexicon)
  const examPool = core.buildLessonPool(examLesson, lexicon)
  const allInitials = Object.keys(scheme.initials)
  const allFinals = Object.keys(scheme.finals)
  const allZeros = Object.keys(scheme.zeroInitial)
  const wideScope = { initials: allInitials, finals: allFinals, zeroFinals: allZeros }
  const narrowScope = { initials: ['zh'], finals: ['ong'], zeroFinals: [] }

  results.push(
    measure('createSchemeEngine', () => core.createSchemeEngine(scheme), { iters: 50 }),
    measure(
      'engine.judge × 1000（单键判题热路径）',
      () => {
        const syl = { initial: 'zh', final: 'ong' }
        for (let index = 0; index < 1000; index += 1) engine.judge('zhong', syl)
      },
      { iters: 5 },
    ),
    measure('engine.acceptedSequences × 1000', () => {
      const syl = { initial: 'zh', final: 'ong' }
      for (let index = 0; index < 1000; index += 1) engine.acceptedSequences(syl)
    }, { iters: 5 }),
    measure('engine.keyMap + diff × 100', () => {
      for (let index = 0; index < 100; index += 1) {
        engine.keyMap()
        engine.diff()
      }
    }, { iters: 5 }),
    measure('buildPracticeWord × 2000', () => {
      for (let index = 0; index < 2000; index += 1) {
        core.buildPracticeWord(engine, lexicon.words[index])
      }
    }, { iters: 3 }),
    measure(
      'buildSingleCharWords（单字 15）',
      () =>
        core.buildSingleCharWords({
          engine,
          lesson: drillLesson,
          pool: drillPool,
          learnedAtoms: drillLesson.prerequisites,
          count: 15,
          seed: 3,
        }),
      { iters: 20 },
    ),
    measure(
      'buildWordStageWords（词语 25）',
      () =>
        core.buildWordStageWords({
          engine,
          lesson: drillLesson,
          pool: drillPool,
          learnedAtoms: drillLesson.prerequisites,
          targetWords: 25,
          seed: 3,
        }),
      { iters: 10 },
    ),
    measure(
      'buildWordStageWords（通关考核 100）',
      () =>
        core.buildWordStageWords({
          engine,
          lesson: examLesson,
          pool: examPool,
          learnedAtoms: examLesson.prerequisites,
          targetWords: 100,
          seed: 3,
        }),
      { iters: 5 },
    ),
    measure(
      'selectWords（通关考核 100，直接调用）',
      () =>
        selector.selectWords({
          words: examPool.words,
          engine,
          lesson: examLesson,
          learnedAtoms: examLesson.prerequisites,
          count: 100,
          seed: 3,
        }),
      { iters: 5 },
    ),
    measure(
      'buildTutorialWords',
      () => core.buildTutorialWords({ engine, lesson: drillLesson, pool: drillPool }),
      { iters: 20 },
    ),
    measure(
      'buildLessonCodeTips（全部课程）',
      () => core.buildLessonCodeTips(engine, curriculum.lessons),
      { iters: 10 },
    ),
    measure(
      'filterTrainingEntries（全部范围）',
      () => core.filterTrainingEntries(lexicon.words, wideScope),
      { iters: 10 },
    ),
    measure(
      'filterTrainingEntries（窄范围）',
      () => core.filterTrainingEntries(lexicon.words, narrowScope),
      { iters: 10 },
    ),
    measure(
      'filterTrainingEntries（全部范围 + 焦点）',
      () => core.filterTrainingEntries(lexicon.words, wideScope, ['initial:zh']),
      { iters: 10 },
    ),
    measure(
      'buildTrainingBatch（50 词）',
      () => core.buildTrainingBatch(engine, lexicon.words, 50, 7),
      { iters: 10 },
    ),
    measure(
      'parseArticleText（约 1400 字）',
      () => core.parseArticleText('双拼学习需要耐心和持续的练习。'.repeat(60)),
      { iters: 100 },
    ),
  )

  if (AS_JSON) {
    console.log(JSON.stringify({ measuredAt: new Date().toISOString(), results }, null, 2))
    return
  }
  console.log(`== core 热路径基准（${new Date().toISOString()}）==`)
  for (const result of results) {
    console.log(`${result.label.padEnd(44)} ${result.ms.toFixed(2).padStart(9)} ms`)
  }
}

main()
