<script setup lang="ts">
import { computed } from 'vue'
import { ChevronsLeft, ChevronsRight, ChevronDown, MoonStar, SunMedium } from 'lucide-vue-next'
import Icon from '@/components/icons/Icon.vue'
import type { SidebarItem } from './types'

const props = defineProps<{
  items: SidebarItem[]
  flatItems?: SidebarItem[]
  collapsed?: boolean
  mobileOpen?: boolean
  activePath?: string
  expandedGroups?: string[]
  themeMode?: 'light' | 'dark'
}>()

const emit = defineEmits<{
  toggleGroup: [id: string]
  navigate: [path: string]
  toggleCollapsed: []
  toggleTheme: []
  closeMobile: []
}>()

const allFlatItems = computed(() =>
  props.flatItems && props.flatItems.length > 0
    ? props.flatItems
    : props.items.flatMap((group) =>
        (group.children || []).map((child) => ({ ...child, groupLabel: group.label }))
      )
)

const isActive = (path?: string) => {
  if (!props.activePath || !path) return false
  return props.activePath === path || props.activePath.startsWith(`${path}/`)
}

const isGroupActive = (group: SidebarItem) => Boolean(group.children?.some((child) => isActive(child.path)))
</script>

<template>
  <Teleport to="body">
    <transition name="sidebar-overlay">
      <button
        v-if="mobileOpen"
        type="button"
        class="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
        aria-label="关闭菜单"
        @click="emit('closeMobile')"
      />
    </transition>
  </Teleport>

  <aside
    class="sidebar"
    :class="[
      collapsed ? 'lg:w-[72px]' : 'lg:w-64',
      mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
    ]"
  >
    <div class="sidebar-header" :class="collapsed ? 'lg:justify-center lg:px-4' : ''">
      <div class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-primary-100 bg-white shadow-glow dark:border-primary-950/40 dark:bg-dark-800">
        <img src="/icon.svg" alt="CloudFlow Pro" class="h-8 w-8 object-contain" />
      </div>
      <div v-if="!collapsed" class="min-w-0">
        <span class="block truncate text-[17px] font-bold text-gray-900 dark:text-white">CloudFlow Pro</span>
        <span class="block truncate text-xs text-gray-400 dark:text-dark-400">Vue 3</span>
      </div>
    </div>

    <nav class="sidebar-nav scrollbar-hide">
      <div v-if="collapsed" class="hidden space-y-1 lg:block">
        <button
          v-for="item in allFlatItems"
          :key="item.id"
          type="button"
          :title="`${item.groupLabel || ''}${item.groupLabel ? ' / ' : ''}${item.label}`"
          class="sidebar-link h-10 w-10 justify-center gap-0 px-0"
          :class="isActive(item.path) ? 'sidebar-link-active' : ''"
          @click="item.path && emit('navigate', item.path)"
        >
          <component v-if="item.icon && typeof item.icon !== 'string'" :is="item.icon" class="h-[18px] w-[18px] shrink-0" />
          <Icon v-else :name="item.icon || 'dashboard'" size="md" />
        </button>
      </div>

      <div v-else class="space-y-4">
        <div v-for="group in items" :key="group.id" class="sidebar-section">
          <button
            type="button"
            class="sidebar-link w-full"
            :class="isGroupActive(group) && !expandedGroups?.includes(group.id) ? 'sidebar-link-active' : ''"
            @click="emit('toggleGroup', group.id)"
          >
            <component v-if="group.icon && typeof group.icon !== 'string'" :is="group.icon" class="h-[18px] w-[18px] shrink-0" />
            <Icon v-else :name="group.icon || 'dashboard'" size="md" />
            <span class="flex min-w-0 flex-1 items-center justify-between gap-2">
              <span class="truncate">{{ group.label }}</span>
              <ChevronDown class="h-4 w-4 shrink-0 transition-transform duration-200" :class="expandedGroups?.includes(group.id) ? 'rotate-180' : ''" />
            </span>
          </button>

          <div v-if="expandedGroups?.includes(group.id)" class="ml-4 mt-2 space-y-1 border-l border-gray-200 pl-3 dark:border-dark-800">
            <button
              v-for="child in group.children"
              :key="child.id"
              type="button"
              class="sidebar-link sidebar-link-sm w-full"
              :class="isActive(child.path) ? 'sidebar-link-active' : ''"
              @click="child.path && emit('navigate', child.path)"
            >
              <component v-if="child.icon && typeof child.icon !== 'string'" :is="child.icon" class="h-4 w-4 shrink-0" />
              <Icon v-else :name="child.icon || 'chevronRight'" size="sm" />
              <span class="truncate">{{ child.label }}</span>
            </button>
          </div>
        </div>
      </div>
    </nav>

    <div class="mt-auto border-t border-gray-100 p-3 dark:border-dark-800">
      <div class="space-y-2" :class="collapsed ? 'hidden lg:flex lg:flex-col lg:items-center' : ''">
        <button type="button" class="sidebar-link w-full overflow-hidden" :class="collapsed ? 'h-10 w-10 justify-center gap-0 px-0' : ''" @click="emit('toggleTheme')">
          <SunMedium v-if="themeMode === 'dark'" class="h-[18px] w-[18px] shrink-0 text-amber-500" />
          <MoonStar v-else class="h-[18px] w-[18px] shrink-0" />
          <span v-if="!collapsed">深色模式</span>
        </button>
        <button type="button" class="sidebar-link hidden w-full overflow-hidden lg:flex" :class="collapsed ? 'h-10 w-10 justify-center gap-0 px-0' : ''" @click="emit('toggleCollapsed')">
          <ChevronsRight v-if="collapsed" class="h-[18px] w-[18px] shrink-0" />
          <ChevronsLeft v-else class="h-[18px] w-[18px] shrink-0" />
          <span v-if="!collapsed">收起侧栏</span>
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar-overlay-enter-active,
.sidebar-overlay-leave-active {
  transition: opacity 0.2s ease;
}

.sidebar-overlay-enter-from,
.sidebar-overlay-leave-to {
  opacity: 0;
}
</style>
