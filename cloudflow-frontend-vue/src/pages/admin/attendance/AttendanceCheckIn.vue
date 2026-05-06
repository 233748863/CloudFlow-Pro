<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock3,
  Fingerprint,
  LogIn,
  LogOut,
  MapPin,
  RefreshCw,
  Wifi
} from 'lucide-vue-next'
import { Button, DataTable, Input, Panel, Select, StatusBadge, type Column, type SelectOption } from '@/components/common'
import {
  type EffectiveAttendanceRule,
  type HrAttendanceRecord,
  type HrEmployee,
  getEffectiveAttendanceRule,
  getHrSelfServiceRestrictionMessage,
  hrCheckIn,
  hrCheckOut,
  listHrAttendanceRecords,
  resolveCurrentEmployee
} from '@/services/api/hr'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'

type CheckMethod = 'GPS' | 'WIFI' | 'FACE'

const CHECK_METHOD_LABEL: Record<string, string> = {
  GPS: 'GPS 定位',
  WIFI: 'Wi-Fi',
  FACE: '人脸识别',
  SUPPLEMENT: '补卡'
}

const CHECK_TYPE_LABEL: Record<string, string> = {
  CHECK_IN: '上班打卡',
  CHECK_OUT: '下班签退'
}

const DAY_TYPE_LABEL: Record<string, string> = {
  WORKDAY: '工作日',
  REST: '休息日',
  HOLIDAY: '节假日'
}

const STATUS_LABEL: Record<string, string> = {
  NORMAL: '正常',
  LATE: '迟到',
  SEVERE_LATE: '严重迟到',
  EARLY: '早退',
  ABSENT: '旷工',
  MISSING: '缺卡',
  SUPPLEMENT: '补卡',
  APPROVING: '审批中',
  REJECTED: '已驳回'
}

const statusTone = (status?: string): 'slate' | 'green' | 'red' | 'yellow' | 'cyan' => {
  switch (status) {
    case 'NORMAL':
    case 'SUPPLEMENT':
      return 'green'
    case 'LATE':
    case 'SEVERE_LATE':
    case 'EARLY':
    case 'MISSING':
      return 'yellow'
    case 'ABSENT':
    case 'REJECTED':
      return 'red'
    case 'APPROVING':
      return 'cyan'
    default:
      return 'slate'
  }
}

const getCheckTypeLabel = (type?: string) => type ? (CHECK_TYPE_LABEL[type] || type) : '-'
const getCheckMethodLabel = (method?: string) => method ? (CHECK_METHOD_LABEL[method] || method) : '-'
const getStatusLabel = (status?: string) => status ? (STATUS_LABEL[status] || status) : '-'

const auth = useAuthStore()
const toast = useToastStore()

const now = ref(new Date())
const loading = ref(false)
const ruleLoading = ref(true)
const recordsLoading = ref(false)
const employee = ref<HrEmployee | null>(null)
const rule = ref<EffectiveAttendanceRule | null>(null)
const records = ref<HrAttendanceRecord[]>([])
const location = ref<{ latitude: number; longitude: number } | null>(null)
const locationError = ref('')
const selectedMethod = ref<CheckMethod>('GPS')
const wifiSsid = ref('')
const faceToken = ref('')
const remark = ref('')
const result = ref<{ success: boolean; message: string } | null>(null)

let timer: number | undefined

const recordColumns: Column<HrAttendanceRecord>[] = [
  { key: 'checkType', label: '类型' },
  { key: 'checkTime', label: '时间', sortable: true },
  { key: 'checkMethod', label: '方式' },
  { key: 'location', label: '位置' },
  { key: 'status', label: '状态' }
]

