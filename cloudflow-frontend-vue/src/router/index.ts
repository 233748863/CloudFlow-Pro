import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useNavigationStore } from '@/stores/navigation'
import { desktopRouteCatalog, mobileRouteCatalog, type CloudFlowRouteMeta } from './routeCatalog'
import { isMobileDevice } from '@/utils/device'
import { resolveDocumentTitle } from '@/router/title'
import { useRoutePrefetch } from '@/composables/useRoutePrefetch'

const routeComponents = {
  mainLayout: () => import('@/layouts/MainLayout.vue'),
  mobileLayout: () => import('@/layouts/MobileLayout.vue'),
  auth: () => import('@/pages/AuthPage.vue'),
  serviceUnavailable: () => import('@/pages/ServiceUnavailablePage.vue'),
  forbidden: () => import('@/pages/ForbiddenPage.vue'),
  serverError: () => import('@/pages/ServerErrorPage.vue'),
  chunkLoadError: () => import('@/pages/ChunkLoadErrorPage.vue'),
  notFound: () => import('@/pages/NotFoundPage.vue'),
  dashboard: () => import('@/pages/DashboardPage.vue'),
  mobileDashboard: () => import('@/pages/MobileDashboardPage.vue'),
  mobileVehicleBooking: () => import('@/pages/MobileVehicleBookingPage.vue'),
  mobileProfile: () => import('@/pages/MobileProfilePage.vue'),
  mobileMessages: () => import('@/pages/MobileMessagesPage.vue'),
  mobileReimbursement: () => import('@/pages/MobileReimbursementPage.vue'),
  mobileTasks: () => import('@/pages/workflow/ProcessCenterPage.vue'),
  mobileSchedule: () => import('@/pages/SchedulePage.vue'),
  mobileMeetingRoom: () => import('@/pages/admin/AdminLedgerPage.vue'),
  mobileLeaveApplication: () => import('@/pages/hr/HrApplicationPage.vue'),
  mobileWorkflowMonitor: () => import('@/pages/workflow/WorkflowAdminPage.vue'),
  profile: () => import('@/pages/ProfilePage.vue'),
  schedule: () => import('@/pages/SchedulePage.vue'),
  processCenter: () => import('@/pages/workflow/ProcessCenterPage.vue'),
  workflowCreate: () => import('@/pages/workflow/WorkflowCreatePage.vue'),
  workflowDesign: () => import('@/pages/workflow/WorkflowDesignPage.vue'),
  workflowAdmin: () => import('@/pages/workflow/WorkflowAdminPage.vue'),
  workflowVersionHistory: () => import('@/pages/workflow/WorkflowVersionHistoryPage.vue'),
  templateManagement: () => import('@/pages/workflow/TemplateManagementPage.vue'),
  officeAnnouncement: () => import('@/pages/office/OfficeAnnouncementPage.vue'),
  officeContact: () => import('@/pages/office/OfficeContactPage.vue'),
  officeKnowledge: () => import('@/pages/office/OfficeKnowledgePage.vue'),
  oaBusiness: () => import('@/pages/office/OaBusinessPage.vue'),
  crmModule: () => import('@/pages/crm/CrmModulePage.vue'),
  crmCustomerWorkspace: () => import('@/pages/crm/CrmCustomerWorkspacePage.vue'),
  attendanceCheckIn: () => import('@/pages/admin/attendance/AttendanceCheckIn.vue'),
  attendanceRule: () => import('@/pages/admin/attendance/AttendanceRule.vue'),
  attendanceSupplement: () => import('@/pages/admin/attendance/AttendanceSupplement.vue'),
  adminBorrowManagement: () => import('@/pages/admin/AdminBorrowManagementPage.vue'),
  adminLedger: () => import('@/pages/admin/AdminLedgerPage.vue'),
  hrAdvanced: () => import('@/pages/hr/HrAdvancedPage.vue'),
  hrAttendanceStatistics: () => import('@/pages/hr/HrAttendanceStatisticsPage.vue'),
  hrApplication: () => import('@/pages/hr/HrApplicationPage.vue'),
  hrDashboard: () => import('@/pages/hr/HrDashboardPage.vue'),
  hrEmployee: () => import('@/pages/hr/HrEmployeePage.vue'),
  hrEss: () => import('@/pages/hr/HrEssPage.vue'),
  hrBenefit: () => import('@/pages/hr/HrBenefitPage.vue'),
  hrHeadcount: () => import('@/pages/hr/HrHeadcountPage.vue'),
  hrLaborDispute: () => import('@/pages/hr/HrLaborDisputePage.vue'),
  hrLifecycle: () => import('@/pages/hr/HrLifecyclePage.vue'),
  hrLeaveQuota: () => import('@/pages/hr/HrLeaveQuotaPage.vue'),
  hrOffer: () => import('@/pages/hr/HrOfferPage.vue'),
  hrOrganization: () => import('@/pages/hr/HrOrganizationPage.vue'),
  hrPerformance: () => import('@/pages/hr/HrPerformancePage.vue'),
  hrRecruitment: () => import('@/pages/hr/HrRecruitmentPage.vue'),
  hrSalary: () => import('@/pages/hr/HrSalaryPage.vue'),
  hrSchedule: () => import('@/pages/hr/HrSchedulePage.vue'),
  hrTalent: () => import('@/pages/hr/HrTalentPage.vue'),
  hrTraining: () => import('@/pages/hr/HrTrainingPage.vue'),
  hrWorkInjury: () => import('@/pages/hr/HrWorkInjuryPage.vue'),
  systemSecurity: () => import('@/pages/system/SystemSecurityPage.vue'),
  systemAuditLog: () => import('@/pages/system/SystemAuditLogPage.vue'),
  systemCache: () => import('@/pages/system/SystemCachePage.vue'),
  systemCodeGeneration: () => import('@/pages/system/SystemCodeGenerationPage.vue'),
  systemConfig: () => import('@/pages/system/SystemConfigPage.vue'),
  systemDict: () => import('@/pages/system/SystemDictPage.vue'),
  systemFile: () => import('@/pages/system/SystemFilePage.vue'),
  systemLog: () => import('@/pages/system/SystemLogPage.vue'),
  systemMenu: () => import('@/pages/system/SystemMenuPage.vue'),
  systemOnlineUser: () => import('@/pages/system/SystemOnlineUserPage.vue'),
  systemOrgStructure: () => import('@/pages/system/SystemOrgStructurePage.vue'),
  systemPost: () => import('@/pages/system/SystemPostPage.vue'),
  systemRole: () => import('@/pages/system/SystemRolePage.vue'),
  systemTenant: () => import('@/pages/system/SystemTenantPage.vue'),
  systemUser: () => import('@/pages/system/SystemUserPage.vue')
} as const

