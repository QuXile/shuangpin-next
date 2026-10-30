/**
 * 课程备注与技巧内容库（人工整理 + 方案动态生成）。
 *
 * 内容依据（调研结论见 docs/ARCHITECTURE.md「教学备注来源」）：
 * 1) 脚手架式学习：先看提示建立「声母键+韵母键」映射，再逐步撤提示（shuangpin.xyz）；
 * 2) 字组结合：把键位与打出来的字绑定（oroc.top 七日上手双拼）；
 * 3) 口诀/规律：单韵母键不变、o 结尾同键、en/eng 与 an/ang 相邻、zh/ch/sh 占低频键（cnblogs / php.cn）；
 * 4) 主动回忆与 5-5 原则：卡壳先想 5 秒再看图，慢打 3 遍；漏洞表格（oroc.top）；
 * 5) 分层训练与盲打：基准键 → 多字母韵母 → 真实语境；先准确后速度（php.cn）；
 * 6) 速度预期：1-2 周熟悉，2 周左右 60 字/分，靠真实使用巩固（3dmgame / 输入法社区）。
 *
 * 说明：本模块只负责「文案组装」。键位、锚点字/词由 build-curriculum.mjs 依据
 * scheme 数据与 data/words/anchors.json 生成后传入 ctx。
 */

// ── 通用练习方法（跨方案、与键位无关） ──────────────────────

const METHOD_TIPS = {
  intro: [
    '不用先背整张键位图：先看提示打对，再逐步撤掉提示即可。',
    '目标不是速度，而是看到字能稳定拆出「声母键 + 韵母键」。',
  ],
  drill: [
    '把键位和字绑在一起记（字组结合），比背字母表牢固。',
    '忘记键位时先想 5 秒，再看键位图，然后把这一键慢打 3 遍。',
    '先准确后速度：连续两轮全对，再试着提速。',
  ],
  review: [
    '先回忆再落指：看到拼音先在心里说出两键，再按键。',
    '错得多的音节单独慢打 3 遍，比整段重刷更有效。',
  ],
  mixed: [
    '混合练习检验「看字 → 两键」的反射；准确率优先于速度。',
    '卡壳时先回忆 5 秒再看提示，把卡住的拼音记进“漏洞表”。',
  ],
  speed: [
    '先准确后速度：连续两轮正确率 ≥95% 再冲速度。',
    '盲打是提速前提：眼睛看字，不看键盘。',
    '每天 10–15 分钟短练，再把双拼带进真实聊天/写笔记。',
  ],
  exam: [
    '全遮挡时按音节整组出键：先声母键、再韵母键，不要逐字母找。',
    '速度目标 30 字/分起；稳定比冲快更重要。',
  ],
}

// ── 韵母记忆技巧（跨方案通用 + 方案键位由 ctx 动态补充） ─────

const FINAL_NOTES = {
  ai: '双字母韵母，先念「ai」再落指：第一键是 a 键，第二键是 ai 所在键。',
  ei: '双字母韵母 ei，注意与 ai 的口型区别：ei 从 e 滑向 i。',
  ao: '双字母韵母 ao，从 a 滑向 o，口型收圆。',
  ou: '双字母韵母 ou，从 o 滑向 u，口型收小。',
  an: '前后鼻音对比：an 的 n 是舌尖抵牙龈，ang 的 ng 是舌根抬软腭；多读「担心 / 当心」。',
  en: '前后鼻音对比：en 舌尖抵牙龈，eng 舌根抬软腭；多读「盆 / 棚」。',
  ang: '前后鼻音对比：ang 的 ng 舌根抬起，口型比 an 更开。',
  eng: '前后鼻音对比：eng 舌根抬起，与 en 成对练。',
  in: '前后鼻音对比：in 舌尖抵牙龈，ing 舌根抬起；多读「金 / 京」。',
  ing: '前后鼻音对比：ing 舌根抬起收尾，与 in 成对练。',
  ia: 'i 介音韵母：先按 i 的开口，再落到 a；常与 ua 同键对照。',
  ua: 'u 介音韵母：先圆唇 u，再落到 a；常与 ia 同键对照。',
  iao: 'iao = i + ao，先 i 再 a 再收 o，按两键即可。',
  ian: 'ian = i + an，注意与 iang 的前后鼻音区别。',
  iang: 'iang 后鼻音，舌根抬起收尾；常与 uang 同键。',
  uang: 'uang 后鼻音，注意与 uan 的前后鼻音区别；常与 iang 同键。',
  uai: 'uai 从 u 滑向 ai，口型由圆到开。',
  uan: 'uan 注意与 uang 的前后鼻音区别。',
  uo: 'uo 从 u 滑向 o、口型由圆到开；它与 ou（o→u）方向相反，注意别混。',
  ou_extra: 'ou 与 uo 容易混：ou 是 o→u（口型收小），uo 是 u→o（口型放开）。',
  ong: 'ong 后鼻音，圆唇；常与 iong 同键对照。',
  iong: 'iong 只出现在 j/q/x/y 等少数声母后（jiong/qiong/xiong/yong）。',
  ui: 'ui = uei 的缩写：先按 u，再按 ui 所在键。',
  un: 'un = uen 的缩写：先按 u，再按 un 所在键。',
  ue: 'üe 有两种拼写：j/q/x/y 后写作 ue，n/l 后写作 ve；多数方案同键。',
  ve: 'üe 的 ve 拼写（n/l 后）：略 lüè、女 nǚ 的 ü 都走方案 ü 键。',
  v: 'n/l 后的 ü 使用方案 ü 键；j/q/x/y 后的 ü 写作 u，直接按 U 键。',
}

