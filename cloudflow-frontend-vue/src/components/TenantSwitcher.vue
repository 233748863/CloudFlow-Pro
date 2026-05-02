<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Building2, Check, ChevronDown, Loader2 } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { getTenantList, type SysTenant, type TenantListResponse } from '@/services/api/tenant'
import { getErrorMessage } from '@/utils/errorMessage'

const auth = useAuthStore()
const toast = useToastStore()
const dropdownRef = ref<HTMLElement | null>(null)
const tenants = ref<SysTenant[]>([])
const isOpen = ref(false)
const loading = ref(false)
const switching = ref(false)

const pickTenantArray = (source?: { records?: SysTenant[]; rows?: SysTenant[]; list?: SysTenant[] }) => {
  if (Array.isArray(source?.records)) return source.records
  if (Array.isArray(source?.rows)) return source.rows
  if (Array.isArray(source?.list)) return source.list
  return []
}

const normalizeTenantListResponse = (response: TenantListResponse): SysTenant[] => {
  if (Array.isArray(response)) return response
  const directList = pickTenantArray(response)
  return directList.length > 0 ? directList : pickTenantArray(response?.data)
}

const normalizedRole = computed(() => String(auth.user?.role || '').trim().toUpperCase())
const canSwitchTenant = computed(() => {
  const username = String(auth.user?.username || '').trim().toLowerCase()
  const role = normalizedRole.value
  return Boolean(auth.user) && (
    role === 'ADMIN' ||
    role === 'ROLE_ADMIN' ||
    role === 'SUPER_ADMIN' ||
    role === 'SUPERADMIN' ||
    role.endsWith('_ADMIN') ||
    role.includes('ADMIN') ||
    username === 'admin'
  )
})

const getTenantName = (tenantName?: string, tenantId?: number) => {
  const normalizedName = String(tenantName || '').trim()
  if (normalizedName) return normalizedName
  return typeof tenantId === 'number' ? `租户 ${tenantId}` : '默认租户'
}

const getTenantIdText = (tenantId?: number) => typeof tenantId === 'number' ? `ID ${tenantId}` : 'ID --'

const currentTenant = computed(() => tenants.value.find((tenant) => tenant.tenantId === auth.user?.tenantId))
const currentTenantName = computed(() => getTenantName(currentTenant.value?.tenantName || auth.user?.tenantName, auth.user?.tenantId))
const currentTenantIdText = computed(() => getTenantIdText(auth.user?.tenantId))

const fetchTenants = async (silent = false) => {
  if (loading.value) return
  loading.value = true
  try {
    const response = await getTenantList({ status: '0' })
    tenants.value = normalizeTenantListResponse(response)
  } catch (error) {
    if (!silent) toast.error(getErrorMessage(error, '获取租户列表失败'))
  } finally {
    loading.value = false
  }
}

const handleSwitchTenant = async (tenantId: number) => {
  if (tenantId === auth.user?.tenantId) {
    isOpen.value = false
    return
  }
  switching.value = true
  try {
    await auth.switchTenant(tenantId)
    isOpen.value = false
  } catch (error) {
    toast.error(getErrorMessage(error, '租户切换失败'))
  } finally {
    switching.value = false
  }
}

const toggleOpen = () => {
  isOpen.value = !isOpen.value
  if (isOpen.value && tenants.value.length === 0) void fetchTenants()
}

const handleClickOutside = (event: MouseEvent) => {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) isOpen.value = false
}

const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') isOpen.value = false
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  window.addEventListener('keydown', handleKeyDown)
  if (canSwitchTenant.value) void fetchTenants(true)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div v-if="canSwitchTenant && auth.user" ref="dropdownRef" class="relative">
    <button
      type="button"
      class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-gray-100 disabled:cursor-wait disabled:opacity-70 dark:hover:bg-dark-700"
      :disabled="switching"
      :aria-expanded="isOpen"
      aria-haspopup="menu"
      :aria-label="`当前租户：${currentTenantName}`"
      @click.stop="toggleOpen"
    >
      <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 dark:border-dark-700 dark:bg-dark-800 dark:text-dark-300">
        <Building2 :size="15" />
      </div>
      <div class="hidden min-w-0 flex-1 sm:block">
        <div class="truncate text-sm font-semibold text-slate-700 dark:text-slate-100">{{ currentTenantName }}</div>
        <div class="truncate text-[11px] text-slate-500 dark:text-slate-400">{{ currentTenantIdText }}</div>
      </div>
      <Loader2 v-if="switching" :size="14" class="shrink-0 animate-spin text-slate-400" />
      <ChevronDown v-else :size="14" class="shrink-0 text-slate-400 transition-transform duration-200" :class="isOpen ? 'rotate-180' : ''" />
    </button>

    <div class="absolute right-0 top-full z-50 mt-2 w-56 origin-top-right overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg transition duration-150 dark:border-dark-700 dark:bg-dark-800" :class="isOpen ? 'pointer-events-auto translate-y-0 scale-100 opacity-100' : 'pointer-events-none -translate-y-1 scale-95 opacity-0'">
      <div v-if="loading" class="flex items-center justify-center gap-2 px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
        <Loader2 :size="14" class="animate-spin" />
        <span>正在加载</span>
      </div>
      <div v-else-if="tenants.length === 0" class="px-4 py-4 text-center text-sm text-slate-500 dark:text-slate-400">暂无租户</div>
      <div v-else class="py-1.5">
        <button
          v-for="tenant in tenants"
          :key="tenant.tenantId"
          type="button"
          class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-dark-700/50"
          :class="[tenant.tenantId === auth.user.tenantId ? 'bg-primary-50 dark:bg-primary-900/20' : '', switching ? 'cursor-not-allowed opacity-70' : '']"
          :disabled="switching"
          :title="`${getTenantName(tenant.tenantName, tenant.tenantId)} ${getTenantIdText(tenant.tenantId)}`"
          @click="handleSwitchTenant(tenant.tenantId)"
        >
          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-400 dark:border-dark-700 dark:bg-dark-900" :class="tenant.tenantId === auth.user.tenantId ? 'border-primary-200 bg-primary-100 text-primary-600 dark:border-primary-800 dark:bg-primary-900/30 dark:text-primary-300' : ''">
            <Building2 :size="15" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-medium" :class="tenant.tenantId === auth.user.tenantId ? 'text-cyan-700 dark:text-cyan-200' : 'text-slate-700 dark:text-slate-200'">
              {{ getTenantName(tenant.tenantName, tenant.tenantId) }}
            </div>
            <div class="mt-0.5 truncate text-[11px]" :class="tenant.tenantId === auth.user.tenantId ? 'text-cyan-600/80 dark:text-cyan-300/80' : 'text-slate-500 dark:text-slate-400'">
              {{ getTenantIdText(tenant.tenantId) }}
            </div>
          </div>
          <Check v-if="tenant.tenantId === auth.user.tenantId" :size="14" class="shrink-0 text-cyan-500 dark:text-cyan-300" />
        </button>
      </div>
    </div>
  </div>
</template>
