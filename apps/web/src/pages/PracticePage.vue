<script setup lang="ts">
/**
 * 练习页（容器）：只做状态分支与子组件编排；阶段状态机在 usePractice，规则全部在 core。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { MetricTier } from '@shuangpin/core'
import IntroLesson from '@/components/intro/IntroLesson.vue'
import StateCard from '@/components/common/StateCard.vue'
import PracticeStream from '@/components/practice/PracticeStream.vue'
import SessionSummaryCard from '@/components/practice/SessionSummaryCard.vue'
import SessionPauseOverlay from '@/components/practice/SessionPauseOverlay.vue'
import SessionBar from '@/components/layout/SessionBar.vue'
import TutorialStage from '@/components/practice/TutorialStage.vue'
import { usePractice } from '@/composables/usePractice'
import { useSchemeView } from '@/composables/useSchemeView'
import { useKeyInput } from '@/composables/useKeyInput'
import { useBottomDockContent } from '@/composables/useBottomDockContent'
import { useLayoutStore, type DockContent } from '@/stores/layout'
import { useSoundStore } from '@/stores/sound'
import { buildSessionSummary, type SessionSummary } from '@/lib/sessionSummary'
const router = useRouter()
const practice = usePractice()
const schemeView = useSchemeView()
const layout = useLayoutStore()
const sound = useSoundStore()
const {
  status,
  errorMessage,
  lesson,
  lessonOrder,
  alreadyPassed,
  isIntro,
  stage,
  session,
  revealed,
  wrongInputs,
  tutorialWords,
  scheme,
  introWords,
  focusItems,
  focusAtomIds,
  notes,
  tier,
  conceal,
  stageTitleText,
  endPrompt,
  criteriaLines,
  liveMessage,
  progressLabel,
  cpm,
  hasStarted,
  accuracyPercent,
  accuracyTier,
  speedTier,
  highlightAtomIds,
  primary,
  paused,
  retryStage,
  previousStage,
  togglePause,
  goEndlessPractice,
  handleBackspace,
  onIntroFinished,
} = practice
const { goNext, handleKey, startFirstStage } = practice

watch(
  [stageTitleText, isIntro],
  () => layout.setStageLabel(isIntro.value ? '入门课' : stageTitleText.value),
  { immediate: true },
)
onBeforeUnmount(() => {
  layout.clearStageLabel()
})

const accuracyBelowTarget = computed(() => hasStarted.value && accuracyTier.value?.min === null)
const speedBelowTarget = computed(() => hasStarted.value && speedTier.value?.min === null)

/** 暂停时的实时快照，与阶段总结卡共用统计格式。 */
const pausedSummary = computed<SessionSummary | null>(() => {
  if (!paused.value || !session.value) return null
  return buildSessionSummary(session.value, performance.now())
})

/** 答案卡徽标：复习/考核显示「含」，新学显示「新」。 */
const focusBadge = computed(() =>
  lesson.value?.kind === 'review' || lesson.value?.kind === 'exam' ? '含' : '新',
)

/** 信息栏只显示档位对应星级，不展示档位区间；只作通过底线的档位没有星级。 */
function tierStars(tier: MetricTier | null): string {
  if (!tier || tier.stars === null) return ''
  return tier.stars === 0 ? '0★' : '★'.repeat(tier.stars)
}
// 模板对同一档位要查询两次（显隐 + 文本）：只算一次，避免每次按键重复拼星星字符串。
const accuracyStars = computed(() => tierStars(accuracyTier.value))
const speedStars = computed(() => tierStars(speedTier.value))

const introRef = ref<InstanceType<typeof IntroLesson> | null>(null)
function onKeymapKey(letter: string): void {
  if (isIntro.value) {
    introRef.value?.pressKey(letter)
    return
  }
  if (stage.value === 'tutorial') {
    sound.playKey()
    return
  }
  handleKey(letter)
}
function onExit(): void {
  void router.push('/')
}
function onDockBackspace(): void {
  if (isIntro.value) {
    introRef.value?.backspace?.()
    return
  }
  handleBackspace()
}

useKeyInput((input) => {
  if (input.type === 'backspace') onDockBackspace()
  else onKeymapKey(input.key)
})


const dockContent = computed<DockContent>(() => ({
  ...schemeView.baseDockContent.value,
  highlightAtomIds: stage.value === 'tutorial' || stage.value === 'single' ? highlightAtomIds.value : [],
  conceal: conceal.value,
}))
useBottomDockContent(() => dockContent.value)
</script>