// ── 声母技巧 ─────────────────────────────────────────────────

const INITIAL_NOTES = {
  zh: '翘舌三定：zh / ch / sh 被放在三个低频键上；本方案 zh = {zhKey}。',
  ch: '翘舌三定：zh / ch / sh 被放在三个低频键上；本方案 ch = {chKey}。',
  sh: '翘舌三定：zh / ch / sh 被放在三个低频键上；本方案 sh = {shKey}。',
}

// ── 家族/章节技巧 ────────────────────────────────────────────

const FAMILY_NOTES = {
  'a-open': 'a 开口组（ai/ao/an/ang）先练熟，再进入带 i/u 介音的复合韵母。',
  a: 'a 家族：先开口后介音；an/ang、iang/uang 注意前后鼻音与同键对照。',
  o: 'o 家族：o 与 uo 通常同键；ong/iong 同键，记「松 sōng / 穷 qióng」。',
  e: 'e 家族：en/eng 前后鼻音对比；er 是零声母，单独成音。',
  i: 'i 家族：in/ing 前后鼻音对比；ie 与 iu 注意口型收放。',
  u: 'u 家族：ui/un 是 uei/uen 的缩写；ü 组注意 ue/ve 两种拼写。',
  'u-ü': 'u 与 ü 家族：ui/un 是缩写；üe 有 ue / ve 两种拼写，n/l 后的 ü 用方案 ü 键。',
  all: '全部知识点混合：先求准确，再求速度；卡住的音节记入漏洞表。',
}

const CHAPTER_NOTES = {
  'ch-intro': '双拼不是新拼音：每个字固定「声母键 + 韵母键」两下。',
  'ch-basic': '改造声母 + 零声母全表：常规声母键位不变，只有 zh/ch/sh 需要改造；12 个零声母音节在 L2.4 一次看全。',
  'ch-a': 'a 家族韵母最多，分成「开口组」和「介音组」两段学。',
  'ch-o': 'o 家族只有 4 个韵母，重点是 o/uo 与 ong/iong 的同键关系。',
  'ch-mid': '期中检验：把前四章的声母、零声母与 a/o 家族混合起来，先准确后速度。',
  'ch-e': 'e 家族先练 en/eng 前后鼻音，再复习整条家族。',
  'ch-i': 'i 家族完成后，27 个韵母只剩 u/ü 一组。',
  'ch-u': 'u/ü 家族收尾：ui/un 缩写、üe 两种拼写。',
  'ch-sprint': '综合冲刺：全量混合与速度训练，把准确率带进真实输入节奏。',
  'ch-exam': '通关考核：全遮挡 + 限时，稳定比冲快更重要。',
}

const KIND_LABEL = {
  intro: '入门',
  drill: '新授课',
  review: '复习课',
  exam: '考核课',
}

// ── 工具 ─────────────────────────────────────────────────────

function uniqueStrings(items) {
  const seen = new Set()
  const out = []
  for (const item of items) {
    if (typeof item !== 'string') continue
    const text = item.trim()
    if (!text || seen.has(text)) continue
    seen.add(text)
    out.push(text)
  }
  return out
}

