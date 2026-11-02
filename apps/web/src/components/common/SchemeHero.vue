<script setup lang="ts">
/**
 * Hero 区统一组合：课程地图与练习场共用。
 * 英文眉题 + 中文标语 + Hero 键帽 + 方案选择，全部走现有共享原语。
 */
import { computed, ref } from 'vue'
import type { SchemeDef } from '@shuangpin/core'
import type { SchemeOption } from '@/stores/course'
import HeroLayout from '@/components/common/HeroLayout.vue'
import SchemeKeycaps from '@/components/keyboard/SchemeKeycaps.vue'
import SchemeSelector from '@/components/keyboard/SchemeSelector.vue'

const props = withDefaults(
  defineProps<{
    eyebrow: string
    titleLines: readonly string[]
    keycapText: string
    schemeOptions: readonly SchemeOption[]
    schemeId: string
    scheme?: SchemeDef | null
    primarySchemeIds?: readonly string[]
    busy?: boolean
    singleRow?: boolean
    showSelector?: boolean
  }>(),
  {
    scheme: null,
    primarySchemeIds: () => [],
    busy: false,
    singleRow: false,
    showSelector: true,
  },
)

const emit = defineEmits<{
  'change-scheme': [id: string]
}>()

const keycapsRef = ref<InstanceType<typeof SchemeKeycaps> | null>(null)
const selectorVisible = computed(() => props.showSelector && props.schemeOptions.length > 0)

function selectScheme(id: string): void {
  // 重复点击同一个方案重新随机排布；切换方案交给 SchemeKeycaps 的 watch。
  if (id === props.schemeId) keycapsRef.value?.refreshKeycaps()
  else emit('change-scheme', id)
}

defineExpose({ selectScheme })
</script>

<template>
  <HeroLayout>
    <template #eyebrow>
      <span class="eyebrow">{{ eyebrow }}</span>
    </template>
    <template #title>
      <h1>
        <template v-for="(line, index) in titleLines" :key="line">
          {{ line }}<br v-if="index < titleLines.length - 1" />
        </template>
      </h1>
    </template>
    <template #visual>
      <SchemeKeycaps
        v-if="scheme"
        ref="keycapsRef"
        :scheme="scheme"
        :text="keycapText"
        :single-row="singleRow"
      />
    </template>
    <template #bottom>
      <SchemeSelector
        v-if="selectorVisible"
        :options="schemeOptions"
        :primary-ids="primarySchemeIds"
        :model-value="schemeId"
        :busy="busy"
        show-keys
        @select="selectScheme"
      />
    </template>
  </HeroLayout>
</template>
