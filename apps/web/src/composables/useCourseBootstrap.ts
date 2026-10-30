/**
 * 应用数据引导：single-flight 调用 course.init()，组件只读取 status/error。
 * 多组件同时调用不会重复请求（store 内部去重）。
 */
import { computed, onMounted, type ComputedRef } from 'vue'
import { useCourseStore } from '@/stores/course'

export interface CourseBootstrap {
  status: ComputedRef<'idle' | 'loading' | 'ready' | 'error'>
  error: ComputedRef<string>
  ready: ComputedRef<boolean>
  init: () => Promise<void>
  retry: () => Promise<void>
}

export function useCourseBootstrap(): CourseBootstrap {
  const course = useCourseStore()
  onMounted(() => {
    void course.init()
  })
  return {
    status: computed(() => course.status),
    error: computed(() => course.error),
    ready: computed(() => course.ready),
    init: () => course.init(),
    retry: () => course.init(),
  }
}
