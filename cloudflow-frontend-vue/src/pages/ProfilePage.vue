<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { BadgeCheck, Building2, CalendarDays, CheckCircle2, IdCard, KeyRound, LockKeyhole, Mail, Phone, ShieldCheck, UserRound } from 'lucide-vue-next'
import { Button, Input, Panel, StatCard } from '@/components/common'
import { changeProfilePassword, updateProfile } from '@/services/api/auth'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'

const auth = useAuthStore()
const toast = useToastStore()

const profileForm = reactive({ nickName: '', email: '', phone: '' })
const passwordForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })
const saving = reactive({ profile: false, password: false })

const user = computed(() => auth.user)
const displayName = computed(() => user.value?.name || user.value?.username || 'CloudFlow')
const initials = computed(() => String(displayName.value || 'CF').trim().slice(0, 2).toUpperCase())

const roleLabel = computed(() => {
  const role = String(user.value?.role || '').replace(/^ROLE_/i, '').toUpperCase()
  const labels: Record<string, string> = {
    ADMIN: '管理员',
    SUPER_ADMIN: '超级管理员',
    MANAGER: '经理',
    HR: '人力资源',
    FINANCE: '财务',
    EMPLOYEE: '员工',
    USER: '用户',
    COMMON: '普通用户'
  }
  return labels[role] || role || '用户'
})

const statusMeta = computed(() => {
  const status = String(user.value?.status || '').toUpperCase()
  const enabled = ['0', 'ACTIVE', 'ENABLE', 'ENABLED'].includes(status)
  return {
    label: enabled ? '启用' : (status === '1' || status === 'DISABLED' ? '停用' : formatValue(user.value?.status)),
    className: enabled
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200'
      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
  }
})

const profileRows = computed(() => [
  { icon: IdCard, label: '用户ID', value: formatValue(user.value?.id) },
  { icon: UserRound, label: '登录账号', value: formatValue(user.value?.username) },
  { icon: Mail, label: '邮箱', value: formatValue(user.value?.email) },
  { icon: Phone, label: '手机号', value: formatValue(user.value?.phone) },
  { icon: Building2, label: '部门', value: formatValue(user.value?.deptName) },
  { icon: CalendarDays, label: '创建时间', value: formatDate(user.value?.createTime) }
])

function formatValue(value: unknown) {
  const text = String(value ?? '').trim()
  return text || '-'
}

function formatDate(value?: string) {
  if (!value) return '-'
  const parsed = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

async function saveProfile() {
  const nickName = profileForm.nickName.trim()
  if (!nickName) {
    toast.error('显示名称不能为空')
    return
  }
  saving.profile = true
  try {
    await updateProfile({ nickName, email: profileForm.email.trim(), phone: profileForm.phone.trim() })
    await auth.refreshUser()
    toast.success('个人资料已更新')
  } catch (error) {
    toast.error(getErrorMessage(error, '个人资料更新失败'))
  } finally {
    saving.profile = false
  }
}

async function savePassword() {
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    toast.error('两次输入的新密码不一致')
    return
  }
  if (passwordForm.newPassword.length < 6) {
    toast.error('新密码至少 6 位')
    return
  }
  saving.password = true
  try {
    await changeProfilePassword(passwordForm.oldPassword, passwordForm.newPassword)
    passwordForm.oldPassword = ''
    passwordForm.newPassword = ''
    passwordForm.confirmPassword = ''
    toast.success('密码已更新')
  } catch (error) {
    toast.error(getErrorMessage(error, '密码更新失败'))
  } finally {
    saving.password = false
  }
}

watch(user, (nextUser) => {
  profileForm.nickName = nextUser?.name || ''
  profileForm.email = nextUser?.email || ''
  profileForm.phone = nextUser?.phone || ''
}, { immediate: true })
</script>

