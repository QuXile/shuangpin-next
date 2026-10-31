import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
  }
}

// 常规部署使用 history 路径；可下载静态包使用 hash 路径，避免依赖服务器做
// SPA fallback，也允许静态包被放到任意目录下访问。
const history =
  import.meta.env.VITE_ROUTER_MODE === 'hash'
    ? createWebHashHistory()
    : createWebHistory(import.meta.env.BASE_URL)

const router = createRouter({
  history,
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