type RouteComponentKey = keyof typeof routeComponents

const resolveComponent = (meta: CloudFlowRouteMeta) => {
  const key = meta.componentKey as RouteComponentKey | undefined
  return key ? routeComponents[key] || routeComponents.notFound : routeComponents.notFound
}

const buildRouteMeta = (item: CloudFlowRouteMeta) => ({
  path: item.path,
  title: item.title,
  group: item.group,
  source: item.source,
  requiresAuth: true,
  permissions: item.permissions || [],
  roles: item.roles || [],
  redirect: item.redirect,
  mobile: item.mobile,
  componentKey: item.componentKey
})

const buildChildRoutes = (catalog: CloudFlowRouteMeta[]): RouteRecordRaw[] =>
  catalog.map((item) => {
    if (item.redirect) {
      return {
        path: item.path,
        redirect: item.redirect,
        meta: buildRouteMeta(item)
      }
    }

    return {
      path: item.path,
      component: resolveComponent(item),
      meta: buildRouteMeta(item)
    }
  })

const usingMobileRoutes = isMobileDevice()

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    component: routeComponents.auth,
    meta: {
      title: '登录',
      requiresAuth: false
    }
  },
  {
    path: '/register',
    component: routeComponents.auth,
    meta: {
      title: '注册',
      requiresAuth: false
    }
  },
  {
    path: '/503',
    component: routeComponents.serviceUnavailable,
    meta: {
      title: '服务不可用',
      requiresAuth: false
    }
  },
  {
    path: '/403',
    component: routeComponents.forbidden,
    meta: {
      title: '权限不足',
      requiresAuth: false
    }
  },
  {
    path: '/500',
    component: routeComponents.serverError,
    meta: {
      title: '页面运行异常',
      requiresAuth: false
    }
  },
  {
    path: '/load-error',
    component: routeComponents.chunkLoadError,
    meta: {
      title: '资源加载失败',
      requiresAuth: false
    }
  },
  {
    path: '/',
    component: usingMobileRoutes ? routeComponents.mobileLayout : routeComponents.mainLayout,
    meta: {
      requiresAuth: true
    },
    children: buildChildRoutes(usingMobileRoutes ? mobileRouteCatalog : desktopRouteCatalog)
  },
  {
    path: '/:pathMatch(.*)*',
    component: routeComponents.notFound,
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
    const shouldSkipProbe = to.path === '/login' || to.path === '/register'
    await auth.init({ skipProbe: shouldSkipProbe })
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

  if (auth.user?.forcePasswordChange && !['/login', '/register'].includes(to.path)) {
    return true
  }

  const permissions = (to.meta.permissions || []) as string[]
  if (permissions.length > 0 && !permissions.some((permission) => auth.hasPermission(permission))) {
    return {
      path: '/403',
      query: { redirect: to.fullPath }
    }
  }

  const roles = (to.meta.roles || []) as string[]
  if (roles.length > 0) {
    const currentRole = String(auth.user?.role || '').toUpperCase()
    if (!roles.some((role) => currentRole === String(role).toUpperCase())) {
      return {
        path: '/403',
        query: { redirect: to.fullPath }
      }
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
