<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Menu, ChevronDown, CircleUserRound, LogOut, Mail, Phone, User, Bell } from 'lucide-vue-next'
import TenantSwitcher from '@/components/TenantSwitcher.vue'
import AnnouncementBell from '@/components/common/AnnouncementBell.vue'
import LocaleSwitcher from '@/components/common/LocaleSwitcher.vue'
import VersionBadge from '@/components/common/VersionBadge.vue'
import { useAuthStore } from '@/stores/auth'

defineProps<{
  title: string
  subtitle?: string
}>()

const emit = defineEmits<{ toggleMobileSidebar: [] }>()

const auth = useAuthStore()
const router = useRouter()
const userDropdownOpen = ref(false)
const userDropdownRef = ref<HTMLElement | null>(null)

const displayName = computed(() => auth.user?.username || auth.user?.name || auth.user?.email?.split('@')[0] || 'User')
const userInitials = computed(() => displayName.value.slice(0, 2).toUpperCase())
const userRoleText = computed(() => String(auth.user?.role || 'User'))

function closeUserDropdown() {
  userDropdownOpen.value = false
}

async function logout() {
  closeUserDropdown()
  await auth.logout()
  router.push('/login')
}

function go(path: string) {
  closeUserDropdown()
  router.push(path)
}

function handleClickOutside(event: MouseEvent) {
  if (userDropdownRef.value && !userDropdownRef.value.contains(event.target as Node)) {
    closeUserDropdown()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <header class="glass sticky top-0 z-30 border-b border-gray-200/70 dark:border-dark-800/70">
    <div class="flex h-16 items-center justify-between px-4 md:px-6">
      <div class="flex min-w-0 items-center gap-3">
        <button type="button" class="rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-700 lg:hidden" aria-label="打开菜单" @click="emit('toggleMobileSidebar')">
          <Menu class="h-5 w-5" />
        </button>
        <div class="min-w-0">
          <h1 class="truncate text-lg font-semibold text-gray-900 dark:text-white">{{ title }}</h1>
          <p v-if="subtitle" class="mt-0.5 truncate text-xs text-gray-500 dark:text-dark-400">{{ subtitle }}</p>
        </div>
      </div>

      <div class="ml-4 flex shrink-0 items-center gap-2 sm:gap-3">
        <AnnouncementBell v-if="auth.user" />
        <LocaleSwitcher />
        <VersionBadge class="hidden md:inline-flex" />
        <TenantSwitcher />

        <div v-if="auth.user" ref="userDropdownRef" class="relative">
          <button
            type="button"
            class="flex items-center gap-2 rounded-lg p-1.5 text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-700"
            aria-label="用户菜单"
            @click.stop="userDropdownOpen = !userDropdownOpen"
          >
            <div class="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-cyan-600 text-sm font-semibold text-white shadow-sm">
              {{ userInitials }}
            </div>
            <div class="hidden text-left md:block">
              <div class="text-sm font-medium text-gray-900 dark:text-white">{{ displayName }}</div>
              <div class="text-xs text-gray-500 dark:text-dark-400">{{ userRoleText }}</div>
            </div>
            <ChevronDown class="hidden h-4 w-4 text-gray-400 transition-transform duration-200 md:block" :class="{ 'rotate-180': userDropdownOpen }" />
          </button>

          <transition name="dropdown">
            <div v-if="userDropdownOpen" class="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-dark-700 dark:bg-dark-800">
              <div class="border-b border-gray-100 px-4 py-3 dark:border-dark-700">
                <div class="text-sm font-medium text-gray-900 dark:text-white">{{ displayName }}</div>
                <div class="truncate text-xs text-gray-500 dark:text-dark-400">{{ auth.user.email || auth.user.tenantName || 'CloudFlow Pro' }}</div>
              </div>

              <div class="py-1">
                <button type="button" class="dropdown-item w-full" @click="go('/profile')">
                  <User class="h-4 w-4" />
                  个人资料
                </button>
                <button type="button" class="dropdown-item w-full" @click="go('/announcement')">
                  <Bell class="h-4 w-4" />
                  公告中心
                </button>
              </div>

              <div class="border-t border-gray-100 py-2 dark:border-dark-700">
                <div class="flex gap-2 px-4 py-1.5">
                  <Mail class="mt-0.5 h-4 w-4 shrink-0 text-gray-500 dark:text-dark-400" />
                  <div class="min-w-0">
                    <div class="text-sm text-gray-700 dark:text-gray-200">邮箱</div>
                    <div class="truncate text-sm text-gray-500 dark:text-dark-400">{{ auth.user.email || '-' }}</div>
                  </div>
                </div>
                <div class="flex gap-2 px-4 py-1.5">
                  <Phone class="mt-0.5 h-4 w-4 shrink-0 text-gray-500 dark:text-dark-400" />
                  <div class="min-w-0">
                    <div class="text-sm text-gray-700 dark:text-gray-200">电话</div>
                    <div class="truncate text-sm text-gray-500 dark:text-dark-400">{{ auth.user.phone || '-' }}</div>
                  </div>
                </div>
              </div>

              <div class="border-t border-gray-100 py-1 dark:border-dark-700">
                <button type="button" class="dropdown-item w-full text-red-600 hover:bg-red-50 hover:text-red-600 dark:text-red-400 dark:hover:bg-red-900/20 dark:hover:text-red-300" @click="logout">
                  <LogOut class="h-4 w-4" />
                  退出登录
                </button>
              </div>
            </div>
          </transition>
        </div>

        <button v-else type="button" class="rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-700">
          <CircleUserRound class="h-5 w-5" />
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.18s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: scale(0.96) translateY(-4px);
}
</style>
