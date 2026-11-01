<script setup lang="ts">
/**
 * 入门课「认识双拼」：5 步讲解 + 试打。
 * - 试打复用 core createSession/applyKey/backspace（不再写第二套判题）；
 * - 所有键位/改造声母/韵母/零声母示例都从 engine/scheme 动态生成，不写死方案；
 * - 完成试打 emit('finished') 由页面记录通过，emit('next') 进入第 1 课。
 */
import { computed, ref, shallowRef } from 'vue'
import {
  applyKey,
  backspace,
  clearInput,
  buildPracticeWord,
  createSchemeEngine,
  createSession,
  type PracticeWord,
  type SchemeDef,
  type SessionState,
  type WordEntry,
} from '@shuangpin/core'
import PracticeStream from '@/components/practice/PracticeStream.vue'
import SessionBar from '@/components/layout/SessionBar.vue'
import { useGlobalKeys, type KeyBinding } from '@/composables/useGlobalKeys'
import { useSoundStore } from '@/stores/sound'

const props = withDefaults(
  defineProps<{
    scheme: SchemeDef
    words: WordEntry[]
    /** 以前已通过入门课：不再要求重做最后的试打 */
    passed?: boolean
  }>(),
  { passed: false },
)

const emit = defineEmits<{
  finished: []
  next: []
  'key-pressed': [key: string]
}>()

const sound = useSoundStore()

type Step = 'concept' | 'principle' | 'schemes' | 'overlap' | 'try'
const stepOrder: readonly Step[] = ['concept', 'schemes', 'principle', 'overlap', 'try']
const step = ref<Step>('concept')

const engine = createSchemeEngine(props.scheme)
const diff = engine.diff()

// ── 动态方案文案 ──────────────────────────────────────────────
const conceptWord = '双'
const conceptKeys = ['s', 'h', 'u', 'a', 'n', 'g']
const shuangKeys = engine.primarySequence({ initial: 'sh', final: 'uang' }).map((key) => key.toUpperCase())
const shKey = shuangKeys[0] ?? '?'
const uangKey = shuangKeys[1] ?? '?'
const learnInitialsText = diff.learnInitials.join(' / ')
const freeInitialsText = diff.freeInitials.join('、')
const freeFinalsText = diff.freeFinals.join('、')

/** 五套原生课程方案的最大差异；不用键位细节淹没初学者。 */
const schemeGuide = [
  {
    id: 'xiaohe',
    name: '小鹤双拼',
    origin: '何海峰设计，2007 年定稿',
    feature: '左右手较均衡，学习曲线平缓，教程和社区资料在这一代方案里最丰富。',
    advanced: '可继续学「鹤形」辅助码，用于减少候选；纯双拼阶段不强制。',
    fit: '想要资料多、上手稳，之后可能继续进阶的人',
  },
  {
    id: 'ziranma',
    name: '自然码',
    origin: '周志农设计，前身是 1986 年的「金奖智能码」',
    feature: '不是单纯的「自然码双拼」，完整形态是「音码为主、形码为辅」；双拼部分影响深远，键位与微软双拼很接近。',
    advanced: '完整自然码可加形码辅助，按「先定音、后定形」筛选候选；本课只教双拼部分。',
    fit: '想理解双拼历史、使用经典布局的人',
  },
  {
    id: 'weiruan',
    name: '微软双拼',
    origin: '1994 年获授权使用，方案源自自然码',
    feature: 'Windows 自带，跨机器和跨输入法的兼容面最广；ing 在分号键，零声母用 O。',
    advanced: '系统自带方案通常没有形码辅助，胜在随处可用。',
    fit: '不想安装第三方输入法、经常换电脑的人',
  },
  {
    id: 'sougou',
    name: '搜狗双拼',
    origin: '搜狗输入法内置的双拼方案',
    feature: '主流第三方输入法的常用方案，键位接近微软；支持全拼 / 双拼混输，日常切换成本低。',
    advanced: '一般不带形码辅助，适合先把双拼练成日常输入习惯。',
    fit: '平时就用搜狗、希望换设备也能快速用起来的人',
  },
  {
    id: 'zhinengabc',
    name: '智能 ABC',
    origin: '朱守涛 1995 年开发，曾随 Windows 简体中文版捆绑',
    feature: '一代人熟悉的系统内置方案；双拼键位与现在的主流方案差异最大，新资料相对少。',
    advanced: 'Windows 10 及之后不再预装；如果只为沿用旧习惯，它仍然有意义。',
    fit: '已经熟悉智能 ABC，或想沿用旧习惯的人',
  },
] as const

