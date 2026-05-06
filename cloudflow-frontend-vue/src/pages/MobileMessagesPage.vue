<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AlertCircle, Bell, CheckCircle, ChevronLeft, Mail, RefreshCcw, Trash2 } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { deleteNotice, getNoticeList, getUnreadCount, markNoticeRead, type Notice } from '@/services/api/notice'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'

type TabType = 'all' | 'unread' | 'read'

const router = useRouter()
const toast = useToastStore()
const messages = ref<Notice[]>([])
const loading = ref(true)
const refreshing = ref(false)
const activeTab = ref<TabType>('all')
const unreadCount = ref(0)
const selectedMessage = ref<Notice | null>(null)
const deletingId = ref<number | null>(null)

const filteredMessages = computed(() => messages.value.filter((message) => {
  if (activeTab.value === 'unread') return !message.isRead
  if (activeTab.value === 'read') return message.isRead
  return true
}))

function iconFor(type: string) {
  if (type === 'system') return AlertCircle
  if (type === 'task') return CheckCircle
  return Mail
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`
  return `${date.getMonth() + 1}/${date.getDate()}`
}

async function fetchMessages() {
  try {
    const [listResult, countResult] = await Promise.allSettled([
      getNoticeList({ pageNum: 1, pageSize: 50 }),
      getUnreadCount()
    ])
    if (listResult.status === 'fulfilled') {
      const data = listResult.value
      messages.value = Array.isArray(data?.records) ? data.records : Array.isArray(data?.rows) ? data.rows : []
    }
    if (countResult.status === 'fulfilled') unreadCount.value = Number(countResult.value || 0)
  } catch (error) {
    toast.error(getErrorMessage(error, '加载消息失败'))
  } finally {
    loading.value = false
  }
}

async function refresh() {
  refreshing.value = true
  await fetchMessages()
  refreshing.value = false
}

async function openMessage(message: Notice) {
  selectedMessage.value = message
  if (message.isRead) return
  try {
    await markNoticeRead(message.id)
    messages.value = messages.value.map((item) => item.id === message.id ? { ...item, isRead: true } : item)
    unreadCount.value = Math.max(0, unreadCount.value - 1)
    selectedMessage.value = { ...message, isRead: true }
  } catch (error) {
    toast.error(getErrorMessage(error, '标记已读失败'))
  }
}

async function removeMessage(noticeId: number) {
  deletingId.value = noticeId
  try {
    await deleteNotice(noticeId)
    const deleted = messages.value.find((item) => item.id === noticeId)
    messages.value = messages.value.filter((item) => item.id !== noticeId)
    if (deleted && !deleted.isRead) unreadCount.value = Math.max(0, unreadCount.value - 1)
    if (selectedMessage.value?.id === noticeId) selectedMessage.value = null
    toast.success('删除成功')
  } catch (error) {
    toast.error(getErrorMessage(error, '删除失败'))
  } finally {
    deletingId.value = null
  }
}

onMounted(() => void fetchMessages())
</script>

<template>
  <div class="min-h-screen bg-slate-50 pb-20 dark:bg-slate-950">
    <template v-if="selectedMessage">
      <header class="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
        <button type="button" class="-ml-1 p-1" aria-label="返回" @click="selectedMessage = null"><ChevronLeft class="h-6 w-6 text-slate-600" /></button>
        <h1 class="min-w-0 flex-1 truncate text-lg font-semibold text-slate-900 dark:text-slate-100">消息详情</h1>
        <button type="button" class="p-2 text-red-500" aria-label="删除消息" @click="removeMessage(selectedMessage.id)"><Trash2 class="h-4.5 w-4.5" /></button>
      </header>
      <main class="p-4">
        <article class="rounded-xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div class="mb-3 flex items-center gap-2">
            <component :is="iconFor(selectedMessage.type)" class="h-4 w-4 text-cyan-500" />
            <span class="text-xs text-slate-400">{{ selectedMessage.type || '通知' }}</span>
            <span class="ml-auto text-xs text-slate-400">{{ formatTime(selectedMessage.createTime) }}</span>
          </div>
          <h2 class="mb-3 text-lg font-semibold text-slate-900 dark:text-slate-100">{{ selectedMessage.title }}</h2>
          <p v-if="selectedMessage.sender" class="mb-3 text-sm text-slate-500">发送人：{{ selectedMessage.sender }}</p>
          <div class="whitespace-pre-wrap text-sm leading-7 text-slate-700 dark:text-slate-200">{{ selectedMessage.content }}</div>
        </article>
      </main>
    </template>

    <template v-else>
      <header class="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
        <button type="button" class="-ml-1 p-1" aria-label="返回" @click="router.back()"><ChevronLeft class="h-6 w-6 text-slate-600" /></button>
        <h1 class="flex-1 text-lg font-semibold text-slate-900 dark:text-slate-100">消息通知</h1>
        <button type="button" class="relative p-1" aria-label="刷新" @click="refresh">
          <RefreshCcw v-if="refreshing" class="h-5 w-5 animate-spin text-slate-600" />
          <Bell v-else class="h-5 w-5 text-slate-600" />
          <span v-if="unreadCount > 0" class="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
        </button>
      </header>

      <nav class="flex gap-6 border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-950">
        <button v-for="tab in ['all', 'unread', 'read']" :key="tab" type="button" class="border-b-2 py-3 text-sm font-medium" :class="activeTab === tab ? 'border-teal-500 text-teal-600' : 'border-transparent text-slate-500'" @click="activeTab = tab as TabType">
          {{ tab === 'all' ? '全部' : tab === 'unread' ? '未读' : '已读' }}<span v-if="tab === 'unread' && unreadCount > 0" class="ml-1 text-xs">({{ unreadCount }})</span>
        </button>
      </nav>

      <main class="space-y-3 p-4">
        <div v-if="loading" class="py-12 text-center text-sm text-slate-500">加载消息...</div>
        <button v-for="message in filteredMessages" v-else :key="message.id" type="button" class="w-full rounded-lg border bg-white p-4 text-left shadow-sm active:bg-slate-50 dark:bg-slate-900" :class="message.isRead ? 'border-slate-100 dark:border-slate-800' : 'border-teal-100 bg-teal-50/30 dark:border-teal-900'" @click="openMessage(message)">
          <div class="flex items-start gap-3">
            <component :is="iconFor(message.type)" class="mt-1 h-4 w-4 shrink-0 text-cyan-500" />
            <div class="min-w-0 flex-1">
              <div class="mb-1 flex items-start justify-between gap-2">
                <h3 class="truncate text-sm font-medium" :class="message.isRead ? 'text-slate-700 dark:text-slate-200' : 'text-slate-900 dark:text-slate-100'">{{ message.title }}</h3>
                <span v-if="!message.isRead" class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-teal-500" />
              </div>
              <p class="mb-2 line-clamp-2 text-xs text-slate-500">{{ message.content }}</p>
              <div class="flex items-center justify-between">
                <span class="text-xs text-slate-400">{{ formatTime(message.createTime) }}</span>
                <button type="button" class="p-1 text-slate-400 hover:text-red-500" aria-label="删除消息" @click.stop="removeMessage(message.id)"><Trash2 class="h-3.5 w-3.5" :class="deletingId === message.id ? 'animate-pulse' : ''" /></button>
              </div>
            </div>
          </div>
        </button>
        <div v-if="!loading && filteredMessages.length === 0" class="rounded-lg bg-white p-12 text-center dark:bg-slate-900">
          <Mail class="mx-auto mb-3 h-12 w-12 text-slate-300" />
          <p class="text-sm text-slate-500">{{ activeTab === 'unread' ? '暂无未读消息' : activeTab === 'read' ? '暂无已读消息' : '暂无消息' }}</p>
        </div>
      </main>
    </template>
  </div>
</template>
