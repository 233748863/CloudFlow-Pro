import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import MainLayout from '@/layouts/MainLayout.vue'
import MobileLayout from '@/layouts/MobileLayout.vue'
import AuthPage from '@/pages/AuthPage.vue'
import DashboardPage from '@/pages/DashboardPage.vue'
import MobileDashboardPage from '@/pages/MobileDashboardPage.vue'
import PlaceholderPage from '@/pages/PlaceholderPage.vue'
import AttendanceRule from '@/pages/admin/attendance/AttendanceRule.vue'
import NotFoundPage from '@/pages/NotFoundPage.vue'
import ServiceUnavailablePage from '@/pages/ServiceUnavailablePage.vue'
import ForbiddenPage from '@/pages/ForbiddenPage.vue'
import ServerErrorPage from '@/pages/ServerErrorPage.vue'
import ChunkLoadErrorPage from '@/pages/ChunkLoadErrorPage.vue'
import { useAuthStore } from '@/stores/auth'
import { useNavigationStore } from '@/stores/navigation'
import { desktopRouteCatalog, mobileRouteCatalog, type CloudFlowRouteMeta } from './routeCatalog'
import { isMobileDevice } from '@/utils/device'
import { resolveDocumentTitle } from '@/router/title'
import { useRoutePrefetch } from '@/composables/useRoutePrefetch'

const resolveComponent = (meta: CloudFlowRouteMeta) => {
  if (meta.path === '/' || meta.path === '/dashboard') {
    return meta.mobile ? MobileDashboardPage : DashboardPage
  }
  if (meta.path === '/hr/attendance/rule') return AttendanceRule
  return PlaceholderPage
}

const buildChildRoutes = (catalog: CloudFlowRouteMeta[]): RouteRecordRaw[] =>
  catalog.map((item) => {
    if (item.redirect) {
      return {
        path: item.path,
        redirect: item.redirect,
        meta: {
          title: item.title,
          source: item.source,
          requiresAuth: true,
          permissions: item.permissions || []
        }
      }
    }

    return {
      path: item.path,
      component: resolveComponent(item),
      meta: {
        title: item.title,
        source: item.source,
        requiresAuth: true,
        permissions: item.permissions || []
      }
    }
  })

const usingMobileRoutes = isMobileDevice()

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    component: AuthPage,
    meta: {
      title: '登录',
      requiresAuth: false
    }
  },
  {
    path: '/register',
    component: AuthPage,
    meta: {
      title: '注册',
      requiresAuth: false
    }
  },
  {
    path: '/503',
    component: ServiceUnavailablePage,
    meta: {
      title: '服务不可用',
      requiresAuth: false
    }
  },
  {
    path: '/403',
    component: ForbiddenPage,
    meta: {
      title: '权限不足',
      requiresAuth: false
    }
  },
  {
    path: '/500',
    component: ServerErrorPage,
    meta: {
      title: '页面运行异常',
      requiresAuth: false
    }
  },
  {
    path: '/load-error',
    component: ChunkLoadErrorPage,
    meta: {
      title: '资源加载失败',
      requiresAuth: false
    }
  },
  {
    path: '/',
    component: usingMobileRoutes ? MobileLayout : MainLayout,
    meta: {
      requiresAuth: true
    },
    children: buildChildRoutes(usingMobileRoutes ? mobileRouteCatalog : desktopRouteCatalog)
  },
  {
    path: '/:pathMatch(.*)*',
    component: NotFoundPage,
    meta: {
      title: '页面不存在',
      requiresAuth: false
    }
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition || { top: 0 }
  }
})

let authInitialized = false
const routePrefetch = useRoutePrefetch(router)

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  const navigation = useNavigationStore()
  navigation.start()

  if (!authInitialized) {
    authInitialized = true
    await auth.init()
  }

  document.title = resolveDocumentTitle(to.meta.title)

  const requiresAuth = to.meta.requiresAuth !== false
  if (!requiresAuth) {
    if (auth.isAuthenticated && (to.path === '/login' || to.path === '/register')) {
      return '/'
    }
    return true
  }

  if (!auth.isAuthenticated) {
    return {
      path: '/login',
      query: { redirect: to.fullPath }
    }
  }

  const permissions = (to.meta.permissions || []) as string[]
  if (permissions.length > 0 && !permissions.some((permission) => auth.hasPermission(permission))) {
    return {
      path: '/403',
      query: { redirect: to.fullPath }
    }
  }

  return true
})

router.afterEach((to) => {
  useNavigationStore().done()
  routePrefetch.triggerPrefetch(to)
})

router.onError((error) => {
  useNavigationStore().done()
  const isChunkLoadError =
    error.message?.includes('Failed to fetch dynamically imported module') ||
    error.message?.includes('Loading chunk') ||
    error.message?.includes('Loading CSS chunk') ||
    error.name === 'ChunkLoadError'

  if (isChunkLoadError) {
    const reloadKey = 'chunk_reload_attempted'
    const lastReload = sessionStorage.getItem(reloadKey)
    const now = Date.now()
    if (!lastReload || now - Number(lastReload) > 10000) {
      sessionStorage.setItem(reloadKey, String(now))
      window.location.reload()
      return
    }
    router.replace(`/load-error?redirect=${encodeURIComponent(router.currentRoute.value.fullPath)}`)
    return
  }

  router.replace(
    `/500?message=${encodeURIComponent(error.message || '页面运行时出现异常')}&redirect=${encodeURIComponent(router.currentRoute.value.fullPath)}`
  )
})

export default router
