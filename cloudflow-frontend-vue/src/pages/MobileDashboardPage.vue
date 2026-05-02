<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const today = computed(() => new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' }))

const actions = [
  { label: '用车', path: '/vehicle/booking' },
  { label: '请假', path: '/hr/leave/application' },
  { label: '报销', path: '/reimbursement/request' },
  { label: '会议', path: '/meeting-room' }
]
</script>

<template>
  <div class="space-y-5 p-4">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-bold text-slate-900 dark:text-slate-100">早安，{{ auth.user?.name || '用户' }}</h1>
        <p class="text-sm text-slate-500 dark:text-slate-400">{{ today }}</p>
      </div>
      <RouterLink to="/messages" class="rounded-full border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">消息</RouterLink>
    </header>

    <section class="grid grid-cols-4 gap-3">
      <RouterLink
        v-for="action in actions"
        :key="action.path"
        :to="action.path"
        class="flex min-h-[4rem] flex-col items-center justify-center rounded-xl bg-white text-sm font-medium text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200"
      >
        {{ action.label }}
      </RouterLink>
    </section>

    <section class="rounded-xl bg-teal-600 p-4 text-white shadow-card">
      <div class="grid grid-cols-3 divide-x divide-teal-400/60 text-center">
        <div><p class="text-xs text-teal-50">待办</p><p class="mt-1 text-2xl font-bold">0</p></div>
        <div><p class="text-xs text-teal-50">日程</p><p class="mt-1 text-2xl font-bold">0</p></div>
        <div><p class="text-xs text-teal-50">消息</p><p class="mt-1 text-2xl font-bold">0</p></div>
      </div>
    </section>
  </div>
</template>