function upperKeys(value) {
  const list = Array.isArray(value) ? value : (value?.keys ?? [])
  return list.map((key) => String(key).toUpperCase()).join('/')
}

function fmtSyllable(syllable) {
  return String(syllable).toUpperCase()
}

/** 零声母全表文案：一次列出本方案 12 个零声母音节的两键映射（字母式 / o+ 式自动适配）。 */
function zeroTableTip(scheme, zeroStyle) {
  const order = ['a', 'ai', 'an', 'ang', 'ao', 'e', 'ei', 'en', 'eng', 'er', 'o', 'ou']
  const items = order.map((syllable) => {
    const keys = (scheme.zeroInitial?.[syllable] ?? []).join('').toUpperCase() || '（缺）'
    return `${syllable} = ${keys}`
  })
  return `零声母 12 音映射（${zeroStyle === 'o-prefix' ? 'O + 韵母键' : '按方案整段键位'}）：${items.join('、')}。`
}

/** 同键对照文案：找到与 focus 韵母共用键位的其它韵母及其首次课程。 */
function sameKeyTips(ctx) {
  const { scheme, focusFinals, atomLessonIds = new Map(), lesson } = ctx
  const tips = []
  const finals = scheme.finals ?? {}
  for (const final of focusFinals) {
    const keys = finals[final] ?? []
    const partners = []
    for (const [other, otherKeys] of Object.entries(finals)) {
      if (other === final) continue
      if (!otherKeys.some((key) => keys.includes(key))) continue
      partners.push({ final: other, lessonId: atomLessonIds.get(`final:${other}`) })
    }
    if (partners.length === 0) continue
    const keyText = keys.map((key) => key.toUpperCase()).join('/')
    for (const partner of partners) {
      if (partner.lessonId === lesson.id) {
        tips.push(`同键对照：${keyText} 键同时是 ${final} / ${partner.final}，本课一起对比学。`)
      } else if (partner.lessonId) {
        tips.push(`同键提示：${keyText} 键同时是 ${final} / ${partner.final}；${partner.final} 在 ${partner.lessonId} 学。`)
      } else {
        tips.push(`同键提示：${keyText} 键同时是 ${final} / ${partner.final}。`)
      }
    }
  }
  return tips
}

/** 多个新 focus 共用同一键时的核心对照文案（优先于普通同键提示）。 */
function pairTip(ctx) {
  const { scheme, focusFinals } = ctx
  if (focusFinals.length < 2) return null
  const finals = scheme.finals ?? {}
  // 找出 focus 中第一对共享键位的韵母（兼容同键多韵与多键韵母；不要求整个 focus 共用一键）。
  for (let i = 0; i < focusFinals.length; i += 1) {
    for (let j = i + 1; j < focusFinals.length; j += 1) {
      const left = focusFinals[i]
      const right = focusFinals[j]
      const leftKeys = (finals[left] ?? []).map((key) => String(key).toLowerCase())
      const rightKeys = (finals[right] ?? []).map((key) => String(key).toLowerCase())
      const shared = leftKeys.find((key) => rightKeys.includes(key))
      if (!shared) continue
      const example = ctx.pairExamples?.[`${left}/${right}`]
      const suffix = example ? `，记「${example}」` : ''
      return `同键双韵：${shared.toUpperCase()} 键同时是 ${left} / ${right}；一个键记两个韵母${suffix}。`
    }
  }
  return null
}

/** 零声母示例文案（家族复习课展示本家族零声母）。 */
function zeroExamplesTip(ctx) {
  const { lesson, scheme } = ctx
  const examples = lesson.zeroExamples ?? []
  if (examples.length === 0) return []
  const items = examples
    .slice(0, 6)
    .map((example) => `${example.syllable} = ${(scheme.zeroInitial?.[example.syllable] ?? []).join('').toUpperCase()}`)
  const suffix = examples.length > 6 ? ' 等' : ''
  return [`本课零声母：${items.join('、')}${suffix}（没有声母的音节也要按满两键）。`]
}

// ── 主入口 ───────────────────────────────────────────────────