const formatDateInput = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`
}

const formatTime = (value?: string) => (value || '').slice(0, 5) || '--:--'
const formatDateTime = (value?: string) => value ? value.replace('T', ' ').slice(0, 19) : '-'

const today = computed(() => formatDateInput(now.value))
const currentTimeLabel = computed(() => now.value.toLocaleTimeString('zh-CN', { hour12: false }))
const currentMinuteLabel = computed(() => now.value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))
const dateLabel = computed(() => formatDateCN(now.value))
const selfServiceRestriction = computed(() => getHrSelfServiceRestrictionMessage(employee.value))
const selfServiceLocked = computed(() => loading.value || ruleLoading.value || Boolean(selfServiceRestriction.value))
const allowedMethods = computed(() => {
  const methods = rule.value?.checkMethods?.length ? rule.value.checkMethods : ['GPS']
  return methods.filter((method): method is CheckMethod => ['GPS', 'WIFI', 'FACE'].includes(method))
})
const methodOptions = computed<SelectOption[]>(() =>
  allowedMethods.value.map((method) => ({ value: method, label: CHECK_METHOD_LABEL[method] || method }))
)
const dayTypeLabel = computed(() => DAY_TYPE_LABEL[rule.value?.dayType || ''] || '未设置日历')
const shiftLabel = computed(() => `${formatTime(rule.value?.checkInTime)} - ${formatTime(rule.value?.checkOutTime)}`)
const sourceLabel = computed(() => {
  if (!rule.value) return '未配置'
  const target = rule.value.sourceTargetName ? ` ${rule.value.sourceTargetName}` : ''
  if (rule.value.sourceType === 'EMPLOYEE') return `员工规则${target}`
  if (rule.value.sourceType === 'POST') return `岗位规则${target}`
  if (rule.value.sourceType === 'DEPT') return `部门规则${target}`
  return '默认规则'
})

const phaseInfo = computed(() => {
  if (ruleLoading.value) return { title: '规则加载中', hint: '正在同步今日考勤规则' }
  if (!rule.value) return { title: '未配置规则', hint: '当前未读取到有效考勤规则' }

  const [inHour = '09', inMinute = '00'] = formatTime(rule.value.checkInTime).split(':')
  const [outHour = '18', outMinute = '00'] = formatTime(rule.value.checkOutTime).split(':')
  const checkInTime = new Date(now.value)
  checkInTime.setHours(Number(inHour), Number(inMinute), 0, 0)
  const checkOutTime = new Date(now.value)
  checkOutTime.setHours(Number(outHour), Number(outMinute), 0, 0)

  if (now.value.getTime() < checkInTime.getTime()) {
    return { title: '上班前准备', hint: `上班时间 ${formatTime(rule.value.checkInTime)}` }
  }
  if (now.value.getTime() < checkOutTime.getTime()) {
    return { title: '工作时段', hint: '可进行签到或刷新定位' }
  }
  return { title: '下班签退时段', hint: `下班时间 ${formatTime(rule.value.checkOutTime)}` }
})

const locationSummary = computed(() => {
  if (selectedMethod.value === 'GPS') {
    if (location.value) return `${location.value.latitude.toFixed(5)}, ${location.value.longitude.toFixed(5)}`
    return locationError.value || '待获取 GPS 定位'
  }
  if (selectedMethod.value === 'WIFI') return wifiSsid.value || '待输入 Wi-Fi SSID'
  return faceToken.value ? '人脸凭证已填写' : '待输入人脸凭证'
})

const canSubmit = computed(() => {
  if (selfServiceLocked.value || !rule.value) return false
  if (selectedMethod.value === 'GPS') return Boolean(location.value)
  if (selectedMethod.value === 'WIFI') return Boolean(wifiSsid.value.trim())
  if (selectedMethod.value === 'FACE') return Boolean(faceToken.value.trim())
  return false
})

const loadRecords = async () => {
  if (!employee.value?.id) return
  recordsLoading.value = true
  try {
    records.value = await listHrAttendanceRecords({
      employeeId: employee.value.id,
      startDate: today.value,
      endDate: today.value,
      pageNum: 1,
      pageSize: 20
    })
  } catch (error) {
    toast.error(getErrorMessage(error, '加载今日打卡记录失败'))
  } finally {
    recordsLoading.value = false
  }
}

const loadAll = async () => {
  ruleLoading.value = true
  result.value = null
  try {
    const currentEmployee = await resolveCurrentEmployee()
    employee.value = currentEmployee
    const effectiveRule = await getEffectiveAttendanceRule({ employeeId: currentEmployee.id, date: today.value })
    rule.value = effectiveRule || null
    const firstAllowed = effectiveRule?.checkMethods?.find((method) => ['GPS', 'WIFI', 'FACE'].includes(method))
    selectedMethod.value = (firstAllowed as CheckMethod | undefined) || 'GPS'
    await loadRecords()
  } catch (error) {
    rule.value = null
    employee.value = null
    toast.error(getErrorMessage(error, '加载考勤信息失败'))
  } finally {
    ruleLoading.value = false
  }
}

const getLocation = () => {
  if (selfServiceRestriction.value) {
    locationError.value = selfServiceRestriction.value
    return
  }
  if (!navigator.geolocation) {
    locationError.value = '当前浏览器不支持地理定位'
    return
  }

  loading.value = true
  locationError.value = ''
  navigator.geolocation.getCurrentPosition(
    (position) => {
      location.value = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      }
      loading.value = false
    },
    (error) => {
      location.value = null
      locationError.value = `获取位置失败：${error.message}`
      loading.value = false
    },
    { enableHighAccuracy: true, timeout: 7000, maximumAge: 0 }
  )
}

const buildPayload = () => {
  const payload = {
    checkMethod: selectedMethod.value,
    remark: remark.value.trim() || undefined
  }
  if (selectedMethod.value === 'GPS') {
    return {
      ...payload,
      location: location.value ? `${location.value.latitude},${location.value.longitude}` : undefined,
      latitude: location.value?.latitude,
      longitude: location.value?.longitude
    }
  }
  if (selectedMethod.value === 'WIFI') {
    return {
      ...payload,
      location: wifiSsid.value.trim(),
      wifiSsid: wifiSsid.value.trim()
    }
  }
  return {
    ...payload,
    faceToken: faceToken.value.trim()
  }
}

const submitCheck = async (type: 'CHECK_IN' | 'CHECK_OUT') => {
  if (!canSubmit.value) {
    result.value = { success: false, message: '请先完成当前打卡方式所需信息' }
    return
  }

  loading.value = true
  result.value = null
  try {
    if (type === 'CHECK_IN') {
      await hrCheckIn(buildPayload())
    } else {
      await hrCheckOut(buildPayload())
    }
    result.value = { success: true, message: `${CHECK_TYPE_LABEL[type]}成功` }
    toast.success(`${CHECK_TYPE_LABEL[type]}成功`)
    await loadRecords()
  } catch (error) {
    const message = getErrorMessage(error, '打卡失败')
    result.value = { success: false, message }
    toast.error(message)
  } finally {
    loading.value = false
  }
}

watch(selectedMethod, (method) => {
  result.value = null
  if (method === 'GPS' && !location.value) getLocation()
})

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = new Date()
  }, 1000)
  void loadAll().then(() => {
    if (selectedMethod.value === 'GPS') getLocation()
  })
})

onUnmounted(() => {
  if (timer) window.clearInterval(timer)
})
</script>

<template>
  <div class="space-y-5">
    <div class="page-header">
      <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-400 dark:text-dark-400">
        <Clock3 class="h-3.5 w-3.5 text-primary-600 dark:text-primary-400" />
        Attendance Check-In
      </div>
      <h1 class="page-title mt-1.5">考勤打卡</h1>
      <p class="page-description">{{ dateLabel }} · {{ currentMinuteLabel }} · {{ phaseInfo.title }}</p>
    </div>

    <div v-if="selfServiceRestriction" class="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
      <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" />
      <span>{{ selfServiceRestriction }}</span>
    </div>

    <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section class="card overflow-hidden">
        <div class="card-header flex flex-wrap items-center justify-between gap-3">
          <div>
            <div class="text-sm font-semibold text-gray-900 dark:text-white">{{ employee?.name || auth.user?.name || '当前员工' }}</div>
            <div class="mt-1 text-xs text-gray-500 dark:text-dark-400">{{ phaseInfo.hint }}</div>
          </div>
          <Button variant="outline" size="sm" :disabled="loading || ruleLoading" @click="loadAll">
            <RefreshCw class="h-3.5 w-3.5" :class="loading || ruleLoading ? 'animate-spin' : ''" />
            刷新
          </Button>
        </div>

        <div class="card-body space-y-5">
          <div class="rounded-2xl border border-gray-100 bg-gray-50/80 p-5 dark:border-dark-700 dark:bg-dark-900/60">
            <div class="text-[42px] font-semibold leading-none tracking-[0.08em] text-gray-900 dark:text-white">{{ currentTimeLabel }}</div>
            <div class="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-dark-400">
              <span>{{ dateLabel }}</span>
              <span>{{ shiftLabel }}</span>
            </div>
          </div>

          <div class="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
            <label class="space-y-2">
              <span class="input-label">打卡方式</span>
              <Select v-model="selectedMethod" :options="methodOptions" />
            </label>

            <div class="space-y-2">
              <span class="input-label">打卡凭据</span>
              <div v-if="selectedMethod === 'GPS'" class="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-dark-700 dark:bg-dark-800/70">
                <MapPin class="h-4 w-4 shrink-0 text-primary-600 dark:text-primary-400" />
                <div class="min-w-0 flex-1 text-sm text-gray-700 dark:text-gray-200">{{ locationSummary }}</div>
                <Button variant="outline" size="sm" :disabled="loading || Boolean(selfServiceRestriction)" @click="getLocation">
                  <RefreshCw class="h-3.5 w-3.5" :class="loading ? 'animate-spin' : ''" />
                  定位
                </Button>
              </div>
              <Input v-else-if="selectedMethod === 'WIFI'" v-model="wifiSsid" placeholder="输入当前 Wi-Fi SSID" />
              <Input v-else v-model="faceToken" placeholder="输入人脸识别凭证" />
            </div>
          </div>

          <Input v-model="remark" label="备注" placeholder="可选" />

          <div class="grid gap-3 sm:grid-cols-2">
            <Button class="h-14 justify-start" :disabled="!canSubmit || loading" @click="submitCheck('CHECK_IN')">
              <span class="flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-white/15">
                <LogIn class="h-4 w-4" />
              </span>
              上班打卡
            </Button>
            <Button class="h-14 justify-start" variant="danger" :disabled="!canSubmit || loading" @click="submitCheck('CHECK_OUT')">
              <span class="flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-white/15">
                <LogOut class="h-4 w-4" />
              </span>
              下班签退
            </Button>
          </div>

          <div
            class="rounded-xl border px-4 py-4 text-sm leading-6"
            :class="result ? (result.success ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200' : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200') : 'border-gray-200 bg-gray-50 text-gray-500 dark:border-dark-700 dark:bg-dark-900/60 dark:text-dark-400'"
          >
            <div class="flex items-start gap-3">
              <CheckCircle2 v-if="result?.success" class="mt-0.5 h-4 w-4" />
              <AlertCircle v-else-if="result" class="mt-0.5 h-4 w-4" />
              <Clock3 v-else class="mt-0.5 h-4 w-4" />
              <div>
                <div class="font-semibold">{{ result ? (result.success ? '打卡成功' : '打卡失败') : '等待打卡' }}</div>
                <div class="mt-1 text-xs">{{ result?.message || '完成打卡方式凭据后可提交。' }}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <aside class="space-y-5">
        <Panel title="今日规则">
          <template #icon><Calendar class="h-4 w-4 text-gray-500" /></template>
          <div class="space-y-3 text-sm">
            <div class="flex items-center justify-between gap-3"><span class="text-gray-500 dark:text-dark-400">规则</span><span class="font-medium text-gray-900 dark:text-white">{{ rule?.ruleName || '-' }}</span></div>
            <div class="flex items-center justify-between gap-3"><span class="text-gray-500 dark:text-dark-400">来源</span><span class="font-medium text-gray-900 dark:text-white">{{ sourceLabel }}</span></div>
            <div class="flex items-center justify-between gap-3"><span class="text-gray-500 dark:text-dark-400">日历</span><StatusBadge :label="dayTypeLabel" tone="cyan" /></div>
            <div class="flex items-center justify-between gap-3"><span class="text-gray-500 dark:text-dark-400">班次</span><span class="font-medium text-gray-900 dark:text-white">{{ rule?.shiftName || '-' }}</span></div>
            <div class="flex items-center justify-between gap-3"><span class="text-gray-500 dark:text-dark-400">时间</span><span class="font-medium text-gray-900 dark:text-white">{{ shiftLabel }}</span></div>
            <div class="flex items-center justify-between gap-3"><span class="text-gray-500 dark:text-dark-400">半径</span><span class="font-medium text-gray-900 dark:text-white">{{ rule?.radius ?? '-' }} 米</span></div>
            <div class="flex flex-wrap gap-2 pt-1">
              <span v-for="method in rule?.checkMethods || []" :key="method" class="badge badge-primary">
                <MapPin v-if="method === 'GPS'" class="h-3 w-3" />
                <Wifi v-else-if="method === 'WIFI'" class="h-3 w-3" />
                <Fingerprint v-else class="h-3 w-3" />
                {{ CHECK_METHOD_LABEL[method] || method }}
              </span>
            </div>
          </div>
        </Panel>

        <Panel title="今日记录">
          <template #icon><Clock3 class="h-4 w-4 text-gray-500" /></template>
          <DataTable :columns="recordColumns" :data="records" :loading="recordsLoading" row-key="id" :sticky-first-column="false">
            <template #cell-checkType="{ row }">{{ getCheckTypeLabel(row.checkType) }}</template>
            <template #cell-checkTime="{ row }">{{ formatDateTime(row.checkTime) }}</template>
            <template #cell-checkMethod="{ row }">{{ getCheckMethodLabel(row.checkMethod) }}</template>
            <template #cell-location="{ row }">
              <span class="block max-w-[180px] truncate">{{ row.location || '-' }}</span>
            </template>
            <template #cell-status="{ row }">
              <StatusBadge :label="getStatusLabel(row.status)" :tone="statusTone(row.status)" />
            </template>
          </DataTable>
        </Panel>
      </aside>
    </div>
  </div>
</template>
