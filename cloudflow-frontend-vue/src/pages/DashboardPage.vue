<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { CalendarDays, CheckCircle2, ClipboardList, Users } from 'lucide-vue-next'

const auth = useAuthStore()
const today = computed(() => new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }))

const cards = [
  { label: '待办任务', value: 0, icon: ClipboardList },
  { label: '今日日程', value: 0, icon: CalendarDays },
  { label: '团队成员', value: 0, icon: Users },
  { label: '已完成', value: 0, icon: CheckCircle2 }
]
</script>

<template>
  <div class="space-y-5">
    <section class="card p-6">
      <p class="text-sm text-slate-500 dark:text-slate-400">{{ today }}</p>
      <h1 class="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
        早安，{{ auth.user?.name || 'CloudFlow 用户' }}
      </h1>
      <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
        Vue 3 版本已接入鉴权、动态菜单、权限路由和 CloudFlow 网关代理。
      </p>
    </section>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <section v-for="card in cards" :key="card.label" class="card p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-slate-500 dark:text-slate-400">{{ card.label }}</p>
            <p class="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{{ card.value }}</p>
          </div>
          <component :is="card.icon" class="h-8 w-8 text-cyan-600 dark:text-cyan-300" />
        </div>
      </section>
    </div>
  </div>
</template>
