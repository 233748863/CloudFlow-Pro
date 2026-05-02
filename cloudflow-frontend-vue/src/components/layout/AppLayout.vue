<script setup lang="ts">
import AppHeader from './AppHeader.vue'
import AppSidebar from './AppSidebar.vue'
import PageLoader from '@/components/common/PageLoader.vue'
import type { SidebarItem } from './types'

defineProps<{
  title: string
  subtitle?: string
  items: SidebarItem[]
  flatItems?: SidebarItem[]
  collapsed?: boolean
  mobileOpen?: boolean
  activePath?: string
  expandedGroups?: string[]
  loading?: boolean
  themeMode?: 'light' | 'dark'
}>()

const emit = defineEmits<{
  toggleGroup: [id: string]
  navigate: [path: string]
  toggleCollapsed: []
  toggleTheme: []
  toggleMobileSidebar: []
  closeMobileSidebar: []
}>()
</script>

<template>
  <PageLoader v-if="loading" />

  <div v-else class="min-h-screen bg-gray-50 dark:bg-dark-950">
    <div class="pointer-events-none fixed inset-0 bg-mesh-gradient dark:opacity-60" />

    <AppSidebar
      :items="items"
      :flat-items="flatItems"
      :collapsed="collapsed"
      :mobile-open="mobileOpen"
      :active-path="activePath"
      :expanded-groups="expandedGroups"
      :theme-mode="themeMode"
      @toggle-group="emit('toggleGroup', $event)"
      @navigate="emit('navigate', $event)"
      @toggle-collapsed="emit('toggleCollapsed')"
      @toggle-theme="emit('toggleTheme')"
      @close-mobile="emit('closeMobileSidebar')"
    />

    <div class="relative min-h-screen transition-all duration-300" :class="collapsed ? 'lg:ml-[72px]' : 'lg:ml-64'">
      <AppHeader :title="title" :subtitle="subtitle" @toggle-mobile-sidebar="emit('toggleMobileSidebar')" />
      <main class="p-4 md:p-6 lg:p-8">
        <slot />
      </main>
    </div>
  </div>
</template>