<template>
  <div class="practice-page" :class="{ 'is-tutorial': stage === 'tutorial' && !isIntro }">
    <StateCard v-if="status === 'loading'" loading message="正在准备课程…" />
    <StateCard
      v-else-if="status === 'error'"
      title="无法开始练习"
      :message="errorMessage"
    >
      <button class="btn btn--primary" type="button" @click="onExit">
        返回学习路线
        <kbd>Alt+H</kbd>
      </button>
    </StateCard>

    <template v-else-if="isIntro">
      <div class="practice-scroll thin-scroll intro-scroll">
        <IntroLesson
          v-if="scheme && lesson"
          ref="introRef"
          :scheme="scheme"
          :words="introWords"
          :passed="alreadyPassed"
          @finished="onIntroFinished"
          @next="goNext"
        />
        <StateCard v-else loading message="正在准备入门课…" />
      </div>
    </template>
    <template v-else>
      <div v-if="stage === 'tutorial'" class="practice-scroll thin-scroll">
        <div class="practice-inner">
          <TutorialStage
            v-if="lesson"
            :lesson="lesson"
            :lesson-order="lessonOrder"
            :focus-items="focusItems"
            :notes="notes"
            :examples="tutorialWords"
            :focus-atoms="focusAtomIds"
            :focus-badge="focusBadge"
            @start="startFirstStage"
          />
        </div>
      </div>

      <div v-else class="practice-stage">
        <SessionBar
          :success="primary?.enabled ?? false"
          pausable
          :paused="paused"
          @toggle-pause="togglePause"
        >
          <template #left>
            <button class="session-btn" type="button" aria-keyshortcuts="Alt+ArrowLeft" @click="previousStage">
              <svg class="icon session-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19.5 12h-15" /><path d="m10.5 6-6 6 6 6" />
              </svg>
              上一阶段
              <kbd>Alt+←</kbd>
            </button>
            <button class="session-btn" type="button" aria-keyshortcuts="Alt+Enter" @click="goEndlessPractice">
              进入练习
              <kbd>Alt+Enter</kbd>
            </button>
          </template>

          <span class="session-item">{{ progressLabel }}</span>
          <span class="session-sep" aria-hidden="true">·</span>
          <span
            v-if="hasStarted"
            class="session-item"
            :class="{ 'session-danger': accuracyBelowTarget }"
          >
            正确率 {{ accuracyPercent }}%<span
              v-if="accuracyStars"
              class="session-stars"
            >{{ accuracyStars }}</span>
          </span>
          <span v-else class="session-item">正确率 --%</span>
          <span class="session-sep" aria-hidden="true">·</span>
          <template v-if="hasStarted">
            <span
              class="session-item"
              :class="{ 'session-danger': speedBelowTarget, 'session-speed': !speedBelowTarget }"
            >
              速度 {{ cpm }} WPM<span
                v-if="speedStars"
                class="session-stars"
              >{{ speedStars }}</span>
            </span>
          </template>
          <span v-else class="session-item">速度 -- WPM</span>

          <template #right>
            <button class="session-btn" type="button" aria-keyshortcuts="Alt+R" @click="retryStage">
              重新开始
              <kbd>Alt+R</kbd>
            </button>
            <button
              class="btn btn--primary session-primary"
              type="button" aria-keyshortcuts="Enter"
              :disabled="!(primary?.enabled ?? false)"
              @click="primary?.run()"
            >
              {{ primary?.label ?? '下一阶段' }}
              <kbd>Enter</kbd>
            </button>
          </template>
        </SessionBar>

        <div class="session-stage">
          <PracticeStream
            v-if="session"
            :key="stage"
            :session="session"
            :live-message="liveMessage"
            :mode="stage === 'single' ? 'grid' : 'list'"
            :tier="tier"
            :focus-atoms="focusAtomIds"
            :focus-badge="focusBadge"
            :wrong-inputs="wrongInputs"
            :revealed="revealed"
            :prompt="endPrompt"
            @primary="primary?.run()"
            @endless="goEndlessPractice"
            @restart="retryStage"
          />

          <SessionPauseOverlay :show="Boolean(session && paused && pausedSummary)">
            <SessionSummaryCard
              v-if="paused && pausedSummary"
              mode="pause"
              :summary="pausedSummary"
              :rules="criteriaLines"
            >
              <template #actions>
                <button class="btn btn--primary" type="button" aria-keyshortcuts="Shift+Space" @click="togglePause">
                  继续练习
                  <kbd>Shift+Space</kbd>
                </button>
              </template>
            </SessionSummaryCard>
          </SessionPauseOverlay>
        </div>
      </div>
    </template>

  </div>
</template>

<style scoped>
.session-stars {
  margin-left: 4px;
  color: var(--star);
  font-weight: 800;
  letter-spacing: 0.02em;
}
.practice-page {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.practice-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
  padding: 16px var(--page-pad-x) 28px;
}
.intro-scroll { padding: 16px var(--page-pad-x) 24px; }
.practice-stage {
  flex: 1;
  min-height: 0;
  width: 100%;
  /* 媒体查询外保持内容区 1080（与教学页 / 入门课一致），padding 走 28/16 节奏 */
  max-width: calc(var(--content-narrow) + 2 * var(--page-pad-x));
  margin: 0 auto;
  padding: 16px var(--page-pad-x) 0;
  display: flex;
  flex-direction: column;
}
.practice-inner {
  width: 100%;
  max-width: var(--content-narrow);
  margin: 0 auto;
}
@media (min-width: 1280px) {
  .practice-inner { width: var(--content-narrow); }
}
.practice-page.is-tutorial .practice-scroll { overflow: hidden; padding-bottom: 16px; }
.practice-page.is-tutorial .practice-inner {
  height: 100%;
  display: flex;
  flex-direction: column;
}
@media (max-width: 640px) {
  .practice-scroll { padding: 12px var(--page-pad-x) 20px; }
  .intro-scroll { padding: 12px var(--page-pad-x) 18px; }
  .practice-stage { padding: 10px var(--page-pad-x) 0; }
  /* 教学页在移动端使用自然滚动，避免固定高度把示例/评分裁切 */
  .practice-page.is-tutorial .practice-scroll {
    overflow-y: auto;
    scrollbar-gutter: stable;
    overscroll-behavior: contain;
  }
  .practice-page.is-tutorial .practice-inner {
    height: auto;
    display: block;
  }
}
</style>
