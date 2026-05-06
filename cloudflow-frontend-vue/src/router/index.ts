import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import MainLayout from '@/layouts/MainLayout.vue'
import MobileLayout from '@/layouts/MobileLayout.vue'
import AuthPage from '@/pages/AuthPage.vue'
import DashboardPage from '@/pages/DashboardPage.vue'
import MobileDashboardPage from '@/pages/MobileDashboardPage.vue'
import SchedulePage from '@/pages/SchedulePage.vue'
import PlaceholderPage from '@/pages/PlaceholderPage.vue'
import AdminBorrowManagementPage from '@/pages/admin/AdminBorrowManagementPage.vue'
import AdminLedgerPage from '@/pages/admin/AdminLedgerPage.vue'
import AttendanceCheckIn from '@/pages/admin/attendance/AttendanceCheckIn.vue'
import AttendanceRule from '@/pages/admin/attendance/AttendanceRule.vue'
import AttendanceSupplement from '@/pages/admin/attendance/AttendanceSupplement.vue'
import OfficeAnnouncementPage from '@/pages/office/OfficeAnnouncementPage.vue'
import OfficeContactPage from '@/pages/office/OfficeContactPage.vue'
import OfficeKnowledgePage from '@/pages/office/OfficeKnowledgePage.vue'
import HrAttendanceStatisticsPage from '@/pages/hr/HrAttendanceStatisticsPage.vue'
import HrApplicationPage from '@/pages/hr/HrApplicationPage.vue'
import HrDashboardPage from '@/pages/hr/HrDashboardPage.vue'
import HrEmployeePage from '@/pages/hr/HrEmployeePage.vue'
import HrHeadcountPage from '@/pages/hr/HrHeadcountPage.vue'
import HrLifecyclePage from '@/pages/hr/HrLifecyclePage.vue'
import HrLeaveQuotaPage from '@/pages/hr/HrLeaveQuotaPage.vue'
import HrOfferPage from '@/pages/hr/HrOfferPage.vue'
import HrOrganizationPage from '@/pages/hr/HrOrganizationPage.vue'
import HrPerformancePage from '@/pages/hr/HrPerformancePage.vue'
import HrRecruitmentPage from '@/pages/hr/HrRecruitmentPage.vue'
import HrSalaryPage from '@/pages/hr/HrSalaryPage.vue'
import HrSchedulePage from '@/pages/hr/HrSchedulePage.vue'
import SystemAuditLogPage from '@/pages/system/SystemAuditLogPage.vue'
import SystemCachePage from '@/pages/system/SystemCachePage.vue'
import SystemCodeGenerationPage from '@/pages/system/SystemCodeGenerationPage.vue'
import SystemConfigPage from '@/pages/system/SystemConfigPage.vue'
import SystemDictPage from '@/pages/system/SystemDictPage.vue'
import SystemFilePage from '@/pages/system/SystemFilePage.vue'
import SystemLogPage from '@/pages/system/SystemLogPage.vue'
import SystemMenuPage from '@/pages/system/SystemMenuPage.vue'
import SystemOnlineUserPage from '@/pages/system/SystemOnlineUserPage.vue'
import SystemOrgStructurePage from '@/pages/system/SystemOrgStructurePage.vue'
import SystemPostPage from '@/pages/system/SystemPostPage.vue'
import SystemRolePage from '@/pages/system/SystemRolePage.vue'
import SystemTenantPage from '@/pages/system/SystemTenantPage.vue'
import SystemUserPage from '@/pages/system/SystemUserPage.vue'
import WorkflowAdminPage from '@/pages/workflow/WorkflowAdminPage.vue'
import NotFoundPage from '@/pages/NotFoundPage.vue'
import ServiceUnavailablePage from '@/pages/ServiceUnavailablePage.vue'
import ForbiddenPage from '@/pages/ForbiddenPage.vue'
import ServerErrorPage from '@/pages/ServerErrorPage.vue'
import ChunkLoadErrorPage from '@/pages/ChunkLoadErrorPage.vue'
import { useAuthStore } from '@/stores/auth'
import { useNavigationStore } from '@/stores/navigation'
import { desktopRouteCatalog, mobileRouteCatalog, type CloudFlowRouteMeta } from './routeCatalog'
import { workflowPagePaths } from '@/pages/workflow/workflowPageConfigs'
import { isMobileDevice } from '@/utils/device'
import { resolveDocumentTitle } from '@/router/title'
import { useRoutePrefetch } from '@/composables/useRoutePrefetch'

