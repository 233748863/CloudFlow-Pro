<script setup lang="ts">
import { computed } from 'vue'
import { Building2, ChevronRight, LogOut, Mail, Phone, ShieldCheck, UserRound } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

const displayName = computed(() => auth.user?.name || auth.user?.username || 'CloudFlow')
const initials = computed(() => displayName.value.slice(0, 2).toUpperCase())
const infoRows = computed(() => [
  { label: '登录账号', value: auth.user?.username || '-', icon: UserRound },
  { label: '邮箱', value: auth.user?.email || '-', icon: Mail },
  { label: '手机号', value: auth.user?.phone || '-', icon: Phone },
  { label: '部门', value: auth.user?.deptName || '-', icon: Building2 },
  { label: '账号状态', value: statusLabel(auth.user?.status), icon: ShieldCheck }
])

function statusLabel(value?: string) {
  const status = String(value || '').toUpperCase()
  return ['0', 'ACTIVE', 'ENABLE', 'ENABLED'].includes(status) ? '启用' : status || '-'
}

async function logout() {
  await auth.logout()
  await router.replace('/login')
}
</script>

<template>
  <div class="min-h-screen bg-slate-50 pb-20 dark:bg-slate-950">
    <section class="bg-white px-4 pb-5 pt-6 dark:bg-slate-950">
      <div class="flex items-center gap-4">
        <div class="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-600 text-xl font-semibold text-white">
          <img v-if="auth.user?.avatar" :src="auth.user.avatar" :alt="displayName" class="h-full w-full object-cover">
          <span v-else>{{ initials }}</span>
        </div>
        <div class="min-w-0 flex-1">
          <h1 class="truncate text-xl font-semibold text-slate-900 dark:text-slate-100">{{ displayName }}</h1>
          <p class="mt-1 truncate text-sm text-slate-500">{{ auth.user?.tenantName || auth.user?.role || '用户' }}</p>
        </div>
      </div>
    </section>

    <section class="mt-3 bg-white dark:bg-slate-950">
      <div v-for="row in infoRows" :key="row.label" class="flex items-center gap-3 border-b border-slate-100 px-4 py-4 last:border-b-0 dark:border-slate-800">
        <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-300">
          <component :is="row.icon" class="h-4.5 w-4.5" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="text-xs text-slate-400">{{ row.label }}</div>
          <div class="mt-0.5 truncate text-sm font-medium text-slate-800 dark:text-slate-100">{{ row.value }}</div>
        </div>
        <ChevronRight class="h-4 w-4 text-slate-300" />
      </div>
    </section>

    <section class="mt-3 bg-white dark:bg-slate-950">
      <button type="button" class="flex w-full items-center gap-3 px-4 py-4 text-left text-red-600" @click="logout">
        <LogOut class="h-5 w-5" />
        <span class="text-sm font-medium">退出登录</span>
      </button>
    </section>
  </div>
</template>
