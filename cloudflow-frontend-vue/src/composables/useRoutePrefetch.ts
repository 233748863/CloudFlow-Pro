import { readonly, ref } from 'vue'
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'

type ComponentImportFn = () => Promise<unknown>
type IdleCallbackHandle = number | ReturnType<typeof setTimeout>

const PREFETCH_ADJACENCY: Record<string, string[]> = {
  '/': ['/dashboard', '/workplace'],
  '/dashboard': ['/workplace', '/tasks', '/announcement'],
  '/workplace': ['/dashboard', '/tasks'],
  '/tasks': ['/workflow', '/my-apps'],
  '/announcement': ['/office/announcement'],
  '/hr/attendance/rule': ['/hr/attendance/checkin', '/hr/attendance/supplement'],
  '/admin/vehicle/list': ['/admin/vehicle/booking', '/admin/vehicle/usage'],
  '/system/users': ['/system/roles', '/system/menus'],
  '/system/roles': ['/system/users', '/system/menus']
}

const scheduleIdleCallback = (
  callback: IdleRequestCallback,
  options?: IdleRequestOptions
): IdleCallbackHandle => {
  if (typeof window.requestIdleCallback === 'function') {
    return window.requestIdleCallback(callback, options)
  }
  return window.setTimeout(() => {
    callback({ didTimeout: false, timeRemaining: () => 50 })
  }, options?.timeout || 1000)
}

const cancelScheduledCallback = (handle: IdleCallbackHandle): void => {
  if (typeof window.cancelIdleCallback === 'function' && typeof handle === 'number') {
    window.cancelIdleCallback(handle)
    return
  }
  clearTimeout(handle)
}

export function useRoutePrefetch(router: Router) {
  const pendingPrefetchHandle = ref<IdleCallbackHandle | null>(null)
  const prefetchedRoutes = ref<Set<string>>(new Set())

  const getComponentImporter = (path: string): ComponentImportFn | null => {
    const route = router.getRoutes().find((item) => item.path === path)
    const component = route?.components?.default
    return typeof component === 'function' ? (component as ComponentImportFn) : null
  }

  const cancelPendingPrefetch = (): void => {
    if (pendingPrefetchHandle.value === null) return
    cancelScheduledCallback(pendingPrefetchHandle.value)
    pendingPrefetchHandle.value = null
  }

  const triggerPrefetch = (route: RouteLocationNormalizedLoaded): void => {
    cancelPendingPrefetch()
    const prefetchPaths = PREFETCH_ADJACENCY[route.path] || []
    if (prefetchPaths.length === 0 || prefetchedRoutes.value.has(route.path)) return

    pendingPrefetchHandle.value = scheduleIdleCallback(
      () => {
        pendingPrefetchHandle.value = null
        const imports = prefetchPaths.map(getComponentImporter).filter((item): item is ComponentImportFn => Boolean(item))
        if (imports.length === 0) return
        void Promise.all(imports.map((importer) => importer().catch(() => null))).then(() => {
          prefetchedRoutes.value.add(route.path)
        })
      },
      { timeout: 2000 }
    )
  }

  const resetPrefetchState = (): void => {
    cancelPendingPrefetch()
    prefetchedRoutes.value.clear()
  }

  return {
    prefetchedRoutes: readonly(prefetchedRoutes),
    triggerPrefetch,
    cancelPendingPrefetch,
    resetPrefetchState
  }
}