const resolveComponent = (meta: CloudFlowRouteMeta) => {
  if (meta.path === '/' || meta.path === '/dashboard') {
    return meta.mobile ? MobileDashboardPage : DashboardPage
  }
  if (meta.path === '/schedule') return SchedulePage
  if (['/announcement', '/office/announcement'].includes(meta.path)) return OfficeAnnouncementPage
  if (meta.path === '/office/contact') return OfficeContactPage
  if (meta.path === '/office/knowledge') return OfficeKnowledgePage
  if (meta.path === '/hr/attendance/checkin') return AttendanceCheckIn
  if (meta.path === '/hr/attendance/rule') return AttendanceRule
  if (meta.path === '/hr/attendance/statistics') return HrAttendanceStatisticsPage
  if (meta.path === '/hr/attendance/supplement') return AttendanceSupplement
  if (meta.path === '/hr/dashboard') return HrDashboardPage
  if (meta.path === '/hr/employees') return HrEmployeePage
  if (meta.path === '/hr/organization') return HrOrganizationPage
  if (meta.path.startsWith('/hr/salary')) return HrSalaryPage
  if (meta.path === '/hr/recruitment') return HrRecruitmentPage
  if (meta.path === '/hr/headcount') return HrHeadcountPage
  if (meta.path === '/hr/schedule') return HrSchedulePage
  if (meta.path === '/hr/offer') return HrOfferPage
  if (['/hr/onboarding', '/hr/probation', '/hr/transfer', '/hr/resignation'].includes(meta.path)) return HrLifecyclePage
  if (meta.path === '/hr/performance') return HrPerformancePage
  if (meta.path === '/hr/leave/quota') return HrLeaveQuotaPage
  if (['/hr/leave/application', '/hr/overtime/applications'].includes(meta.path)) return HrApplicationPage
  if (meta.path === '/admin/borrow-management') return AdminBorrowManagementPage
  if (
    meta.path.startsWith('/admin/') ||
    [
      '/meeting-room',
      '/office/business-trip',
      '/expense/claim',
      '/payment/request',
      '/office/purchase-request',
      '/office/seal-application',
      '/office/license-borrow',
      '/office/contracts'
    ].includes(meta.path)
  ) return AdminLedgerPage
  if (workflowPagePaths.includes(meta.path)) return WorkflowAdminPage
  if (meta.path === '/users') return SystemOrgStructurePage
  if (meta.path === '/code') return SystemCodeGenerationPage
  if (meta.path === '/system/config') return SystemConfigPage
  if (meta.path === '/system/cache') return SystemCachePage
  if (meta.path === '/system/dict') return SystemDictPage
  if (meta.path === '/system/audit-log') return SystemAuditLogPage
  if (['/system/log', '/system/login-log'].includes(meta.path)) return SystemLogPage
  if (meta.path === '/system/online') return SystemOnlineUserPage
  if (meta.path === '/system/users') return SystemUserPage
  if (meta.path === '/system/roles') return SystemRolePage
  if (meta.path === '/system/menus') return SystemMenuPage
  if (meta.path === '/system/files') return SystemFilePage
  if (meta.path === '/system/tenant') return SystemTenantPage
  if (meta.path === '/system/post') return SystemPostPage
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
