/**
 * 方案派生视图：engine / 键位图行 / 改造声母 / free 原子 / 底栏基础内容。
 *
 * 三个页面（学习地图、练习页、练习场）共用这一份派生，不再各自 createSchemeEngine / diff()。
 * 页面只负责在此之上叠加 highlight / conceal / hidden 等页面级字段。
 */
import { computed, type ComputedRef } from 'vue'
import { freeAtomIdsOf, type AtomId, type LetterKey, type SchemeDef, type SchemeEngine } from '@shuangpin/core'
import { useCourseStore } from '@/stores/course'
import type { DockContent } from '@/stores/layout'

interface SchemeView {
  scheme: ComputedRef<SchemeDef | null>
  engine: ComputedRef<SchemeEngine | null>
  /** 键位图三行布局（qwerty + 方案用到的 ';'） */
  keyMapRows: ComputedRef<LetterKey[][]>
  /** 改造声母（键位图右上角需要标注的 learn initial） */
  specialInitials: ComputedRef<string[]>
  /** 与全拼一致的 free 原子：键位图不显示这些映射 */
  freeAtomIds: ComputedRef<AtomId[]>
  /** 底栏键位图基础内容；页面在此基础上覆盖 conceal / highlightAtomIds / hiddenAtomIds 等 */
  baseDockContent: ComputedRef<DockContent>
}

export function useSchemeView(): SchemeView {
  const course = useCourseStore()
  const scheme = computed<SchemeDef | null>(() => course.scheme)
  const engine = computed<SchemeEngine | null>(() => course.engine)

  const keyMapRows = computed<LetterKey[][]>(() => engine.value?.keyMap() ?? [])

  const specialInitials = computed<string[]>(() => engine.value?.diff().learnInitials ?? [])

  const freeAtomIds = computed<AtomId[]>(() =>
    engine.value ? freeAtomIdsOf(engine.value) : [],
  )

  const baseDockContent = computed<DockContent>(() => ({
    rows: keyMapRows.value,
    schemeName: scheme.value?.name,
    specialInitials: specialInitials.value,
    zeroInitials: scheme.value?.zeroInitial,
    compatCodes: scheme.value?.compatCodes,
    freeAtomIds: freeAtomIds.value,
  }))

  return { scheme, engine, keyMapRows, specialInitials, freeAtomIds, baseDockContent }
}