/** 当前方案在五套课程方案里的说明（入门课只在课程方案中出现）。 */
const currentGuide = schemeGuide.find((item) => item.id === props.scheme.id) ?? null

// ── 键位图读法：全部从当前方案推导，不写死方案细节 ─────────────
const learnInitialsCount = diff.learnInitials.length
const learnFinalsCount = diff.learnFinals.length
const freeInitialsCount = diff.freeInitials.length
const freeFinalsCount = diff.freeFinals.length
/** 方案里的韵母键总数（键位图橘色部分，含沿用全拼的单键韵母）。 */
const totalFinalsCount = Object.keys(props.scheme.finals).length
const freeZeroCount = diff.freeZero.length
const freeZeroText = diff.freeZero.join('、')
/** 方案数据里的零声母总数（当前五套课程方案都是 12）。 */
const zeroTotal = Object.keys(props.scheme.zeroInitial).length

/** 同一键位同时承载「改造声母 + 韵母」的示例（多数方案是 V 键），用于解释键位图叠层。 */
const dualKey = (() => {
  const learnInitialSet = new Set(diff.learnInitials)
  const learnFinalSet = new Set(diff.learnFinals)
  for (const row of engine.keyMap()) {
    for (const key of row) {
      let initial: string | null = null
      let final: string | null = null
      for (const atomId of key.atomIds) {
        const [type, name] = atomId.split(':')
        if (type === 'initial' && learnInitialSet.has(name)) initial = name
        else if (type === 'final' && learnFinalSet.has(name) && !final) final = name
      }
      if (initial && final) return { letter: key.letter.toUpperCase(), initial, final }
    }
  }
  return null
})()
const dualKeyText = dualKey
  ? `${dualKey.letter} 键同时挂「${dualKey.initial}」声母和「${dualKey.final}」韵母——看图时认颜色和上下位置。`
  : '声母键和韵母键用不同颜色标出，看图时认颜色即可。'

/** 零声母示例：本方案第一个零声母音节的固定两键。 */
const zeroExample = (() => {
  const [name, keys] = Object.entries(props.scheme.zeroInitial)[0] ?? []
  const upperKeys = (keys ?? []).map((key) => key.toUpperCase())
  return name && upperKeys.length > 0 ? { name, keys: upperKeys } : null
})()
const zeroSentence = zeroExample
  ? `「零 ${zeroExample.name}」写作 ${zeroExample.keys.join(' + ')}`
  : '每个零声母都有固定两键'

// ── 试打（core session） ─────────────────────────────────────
const trialWord = computed<PracticeWord | null>(() => {
  const entry = props.words.find((word) => word.text === '双拼') ?? props.words.find((word) => word.text.length === 2)
  return entry ? buildPracticeWord(engine, entry) : null
})

const session = shallowRef<SessionState | null>(null)
const wrongInputs = ref<ReadonlyMap<string, string[]>>(new Map())
const revealed = ref<ReadonlySet<string>>(new Set())
/** 每字错误次数（UI 记录，第 3 次错误揭示答案） */
const cellErrors = ref<ReadonlyMap<string, number>>(new Map())

const currentCellKey = computed(() => {
  const state = session.value
  if (!state || state.phase === 'finished') return null
  return `0:${state.words[0]?.charIndex ?? 0}`
})
const hasInputError = computed(() => {
  const key = currentCellKey.value
  return Boolean(key && wrongInputs.value.has(key))
})

const completed = computed(() => session.value?.phase === 'finished')

