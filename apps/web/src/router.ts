import { createRouter, createWebHistory } from 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'map',
      component: () => import('./pages/LearnMapPage.vue'),
      meta: { title: '学习路线' },
    },
    {
      path: '/training',
      name: 'training',
      component: () => import('./pages/TrainingPage.vue'),
      meta: { title: '练习' },
    },
    {
      path: '/practice/:lessonId',
      name: 'practice',
      component: () => import('./pages/PracticePage.vue'),
      meta: { title: '练习' },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: (to, _from, savedPosition) => {
    // 学习地图由页面自身记忆/恢复滚动位置（按方案记忆）；其它页面正常置顶/恢复
    if (to.path === '/') return false
    return savedPosition ?? { top: 0 }
  },
})

router.afterEach((to) => {
  const base = '双拼 NEXT'
  document.title = to.meta.title ? `${to.meta.title} · ${base}` : base
})

export default router
