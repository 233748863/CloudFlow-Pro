<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '@/components/icons/Icon.vue'
import { useAnnouncementStore } from '@/stores/announcement'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import type { Announcement } from '@/types'

const announcementStore = useAnnouncementStore()
const toast = useToastStore()
const router = useRouter()
const isOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

const unreadCount = computed(() => announcementStore.unreadCount)
const announcements = computed(() => announcementStore.announcements.slice(0, 6))

function formatTime(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

async function openDetail(item: Announcement) {
  isOpen.value = false
  if (!item.isRead) {
    try {
      await announcementStore.markAsRead(item.announcementId)
    } catch (error) {
      toast.error(getErrorMessage(error, '标记公告已读失败'))
    }
  }
  router.push('/announcement')
}

async function markAllAsRead() {
  try {
    await announcementStore.markAllAsRead()
    toast.success('所有公告已标记为已读')
  } catch (error) {
    toast.error(getErrorMessage(error, '标记公告已读失败'))
  }
}

function handleClickOutside(event: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  void announcementStore.fetchAnnouncements()
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div ref="dropdownRef" class="relative">
    <button
      type="button"
      class="relative rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-700"
      aria-label="公告"
      @click.stop="isOpen = !isOpen"
    >
      <Icon name="bell" size="md" />
      <span v-if="unreadCount > 0" class="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
        {{ unreadCount > 99 ? '99+' : unreadCount }}
      </span>
    </button>

    <transition name="dropdown">
      <div v-if="isOpen" class="absolute right-0 z-50 mt-2 w-[22rem] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg dark:border-dark-700 dark:bg-dark-800">
        <div class="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-dark-700">
          <div>
            <p class="text-sm font-semibold text-gray-900 dark:text-white">公告</p>
            <p class="mt-0.5 text-xs text-gray-500 dark:text-dark-400">未读 {{ unreadCount }} 条</p>
          </div>
          <button v-if="unreadCount > 0" type="button" class="btn btn-ghost btn-sm" @click="markAllAsRead">全部已读</button>
        </div>

        <div class="max-h-[24rem] overflow-y-auto">
          <div v-if="announcementStore.loading" class="empty-state py-10">
            <Icon name="loader" size="lg" class="empty-state-icon animate-spin" />
            <p class="empty-state-title text-sm">正在加载公告</p>
          </div>
          <template v-else-if="announcements.length > 0">
            <button
              v-for="item in announcements"
              :key="item.announcementId"
              type="button"
              class="flex w-full items-start gap-3 border-b border-gray-100 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-gray-50 dark:border-dark-700 dark:hover:bg-dark-700/50"
              @click="openDetail(item)"
            >
              <span class="mt-1 h-2 w-2 shrink-0 rounded-full" :class="item.isRead ? 'bg-gray-300 dark:bg-dark-600' : 'bg-primary-500'" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium text-gray-900 dark:text-white">{{ item.title }}</span>
                <span class="mt-1 block truncate text-xs text-gray-500 dark:text-dark-400">{{ formatTime(item.publishTime || item.createTime) }}</span>
              </span>
            </button>
          </template>
          <div v-else class="empty-state py-10">
            <Icon name="inbox" size="lg" class="empty-state-icon" />
            <p class="empty-state-title text-sm">暂无公告</p>
            <p class="empty-state-description text-xs">新公告发布后会显示在这里</p>
          </div>
        </div>

        <button type="button" class="flex w-full items-center justify-center gap-2 border-t border-gray-100 px-4 py-3 text-sm font-medium text-primary-600 transition-colors hover:bg-primary-50 dark:border-dark-700 dark:hover:bg-primary-900/20" @click="isOpen = false; router.push('/announcement')">
          查看公告中心
          <Icon name="chevronRight" size="sm" />
        </button>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(-4px);
}
</style>