function resetTry(): void {
  const word = trialWord.value
  if (!word) {
    session.value = null
    return
  }
  session.value = createSession({ words: [word], now: performance.now() })
  wrongInputs.value = new Map()
  revealed.value = new Set()
  cellErrors.value = new Map()
}
function handleKey(raw: string): void {
  if (step.value !== 'try') {
    emit('key-pressed', raw)
    sound.playKey()
    return
  }
  const state = session.value
  if (!state || state.phase === 'finished') {
    // 试打完成后仍保留键位图反馈，不能只有退格有声音。
    emit('key-pressed', raw)
    sound.playKey()
    return
  }
  const charIndex = state.words[0]?.charIndex ?? 0
  const cellKey = `0:${charIndex}`
  emit('key-pressed', raw)
  const result = applyKey(state, raw, performance.now())
  if (result.feedback.kind === 'wrong') {
    sound.playError()
    const nextWrong = new Map(wrongInputs.value)
    nextWrong.set(cellKey, result.feedback.input ?? [])
    wrongInputs.value = nextWrong
    const nextErrors = new Map(cellErrors.value)
    const errorCount = (nextErrors.get(cellKey) ?? 0) + 1
    nextErrors.set(cellKey, errorCount)
    cellErrors.value = nextErrors
    if (errorCount >= 3 && !revealed.value.has(cellKey)) {
      const nextRevealed = new Set(revealed.value)
      nextRevealed.add(cellKey)
      revealed.value = nextRevealed
    }
  } else if (
    (result.feedback.kind === 'char-complete' || result.feedback.kind === 'word-complete') &&
    wrongInputs.value.has(cellKey)
  ) {
    const nextWrong = new Map(wrongInputs.value)
    nextWrong.delete(cellKey)
    wrongInputs.value = nextWrong
  }
  if (result.feedback.kind !== 'wrong') {
    if (result.state.phase === 'finished' || result.feedback.kind === 'word-complete') {
      sound.playComplete()
    } else {
      sound.playKey()
    }
  }
  session.value = result.state
  if (result.state.phase === 'finished') emit('finished')
}

function handleBackspace(): void {
  emit('key-pressed', 'backspace')
  sound.playKey()
  if (step.value !== 'try') return
  if (!session.value || session.value.phase === 'finished') return
  const cellKey = currentCellKey.value
  if (cellKey && wrongInputs.value.has(cellKey)) {
    const nextWrong = new Map(wrongInputs.value)
    nextWrong.delete(cellKey)
    wrongInputs.value = nextWrong
  }
  session.value = backspace(session.value)
}

/** 空格 / Enter：清空当前字输入并取消红色错误状态 */
function clearCurrentInput(): void {
  if (step.value !== 'try') return
  if (!session.value || session.value.phase === 'finished') return
  sound.playKey()
  const cellKey = currentCellKey.value
  if (cellKey && wrongInputs.value.has(cellKey)) {
    const nextWrong = new Map(wrongInputs.value)
    nextWrong.delete(cellKey)
    wrongInputs.value = nextWrong
  }
  session.value = clearInput(session.value)
}

// ── 步骤推进 ─────────────────────────────────────────────────
const stepIndex = computed(() => stepOrder.indexOf(step.value) + 1)
const canPrevious = computed(() => step.value !== 'concept')
const nextDisabled = computed(() => step.value === 'try' && !completed.value && !props.passed)
const nextLabel = computed(() => (step.value === 'try' ? '开始第 1 课' : '下一页'))

function advance(): void {
  if (step.value === 'concept') {
    step.value = 'schemes'
    return
  }
  if (step.value === 'schemes') {
    step.value = 'principle'
    return
  }
  if (step.value === 'principle') {
    step.value = 'overlap'
    return
  }
  if (step.value === 'overlap') {
    step.value = 'try'
    resetTry()
  }
}

function previous(): void {
  if (step.value === 'schemes') {
    step.value = 'concept'
    return
  }
  if (step.value === 'principle') {
    step.value = 'schemes'
    return
  }
  if (step.value === 'overlap') {
    step.value = 'principle'
    return
  }
  if (step.value === 'try') {
    step.value = 'overlap'
    resetTry()
  }
}

function primaryAction(): void {
  if (step.value !== 'try') {
    advance()
    return
  }
  if (completed.value || props.passed) emit('next')
}

