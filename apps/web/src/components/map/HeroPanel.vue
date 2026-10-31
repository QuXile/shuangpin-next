<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SchemeDef } from '@shuangpin/core'
import type { SchemeOption } from '@/stores/course'
import HeroLayout from '@/components/common/HeroLayout.vue'
import SchemeKeycaps from '@/components/keyboard/SchemeKeycaps.vue'
import SchemeSelector from '@/components/keyboard/SchemeSelector.vue'

const props = withDefaults(
  defineProps<{
    schemeOptions: SchemeOption[]
    primarySchemeIds?: readonly string[]
    schemeId: string
    scheme?: SchemeDef | null
    busy?: boolean
  }>(),
  { scheme: null, busy: false, primarySchemeIds: () => [] },
)

const emit = defineEmits<{
  'change-scheme': [id: string]
}>()

const schemeName = computed(
  () =>
    props.schemeOptions.find((option) => option.id === props.schemeId)?.name ??
    props.scheme?.name ??
    '双拼方案',
)

const keycapsRef = ref<InstanceType<typeof SchemeKeycaps> | null>(null)

function chooseScheme(id: string): void {
  // 重复点击同一个方案重新随机排布；切换方案交给 SchemeKeycaps 的 watch。
  if (id === props.schemeId) keycapsRef.value?.refreshKeycaps()
  else emit('change-scheme', id)
}

function pressKey(key: string): void {
  keycapsRef.value?.pressKey(key)
}

defineExpose({ pressKey, selectScheme: chooseScheme })
</script>

<template>
  <HeroLayout>
    <template #eyebrow>
      <span class="eyebrow">SHUANGPIN · DAILY PRACTICE</span>
    </template>
    <template #title>
      <h1>学习双拼<br />让输入成为直觉</h1>
    </template>
    <template #visual>
      <SchemeKeycaps v-if="scheme" ref="keycapsRef" :scheme="scheme" :text="schemeName" />
    </template>
    <template #bottom>
      <SchemeSelector
        :options="schemeOptions"
        :primary-ids="primarySchemeIds"
        :model-value="schemeId"
        :busy="busy"
        show-keys
        @select="chooseScheme"
      />
    </template>
  </HeroLayout>
</template>