/**
 * 生成一节课的备注/技巧（3–4 条，去重保序）。
 *
 * @param {object} ctx
 * @param {object} ctx.lesson        课程（含 id/kind/chapterId/reviewFamily/focusAtoms/atomMeta/zeroExamples）
 * @param {object} ctx.scheme        方案 JSON
 * @param {'letter'|'o-prefix'} ctx.zeroStyle
 * @param {Map<string,string>} ctx.atomLessonIds  原子 → 首次出现的课程 id
 * @param {string[]} ctx.focusFinals / ctx.focusInitials / ctx.focusZeros
 * @param {string[]} ctx.newBlockingAtoms 本课新授阻塞原子
 * @param {boolean} [ctx.zeroTable] 是否零声母全表课（L2.4）
 * @param {boolean} [ctx.cumulative] 是否累计混合/速度课
 * @param {boolean} [ctx.firstPractice] 是否首课（合并 jqxy ü + 多音字提示）
 * @param {Record<string,string>} [ctx.pairExamples] 同键双韵例词（builder 由 words.sample 高频词生成）
 */
export function buildLessonTips(ctx) {
  const { lesson, scheme } = ctx
  const tips = []
  const kind = lesson.kind
  const isMixed = lesson.reviewFamily === 'all' || ctx.cumulative === true
  const isSpeed = lesson.passCriteria?.mode === 'speed'
  const methodKey = kind === 'intro'
    ? 'intro'
    : kind === 'exam'
      ? 'exam'
      : isSpeed
        ? 'speed'
        : isMixed
          ? 'mixed'
          : kind === 'review'
            ? 'review'
            : 'drill'

  if (kind === 'intro') {
    tips.push(...METHOD_TIPS.intro)
    return uniqueStrings(tips)
  }

  if (kind === 'drill') {
    // 新授课：以「本课新键怎么记」为主；首课额外合并 jqxy ü 与多音字提示。
    if (ctx.firstPractice) {
      tips.push('遇到多音字按词语读音取键；j/q/x/y 后的 ü 写作 u，仍按 U 键（如「去」= QU）。')
    }
    const pair = pairTip(ctx)
    if (pair) {
      tips.push(pair)
    } else {
      const sameKey = sameKeyTips(ctx)
      if (sameKey.length > 0) tips.push(sameKey[0])
    }

    // 单个新键：给一条本家族的发音/对比技巧；同键双韵课由 pairTip 覆盖，不再重复。
    if (!pair) {
      const initial = ctx.focusInitials[0]
      const initialNote = initial ? INITIAL_NOTES[initial] : null
      if (initialNote) {
        const keys = {
          zhKey: upperKeys(scheme.initials?.zh),
          chKey: upperKeys(scheme.initials?.ch),
          shKey: upperKeys(scheme.initials?.sh),
        }
        tips.push(initialNote.replace('{zhKey}', keys.zhKey).replace('{chKey}', keys.chKey).replace('{shKey}', keys.shKey))
      }
      if (ctx.focusFinals.includes('v')) {
        tips.push(FINAL_NOTES.v)
      } else {
        const final = ctx.focusFinals[0]
        const finalNote = final ? FINAL_NOTES[final] : null
        if (finalNote && !initialNote) tips.push(finalNote)
      }
    }

    if (ctx.zeroTable) tips.push(zeroTableTip(scheme, ctx.zeroStyle))
    else tips.push(...zeroExamplesTip(ctx))

    // 章节氛围只在新课、且本轮还没有同类提示时补一条
    if (!pair && tips.length < 2 && CHAPTER_NOTES[lesson.chapterId]) {
      tips.push(CHAPTER_NOTES[lesson.chapterId])
    }

    for (const method of METHOD_TIPS.drill) {
      if (tips.length >= 3) break
      tips.push(method)
    }
    return uniqueStrings(tips).slice(0, ctx.firstPractice ? 4 : 3)
  }

  // 复习 / 考核：以家族说明、零声母示例和练习方法为主，不再重复基础键位讲解。
  const familyNote = lesson.reviewFamily ? FAMILY_NOTES[lesson.reviewFamily] : null
  if (familyNote) tips.push(familyNote)
  tips.push(...zeroExamplesTip(ctx))

  const methods = METHOD_TIPS[methodKey] ?? METHOD_TIPS.review
  for (const method of methods) {
    if (tips.length >= 4) break
    tips.push(method)
  }
  if (isSpeed) tips.push('速度按「正确字数 / 用时」计算：先保证每个字两键都对，再压缩时间。')
  if (kind === 'exam') tips.push('第三颗星要求全程不揭示答案：不确定时宁可放慢。')
  return uniqueStrings(tips).slice(0, 4)
}

export { KIND_LABEL, METHOD_TIPS, FAMILY_NOTES, CHAPTER_NOTES }
