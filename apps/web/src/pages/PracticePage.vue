<script setup lang="ts">
/**
 * 练习页（容器）：只做状态分支与子组件编排；阶段状态机在 usePractice，规则全部在 core。
 */
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import IntroLesson from '@/components/intro/IntroLesson.vue'
import StateCard from '@/components/common/StateCard.vue'
import KeyboardDock from '@/components/keyboard/KeyboardDock.vue'
import PracticeToolbar from '@/components/practice/PracticeToolbar.vue'
import PracticeStream from '@/components/practice/PracticeStream.vue'
import TutorialStage from '@/components/practice/TutorialStage.vue'
import { usePractice } from '@/composables/usePractice'
const router = useRouter()
const practice = usePractice()
const {
  status,
  errorMessage,
  lesson,
  lessonOrder,
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
  focusBadge,
  notes,
  tier,
  conceal,
  stageTitleText,
  gateHint,
  endPrompt,
  liveMessage,
  progressLabel,
  cpm,
  keyMapRows,
  highlightAtomIds,
  specialInitials,
  pressedKeys,
  showDock,
  primary,
  retryStage,
  previousStage,
  continuePractice,
  handleBackspace,
  onIntroFinished,
  onIntroRevealKeymap,
  onIntroHideKeymap,
} = practice
const { goNext, handleKey, startFirstStage, showPressed } = practice

const introRef = ref<InstanceType<typeof IntroLesson> | null>(null)
function onKeymapKey(letter: string): void {
  showPressed(letter)
  if (isIntro.value) {
    introRef.value?.pressKey(letter)
    return
  }
  if (stage.value !== 'tutorial') handleKey(letter)
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
</script>

<template>
  <div class="practice-page" :class="{ 'has-dock': showDock, 'is-tutorial': stage === 'tutorial' && !isIntro }">
    <StateCard v-if="status === 'loading'" loading message="正在准备课程…" />
    <StateCard
      v-else-if="status === 'error'"
      title="无法开始练习"
      :message="errorMessage"
    >
      <button class="btn btn--primary" type="button" @click="onExit">
        返回学习路线
        <kbd>Esc</kbd>
      </button>
    </StateCard>

    <template v-else-if="isIntro">
      <div class="practice-scroll thin-scroll intro-scroll">
        <IntroLesson
          v-if="scheme && lesson"
          ref="introRef"
          :scheme="scheme"
          :words="introWords"
          @finished="onIntroFinished"
          @next="goNext"
          @exit="onExit"
          @reveal-keymap="onIntroRevealKeymap"
          @hide-keymap="onIntroHideKeymap"
          @key-pressed="showPressed"
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
        <PracticeToolbar
          :title="stageTitleText"
          :progress-label="progressLabel"
          :gate-hint="gateHint"
          :cpm="cpm"
          :primary-label="primary?.label ?? '下一阶段'"
          :primary-enabled="primary?.enabled ?? false"
          @previous="previousStage"
          @retry="retryStage"
          @primary="primary?.run()"
        />

        <PracticeStream
          v-if="session"
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
          @continue="continuePractice"
          @restart="retryStage"
        />
      </div>
    </template>

    <KeyboardDock
      v-if="showDock"
      :rows="keyMapRows"
      :highlight-atom-ids="stage === 'tutorial' || stage === 'single' ? highlightAtomIds : []"
      :special-initials="specialInitials"
      :pressed="pressedKeys"
      :conceal="conceal"
      @key="onKeymapKey"
      @backspace="onDockBackspace"
    />
  </div>
</template>

<style scoped>
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
  overscroll-behavior: contain;
  padding: 16px 20px 28px;
}
.intro-scroll { padding: 8px 20px 20px; }
.practice-stage {
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding: 16px 20px 0;
  display: flex;
  flex-direction: column;
}
.practice-inner {
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
}
@media (min-width: 1200px) {
  .practice-inner { width: 1080px; }
}
.practice-page.is-tutorial .practice-scroll { overflow: hidden; }
.practice-page.is-tutorial .practice-inner {
  height: 100%;
  display: flex;
  flex-direction: column;
}
@media (max-width: 640px) {
  .practice-scroll { padding: 10px 12px 18px; }
  .intro-scroll { padding: 10px 12px 16px; }
  .practice-stage { padding: 10px 12px 0; }
}
</style>