<template>
  <div v-if="user" class="mx-auto max-w-6xl space-y-6">
    <section class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/90">
      <div class="border-b border-slate-100 bg-[linear-gradient(135deg,rgba(8,145,178,0.13),rgba(20,184,166,0.08),rgba(245,158,11,0.08))] px-5 py-6 dark:border-slate-800 md:px-6">
        <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div class="flex min-w-0 items-center gap-4">
            <div class="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-600 text-xl font-semibold text-white shadow-[0_16px_32px_rgba(8,145,178,0.20)]">
              <img v-if="user.avatar" :src="user.avatar" :alt="displayName" class="h-full w-full object-cover">
              <span v-else>{{ initials }}</span>
            </div>
            <div class="min-w-0">
              <h1 class="truncate text-2xl font-semibold text-slate-950 dark:text-white">{{ displayName }}</h1>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <span class="inline-flex rounded-md bg-cyan-100 px-2 py-1 text-xs font-medium text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-200">{{ roleLabel }}</span>
                <span class="inline-flex rounded-md px-2 py-1 text-xs font-medium" :class="statusMeta.className">{{ statusMeta.label }}</span>
                <span class="inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">{{ formatValue(user.tenantName || user.tenantId) }}</span>
              </div>
            </div>
          </div>
          <div class="grid gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2 md:min-w-[22rem]">
            <div class="flex min-w-0 items-center gap-2 rounded-xl bg-white/75 px-3 py-2 dark:bg-slate-950/55">
              <Mail class="h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-300" />
              <span class="truncate">{{ formatValue(user.email) }}</span>
            </div>
            <div class="flex min-w-0 items-center gap-2 rounded-xl bg-white/75 px-3 py-2 dark:bg-slate-950/55">
              <Phone class="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-300" />
              <span class="truncate">{{ formatValue(user.phone) }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div class="grid gap-4 md:grid-cols-3">
      <StatCard title="用户ID" :value="formatValue(user.id)"><template #icon><IdCard class="h-5 w-5 text-cyan-600" /></template></StatCard>
      <StatCard title="所属租户" :value="formatValue(user.tenantName || user.tenantId)"><template #icon><Building2 class="h-5 w-5 text-emerald-600" /></template></StatCard>
      <StatCard title="账号状态" :value="statusMeta.label"><template #icon><CheckCircle2 class="h-5 w-5 text-amber-600" /></template></StatCard>
    </div>

    <div class="grid gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
      <div class="space-y-6">
        <Panel title="基础信息">
          <div class="grid gap-3">
            <div v-for="item in profileRows" :key="item.label" class="flex min-w-0 items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm dark:bg-slate-950 dark:text-slate-300">
                <component :is="item.icon" class="h-4.5 w-4.5" />
              </div>
              <div class="min-w-0">
                <div class="text-xs text-slate-500 dark:text-slate-400">{{ item.label }}</div>
                <div class="mt-1 truncate text-sm font-medium text-slate-900 dark:text-slate-100">{{ item.value }}</div>
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="安全状态">
          <div class="space-y-3">
            <div class="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <div class="flex min-w-0 items-center gap-3">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300"><ShieldCheck class="h-4.5 w-4.5" /></div>
                <div><div class="text-sm font-medium text-slate-900 dark:text-slate-100">账号可用性</div><div class="text-xs text-slate-500 dark:text-slate-400">当前状态：{{ statusMeta.label }}</div></div>
              </div>
              <BadgeCheck class="h-4.5 w-4.5 shrink-0 text-emerald-500" />
            </div>
            <div class="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <div class="flex min-w-0 items-center gap-3">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"><KeyRound class="h-4.5 w-4.5" /></div>
                <div><div class="text-sm font-medium text-slate-900 dark:text-slate-100">登录密码</div><div class="text-xs text-slate-500 dark:text-slate-400">支持当前页面直接修改</div></div>
              </div>
              <LockKeyhole class="h-4.5 w-4.5 shrink-0 text-slate-400" />
            </div>
          </div>
        </Panel>
      </div>

      <div class="space-y-6">
        <Panel title="编辑资料">
          <form class="space-y-4" @submit.prevent="saveProfile">
            <div class="grid gap-4 sm:grid-cols-2">
              <Input :model-value="user.username" label="登录账号" disabled />
              <Input v-model="profileForm.nickName" label="显示名称" autocomplete="name" />
              <Input v-model="profileForm.email" type="email" label="邮箱" autocomplete="email" />
              <Input v-model="profileForm.phone" label="手机号" autocomplete="tel" />
            </div>
            <div class="flex justify-end pt-2"><Button type="submit" :disabled="saving.profile">{{ saving.profile ? '保存中...' : '保存资料' }}</Button></div>
          </form>
        </Panel>

        <Panel title="修改密码">
          <form class="space-y-4" @submit.prevent="savePassword">
            <Input v-model="passwordForm.oldPassword" type="password" label="当前密码" required autocomplete="current-password" />
            <div class="grid gap-4 sm:grid-cols-2">
              <Input v-model="passwordForm.newPassword" type="password" label="新密码" required autocomplete="new-password" />
              <Input v-model="passwordForm.confirmPassword" type="password" label="确认新密码" required autocomplete="new-password" />
            </div>
            <div class="flex justify-end pt-2"><Button type="submit" variant="secondary" :disabled="saving.password">{{ saving.password ? '更新中...' : '更新密码' }}</Button></div>
          </form>
        </Panel>
      </div>
    </div>
  </div>
</template>
