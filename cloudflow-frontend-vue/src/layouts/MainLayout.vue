<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppLayout from '@/components/layout/AppLayout.vue'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { getRouters, type MenuItem as ApiMenuItem } from '@/services/api/menu'
import { desktopRouteCatalog } from '@/router/routeCatalog'
import { getIcon } from '@/utils/iconMapper'
import type { SidebarItem } from '@/components/layout/types'
import type { Component } from 'vue'

type MenuTreeItem = SidebarItem & { icon: Component; children?: MenuTreeItem[] }

const SIDEBAR_STORAGE_KEY = 'cf-sidebar-collapsed'

const auth = useAuthStore()
const theme = useThemeStore()
const router = useRouter()
const route = useRoute()

const expandedGroups = ref<string[]>([])
const menuTree = ref<MenuTreeItem[]>([])
const menuLoading = ref(true)
const sidebarCollapsed = ref(localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1')
const mobileSidebarOpen = ref(false)

const canAccessFallbackRoute = (permissions?: string[], roles?: string[]) => {
  const permissionList = permissions || []
  if (permissionList.length > 0 && !permissionList.some((permission) => auth.hasPermission(permission))) {
    return false
  }

  const roleList = roles || []
  if (roleList.length > 0) {
    const currentRole = String(auth.user?.role || '').toUpperCase()
    if (!roleList.some((role) => currentRole === String(role).toUpperCase())) {
      return false
    }
  }

  return true
}

const convertApiMenusToMenuTree = (apiMenus: ApiMenuItem[]): MenuTreeItem[] =>
  apiMenus
    .filter((menu) => menu.menuType === 'M' && menu.visible === '0')
    .map((group) => ({
      id: group.path || String(group.menuId),
      label: group.menuName,
      icon: getIcon(group.icon),
      children:
        group.children
          ?.filter((child) => child.menuType === 'C' && child.visible === '0')
          .map((child) => ({
            id: child.path,
            label: child.menuName,
            icon: getIcon(child.icon),
            path: child.path
          })) || []
    }))

const buildFallbackMenu = (): MenuTreeItem[] => {
  const groups = new Map<string, MenuTreeItem>()
  desktopRouteCatalog
    .filter((item) => item.path !== '/' && !item.path.includes(':pathMatch'))
    .filter((item) => canAccessFallbackRoute(item.permissions, item.roles))
    .forEach((item) => {
      if (!groups.has(item.group)) {
        groups.set(item.group, {
          id: item.group,
          label: item.group,
          icon: getIcon(item.group),
          children: []
        })
      }
      groups.get(item.group)?.children?.push({
        id: item.path,
        label: item.title,
        icon: getIcon(item.path),
        path: item.redirect || item.path
      })
    })
  return Array.from(groups.values())
}

const flatItems = computed(() =>
  menuTree.value.flatMap((group) =>
    (group.children || []).map((child) => ({
      ...child,
      groupLabel: group.label
    }))
  )
)

const isActive = (path?: string) => {
  if (!path) return false
  if (path === '/') return route.path === '/'
  return route.path === path || route.path.startsWith(`${path}/`)
}

const activeLabel = computed(() => {
  for (const group of menuTree.value) {
    const child = group.children?.find((item) => isActive(item.path))
    if (child) return { group: group.label, item: child.label }
  }
  return { group: '工作台', item: String(route.meta.title || '仪表盘') }
})

const toggleGroup = (groupId: string) => {
  expandedGroups.value = expandedGroups.value.includes(groupId)
    ? expandedGroups.value.filter((id) => id !== groupId)
    : [...expandedGroups.value, groupId]
}

const openPath = (path?: string) => {
  if (!path) return
  mobileSidebarOpen.value = false
  router.push(path)
}

onMounted(async () => {
  try {
    const menus = await getRouters()
    menuTree.value = menus.length > 0 ? convertApiMenusToMenuTree(menus) : buildFallbackMenu()
  } catch {
    menuTree.value = buildFallbackMenu()
  } finally {
    menuLoading.value = false
  }
})

watch(sidebarCollapsed, (value) => {
  localStorage.setItem(SIDEBAR_STORAGE_KEY, value ? '1' : '0')
})

watch(
  () => [route.path, menuTree.value.length, sidebarCollapsed.value],
  () => {
    mobileSidebarOpen.value = false
    if (sidebarCollapsed.value) return
    for (const group of menuTree.value) {
      if (group.children?.some((child) => isActive(child.path)) && !expandedGroups.value.includes(group.id)) {
        expandedGroups.value.push(group.id)
      }
    }
  },
  { immediate: true }
)
</script>

<template>
  <AppLayout
    :title="activeLabel.item"
    :subtitle="activeLabel.group"
    :items="menuTree"
    :flat-items="flatItems"
    :collapsed="sidebarCollapsed"
    :mobile-open="mobileSidebarOpen"
    :active-path="route.path"
    :expanded-groups="expandedGroups"
    :loading="auth.loading || menuLoading"
    :theme-mode="theme.mode"
    @toggle-group="toggleGroup"
    @navigate="openPath"
    @toggle-collapsed="sidebarCollapsed = !sidebarCollapsed"
    @toggle-theme="theme.toggle()"
    @toggle-mobile-sidebar="mobileSidebarOpen = !mobileSidebarOpen"
    @close-mobile-sidebar="mobileSidebarOpen = false"
  >
    <RouterView v-slot="{ Component, route: childRoute }">
      <Transition name="content-fade" mode="out-in">
        <component :is="Component" :key="childRoute.fullPath" />
      </Transition>
    </RouterView>
  </AppLayout>
</template>

<style scoped>
.content-fade-enter-active,
.content-fade-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}

.content-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.content-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .content-fade-enter-active,
  .content-fade-leave-active {
    transition: opacity 0.01s linear;
  }

  .content-fade-enter-from,
  .content-fade-leave-to {
    transform: none;
  }
}
</style>