const bindings = computed<KeyBinding[]>(() => {
  const list: KeyBinding[] = [
    {
      key: 'Enter',
      when: (event) =>
        !(event.target instanceof HTMLButtonElement) &&
        step.value === 'try' &&
        hasInputError.value,
      run: () => clearCurrentInput(),
    },
    {
      key: 'Enter',
      when: (event) => !(event.target instanceof HTMLButtonElement),
      run: () => primaryAction(),
    },
    { key: 'ArrowLeft', alt: true, run: () => previous() },
  ]
  // 键位图从第一页起常驻；非试打步骤也显示按键按下反馈
  list.push(
    {
      letter: true,
      run: (event) => {
        if (step.value === 'try') handleKey(event.key)
        else {
          emit('key-pressed', event.key)
          sound.playKey()
        }
      },
    },
    {
      key: 'Backspace',
      // 非试打页也要有敲击声与键位图反馈；handleBackspace 内部已按步骤分支处理。
      run: () => handleBackspace(),
    },
  )
  if (step.value === 'try') {
    list.push({ key: ' ', when: () => hasInputError.value, run: () => clearCurrentInput() })
  }
  return list
})
useGlobalKeys(bindings)

defineExpose({ pressKey: handleKey, backspace: handleBackspace })
</script>

<template>
  <div class="intro-page">
    <SessionBar :success="completed && step === 'try'">
      <template #left>
        <button class="session-btn" type="button" :disabled="!canPrevious" @click="previous">
          <svg class="icon session-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19.5 12h-15" /><path d="m10.5 6-6 6 6 6" />
          </svg>
          上一页
          <kbd>Alt+←</kbd>
        </button>
      </template>

      <span class="session-item">第 {{ String(stepIndex).padStart(2, '0') }} / {{ String(stepOrder.length).padStart(2, '0') }} 页</span>

      <template #right>
        <button
          class="btn btn--primary session-primary"
          type="button"
          :disabled="nextDisabled"
          @click="primaryAction"
        >
          {{ nextLabel }}
          <kbd>Enter</kbd>
        </button>
      </template>
    </SessionBar>

    <section v-if="step === 'concept'" class="intro-card">
      <div class="eyebrow intro-kicker">01 · 全拼</div>
      <h1>全拼要按很多下</h1>
      <div class="intro-grid">
        <div class="intro-visual">
          <div class="visual-word">{{ conceptWord }}</div>
          <div class="full-keycaps">
            <span v-for="letter in conceptKeys" :key="letter" class="visual-key">{{ letter }}</span>
          </div>
          <div class="mono visual-caption">shuang · 6 键</div>
        </div>
        <div class="intro-prose">
          <p>全拼输入时，每个字母都要单独按一下。「双」的拼音 <b>shuang</b> 要依次按 s、h、u、a、n、g 六个键；zhuang、chuang 这类长音节同样要跑 5–6 下。</p>
          <p>拼音越长，手指在键盘上来回移动越多，长句输入容易被「打字的动作」打断。</p>
          <p>双拼不改拼音，只改按键方式：把声母和韵母各压缩到一个键上。于是每个汉字固定两键，音节越长优势越明显，输入节奏也更连贯。</p>
          <p>所以入门课要学的不是新拼音，而是「哪个声母在哪个键、哪个韵母在哪个键」——这也是后面几页要解决的问题。</p>
        </div>
      </div>
    </section>

    <section v-else-if="step === 'schemes'" class="intro-card intro-card--schemes">
      <div class="eyebrow intro-kicker">02 · 方案</div>
      <h1>找到属于自己的双拼方案</h1>
      <div class="scheme-guide">
        <article
          v-for="item in schemeGuide"
          :key="item.id"
          class="scheme-guide-card"
          :class="{ 'is-current': item.id === scheme.id }"
        >
          <div class="scheme-guide-head">
            <div>
              <strong>{{ item.name }}</strong>
              <span class="scheme-guide-origin">{{ item.origin }}</span>
            </div>
            <span v-if="item.id === scheme.id" class="count-badge">当前</span>
          </div>
          <p>{{ item.feature }}</p>
          <p class="scheme-guide-advanced">{{ item.advanced }}</p>
          <span class="scheme-guide-fit">适合：{{ item.fit }}</span>
        </article>
        <article class="scheme-guide-card scheme-guide-more">
          <div class="scheme-guide-heart" aria-hidden="true">✦</div>
          <strong>还有更多</strong>
          <p>尽情探索键位差异，找到自己最喜欢、最适合的一套。这里先了解五套主流方案，剩下的交给你的手感。</p>
          <span class="scheme-guide-fit">选定后，课程与练习场都会使用同一套方案。</span>
        </article>
      </div>
      <div class="scheme-choose">
        <p class="scheme-choose-title">还不确定选哪套？先看日常场景：</p>
        <ul class="scheme-choose-list">
          <li><b>不想装第三方输入法、经常换电脑</b>：微软双拼或搜狗双拼，系统和主流输入法自带，换机器最快能接着用。</li>
          <li><b>想要教程资料多、社区活跃，之后可能接触辅助码</b>：小鹤双拼或自然码，两者都有成熟的进阶路线。</li>
          <li><b>已经在用某套方案，或想沿用旧输入习惯</b>：继续用现在的就好——五套方案共用同一套课程，练习量和通过标准完全一致。</li>
        </ul>
      </div>
      <p class="scheme-guide-note">
        五套方案都有完整课程，差异主要在键位习惯、历史与辅助码生态；没有唯一正确的选择，了解差异后按自己的场景选即可，选定后先练熟一套通常比同时学几套更稳。
      </p>
      <p class="scheme-guide-current">
        当前方案：<b>{{ scheme.name }}</b><template v-if="currentGuide"> · {{ currentGuide.fit }}</template>。想换方案可在学习地图顶部切换，学习进度按方案分别保存。
      </p>
    </section>

    <section v-else-if="step === 'principle'" class="intro-card intro-card--principle">
      <div class="eyebrow intro-kicker">03 · 双拼原理</div>
      <h1>声母 + 韵母，各按一下</h1>
      <div class="intro-grid">
        <div class="intro-visual intro-visual--principle">
          <div class="visual-word">{{ conceptWord }}</div>
          <div class="split-line">
            <span class="split-part is-initial">sh</span>
            <span class="split-part is-final">uang</span>
          </div>
          <div class="mapping-cards mapping-cards--row">
            <div class="mapping-card">
              <span class="mapping-atom is-initial">sh</span>
              <span class="mapping-arrow">→</span>
              <span class="mapping-key">{{ shKey }}</span>
            </div>
            <div class="mapping-card">
              <span class="mapping-atom is-final">uang</span>
              <span class="mapping-arrow">→</span>
              <span class="mapping-key">{{ uangKey }}</span>
            </div>
          </div>
          <div class="two-key-row">
            <span class="two-key">声母键</span>
            <span class="two-plus">+</span>
            <span class="two-key">韵母键</span>
            <span class="two-equals">=</span>
            <strong>固定 2 键</strong>
          </div>
        </div>
        <div class="intro-prose">
          <p>每个音节都能拆成「声母 + 韵母」。双拼把声母和韵母各压到一个键，所以无论拼音多长都只按两下。在当前方案「{{ scheme.name }}」里，「双」就是 sh（<b>{{ shKey }}</b>）+ uang（<b>{{ uangKey }}</b>）。</p>
          <p>键位图常驻在页面底部（<kbd>Ctrl+K</kbd> 可显隐），它的作用是查键而不是背表：在当前方案里，蓝色是 {{ learnInitialsCount }} 个改造声母（{{ learnInitialsText }}）；橘色列出全部 {{ totalFinalsCount }} 个韵母键，其中 {{ learnFinalsCount }} 个需要重新记。{{ dualKeyText }}</p>
          <p>零声母音节没有声母，同样固定两键：在「{{ scheme.name }}」里，{{ zeroSentence }}；全部 {{ zeroTotal }} 个零声母音节会在「声母与零声母」章用一课一次学完。</p>
        </div>
      </div>
    </section>

    <section v-else-if="step === 'overlap'" class="intro-card">
      <div class="eyebrow intro-kicker">04 · 全拼沿用</div>
      <h1>双拼没有推翻你会的全拼</h1>
      <div class="intro-grid">
        <div class="overlap-board">
          <div class="overlap-row">
            <span class="overlap-pill" title="未改造声母继续沿用全拼键位">声母沿用</span>
            <div class="overlap-keys">
              <span v-for="key in diff.freeInitials" :key="key">{{ key }}</span>
            </div>
          </div>
          <div v-if="freeFinalsCount > 0" class="overlap-row">
            <span class="overlap-pill" title="单键韵母继续沿用全拼键位">韵母沿用</span>
            <div class="overlap-keys">
              <span v-for="key in diff.freeFinals" :key="key">{{ key }}</span>
            </div>
          </div>
          <div class="overlap-note">
            以上 {{ freeInitialsCount + freeFinalsCount }} 个键位和全拼一致，不需要重新记。
          </div>
        </div>
        <div class="intro-prose">
          <p>你不需要把全拼忘掉。在「{{ scheme.name }}」里，除了 {{ learnInitialsText }} 这 {{ learnInitialsCount }} 个改造声母，其余 {{ freeInitialsCount }} 个声母都保持原来的字母键位，全拼的肌肉记忆可以直接复用。</p>
          <p>韵母里 {{ freeFinalsText }} 这 {{ freeFinalsCount }} 个也和全拼单键一致<template v-if="freeZeroCount > 0">；零声母还有 {{ freeZeroCount }} 个音节（{{ freeZeroText }}）的按键序列与全拼写法相同</template>——这些都不用额外练习。</p>
          <p>真正要重记的，只有 {{ learnInitialsText }} 这 {{ learnInitialsCount }} 个改造声母和 {{ learnFinalsCount }} 个复韵母 / 鼻韵母键位——它们会被压缩到单键上，也是后续课程的主要内容。</p>
          <p>所以入门课更像一次「查缺补漏」：先确认哪些键和全拼完全一样，再把注意力放在真正变化的部分。全拼能力不是要克服的旧习惯，而是这套双拼的底座。</p>
        </div>
      </div>
    </section>

    <section v-else class="intro-card intro-card--try">
      <div class="eyebrow intro-kicker">05 · 试一下</div>
      <h1>看键位图，打出「{{ trialWord?.text ?? '双拼' }}」</h1>
      <div class="intro-grid intro-grid--try">
        <div v-if="session" class="try-stream">
          <PracticeStream
            :session="session"
            mode="grid"
            :tier="3"
            :wrong-inputs="wrongInputs"
            :revealed="revealed"
          />
        </div>
        <div class="intro-prose">
          <p>每个字固定两键：先声母、后韵母。目标键已经隐藏，去页面底部的键位图里找；键位图可以用 <kbd>Ctrl+K</kbd> 随时显隐。</p>
          <p>打错时这个字会变红并锁住：按退格逐键撤销，或按空格 / Enter 一次清空重来；同一个字错满 3 次会直接揭示答案。</p>
          <p class="try-tip">不需要提前背键位：按下的键会在键位图上亮起，把「{{ trialWord?.chars[0] ?? '双' }}」＝{{ trialWord?.syllables[0]?.caps.map((cap) => cap.key.toUpperCase()).join(' + ') ?? `${shKey} + ${uangKey}` }} 这样的组合和字形一起记，比背整张表更牢。</p>
          <p v-if="wrongInputs.size > 0 && !completed" class="try-bad">
            {{ revealed.size > 0 ? '已显示答案，照着键位图完成这个字。' : '键位不对，同一个字第 3 次错误会显示答案。' }}
          </p>
          <p v-else-if="completed" class="try-ok">「{{ trialWord?.text ?? '双拼' }}」完成。</p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.intro-page {
  width: 100%;
  max-width: 1080px;
  height: 100%;
  min-height: 0;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
}
/* 桌面：卡片撑满可用高度，内容从顶部开始（键位图从第一页起就固定在底部） */
.intro-card {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  padding: 28px 40px;
  border-radius: var(--r-xl);
  border: 1px solid var(--line);
  background: var(--surface);
  box-shadow: var(--shadow-md);
  animation: ui-fade-up 260ms var(--ease);
}
.intro-kicker {
  margin: 0;
}
.intro-card h1 {
  margin: 8px 0 22px;
  color: var(--ink);
  font-size: clamp(28px, 2.4vw, 36px);
  font-weight: 800;
  letter-spacing: -0.035em;
  line-height: 1.2;
}
.intro-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
  gap: clamp(24px, 3.4vw, 48px);
  align-items: center;
}
.intro-visual {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 20px;
  border-radius: var(--r-lg);
  border: 1px solid var(--line-faint);
  background: var(--surface-2);
}
/* 原理页合并键位图后内容更多：收紧留白，让拆分、映射、公式一屏读完 */
.intro-visual--principle {
  gap: 10px;
  padding: 18px 16px;
}
.intro-visual--principle .visual-word {
  font-size: clamp(48px, 4.8vw, 64px);
}
.visual-word {
  color: var(--ink);
  font-size: clamp(64px, 6.6vw, 88px);
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: -0.03em;
}
.full-keycaps {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}
.visual-key {
  width: 38px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: var(--r-control);
  border: 1px solid var(--line-strong);
  border-bottom-width: 3px;
  background: var(--surface);
  color: var(--ink-2);
  font-family: var(--font-mono);
  font-size: 16px;
  font-weight: 700;
  box-shadow: var(--shadow-sm);
}
.visual-caption {
  color: var(--ink-3);
  font-size: var(--text-sm);
}
.split-line {
  display: flex;
  gap: 10px;
}
.split-part {
  padding: 7px 15px;
  border-radius: var(--r-control);
  font-family: var(--font-mono);
  font-size: 24px;
  font-weight: 700;
}
.split-part.is-initial,
.mapping-atom.is-initial {
  color: var(--focus-initial);
  background: color-mix(in srgb, var(--focus-initial) 11%, transparent);
}
.split-part.is-final,
.mapping-atom.is-final {
  color: var(--focus-final);
  background: color-mix(in srgb, var(--focus-final) 13%, transparent);
}
.two-key-row {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--ink-3);
  font-size: var(--text-sm);
}
.two-key {
  padding: 5px 11px;
  border-radius: var(--r-control);
  border: 1px dashed var(--line-strong);
}
.two-key-row strong {
  color: var(--brand-ink);
}
.mapping-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: stretch;
}
.mapping-cards--row {
  flex-direction: row;
  align-items: stretch;
  width: 100%;
}
.mapping-cards--row .mapping-card {
  flex: 1;
  gap: 8px;
  padding: 10px 8px;
}
.mapping-cards--row .mapping-atom {
  font-size: 14px;
}
.mapping-cards--row .mapping-key {
  min-width: 30px;
  height: 30px;
  font-size: 15px;
}
.mapping-card {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 18px;
  border-radius: var(--r-lg);
  border: 1px solid var(--line-faint);
  background: var(--surface-2);
}
.mapping-atom {
  padding: 5px 10px;
  border-radius: var(--r-control);
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 700;
}
.mapping-arrow {
  color: var(--ink-4);
}
.mapping-key {
  min-width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: var(--r-control);
  border: 1px solid var(--line-strong);
  border-bottom-width: 3px;
  background: var(--surface);
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 800;
  box-shadow: var(--shadow-sm);
}
.intro-prose {
  color: var(--ink-2);
  font-size: 14px;
  line-height: 1.95;
}
.intro-prose p + p {
  margin-top: 9px;
}
.intro-card--schemes {
  gap: 14px;
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
}
.intro-card--principle {
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  padding-top: 20px;
  padding-bottom: 20px;
}
.intro-card--principle h1 {
  margin-bottom: 14px;
}
.intro-card--principle .intro-grid {
  gap: clamp(20px, 2.8vw, 34px);
}
.intro-card--principle .intro-visual--principle {
  gap: 8px;
  padding: 14px 12px;
}
.scheme-choose {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border-radius: var(--r-md);
  border: 1px solid var(--line-faint);
  background: var(--surface-2);
}
.scheme-choose-title {
  margin: 0;
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.5;
}
.scheme-choose-list {
  margin: 0;
  padding-left: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--ink-3);
  font-size: 11.5px;
  line-height: 1.65;
}
.scheme-choose-list b {
  color: var(--ink-2);
  font-weight: 650;
}
.scheme-guide-current {
  margin: 0;
  color: var(--ink-3);
  font-size: 11.5px;
  line-height: 1.7;
}
.scheme-guide-current b {
  color: var(--brand-ink);
  font-weight: 750;
}
.scheme-guide {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.scheme-guide-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--line-faint);
  border-radius: var(--r-md);
  background: var(--surface-2);
}
.scheme-guide-card.is-current {
  border-color: var(--brand-line);
  background: var(--brand-soft);
  box-shadow: 0 0 0 2px var(--brand-soft);
}
.scheme-guide-more {
  justify-content: center;
  border-style: dashed;
  background: color-mix(in srgb, var(--surface) 70%, transparent);
}
.scheme-guide-more strong {
  color: var(--brand-ink);
  font-size: 14px;
}
.scheme-guide-heart {
  color: var(--brand);
  font-size: 20px;
  line-height: 1;
}
.scheme-guide-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.scheme-guide-head > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.scheme-guide-head strong {
  color: var(--ink);
  font-size: 14px;
  line-height: 1.3;
}
.scheme-guide-origin {
  color: var(--ink-4);
  font-size: 10px;
  line-height: 1.4;
}
.scheme-guide-card p {
  margin: 0;
  color: var(--ink-3);
  font-size: 12px;
  line-height: 1.6;
}
.scheme-guide-card .scheme-guide-advanced {
  color: var(--ink-4);
  font-size: 11px;
}
.scheme-guide-fit {
  margin-top: auto;
  color: var(--ink-4);
  font-size: 10.5px;
  line-height: 1.5;
}
.scheme-guide-note {
  margin: 0;
  color: var(--ink-3);
  font-size: 12px;
  line-height: 1.7;
}
.overlap-board {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
  border-radius: var(--r-lg);
  border: 1px solid var(--line-faint);
  background: var(--surface-2);
}
.overlap-row {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.overlap-pill {
  display: inline-flex;
  width: fit-content;
  align-self: flex-start;
  align-items: center;
  padding: 3px 9px;
  border-radius: var(--r-pill);
  background: var(--brand-soft);
  color: var(--brand-ink);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.02em;
}
.overlap-keys {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.overlap-keys span {
  min-width: 30px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: var(--r-control);
  border: 1px solid var(--line-strong);
  border-bottom-width: 2px;
  background: var(--surface);
  color: var(--ink-2);
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 700;
}
.overlap-note {
  padding-top: 10px;
  border-top: 1px dashed var(--line-faint);
  color: var(--ink-3);
  font-size: var(--text-sm);
}
.intro-grid--try {
  grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr);
  align-items: start;
}
.intro-grid--try .intro-prose {
  padding-top: 20px;
}
.intro-card--try {
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
}
.try-stream {
  display: flex;
  width: 100%;
  min-height: 250px;
  height: clamp(250px, 28vh, 340px);
  min-width: 0;
}
.try-tip {
  color: var(--ink-3);
  font-size: var(--text-sm);
  line-height: 1.7;
}
.try-bad {
  color: var(--danger);
  font-weight: 650;
}
.try-ok {
  color: var(--success-strong);
  font-weight: 650;
}
@media (max-width: 900px) {
  .intro-card {
    padding: 26px 28px;
  }
  .intro-grid {
    gap: 22px;
  }
}
@media (max-width: 760px) {
  /* 移动端恢复自然高度，交给页面滚动 */
  .intro-page {
    height: auto;
    min-height: 0;
  }
  .intro-card {
    flex: none;
    padding: 20px 16px;
  }
  .intro-card h1 {
    margin: 6px 0 16px;
    font-size: 26px;
  }
  .intro-grid,
  .intro-grid--try {
    grid-template-columns: 1fr;
    gap: 16px;
  }
  .scheme-guide {
    grid-template-columns: 1fr;
  }
  .intro-visual {
    padding: 18px 14px;
  }
  .visual-word {
    font-size: 64px;
  }
  .try-stream {
    height: auto;
    min-height: 330px;
  }
}
</style>
