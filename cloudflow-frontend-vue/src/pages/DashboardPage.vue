<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { Component } from 'vue'
import { useRouter } from 'vue-router'
import {
  Activity,
  BarChart3,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  FileText,
  Megaphone,
  PlayCircle,
  RefreshCcw,
  Timer,
  Users
} from 'lucide-vue-next'
import { Button, EmptyState, Input, Panel, Select, StatCard, StatusBadge, type SelectOption } from '@/components/common'
import { getMyAnnouncements, markAnnouncementRead } from '@/services/api/announcement'
import { getMyEvents, type SysScheduleEvent } from '@/services/api/schedule'
import {
  getCopyUnreadCount,
  getMyInstances,
  getTaskStatistics,
  getTodoTasks,
  normalizeWorkflowRows,
  type WorkflowRecord
} from '@/services/api/workflow'
import { getWorkplaceSummary, type WorkplaceSummary } from '@/services/api/workplace'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import type { Announcement } from '@/types'
import { getErrorMessage } from '@/utils/errorMessage'
import { formatNumber } from '@/pages/hr/hrUtils'

type DashboardGranularity = 'day' | 'hour'
type Tone = 'slate' | 'green' | 'red' | 'yellow' | 'cyan'

interface TaskStatisticsResponse extends WorkflowRecord {
  timePeriod?: {
    todayTodo?: number
    weekTodo?: number
    monthTodo?: number
  }
  status?: {
    todo?: number
    done?: number
    timeout?: number
  }
  avgDurationMinutes?: number
  completionRate?: string
  myInstanceCount?: number
}

interface DashboardOverview {
  pendingCount: number
  myAppsCount: number
  copyCount: number
  doneCount: number
  todayTodoCount: number
  weekTodoCount: number
  monthTodoCount: number
  timeoutCount: number
  avgDurationMinutes: number
  completionRate: number
  todayScheduleCount: number
  unreadAnnouncementCount: number
}

interface TrendBucket {
  key: string
  label: string
  shortLabel: string
  tasks: number
  applications: number
  announcements: number
  schedules: number
}

interface ActivityItem {
  id: string
  title: string
  description: string
  timeLabel: string
  typeLabel: string
  tone: Tone
  icon: Component
  path: string
  sortTime: number
  announcementId?: number
}

const router = useRouter()
const auth = useAuthStore()
const toast = useToastStore()

const loadingOverview = ref(false)
const loadingPanels = ref(false)
const summary = ref<WorkplaceSummary | null>(null)
const overview = ref<DashboardOverview | null>(null)
const todoTasks = ref<WorkflowRecord[]>([])
const myApplications = ref<WorkflowRecord[]>([])
const announcements = ref<Announcement[]>([])
const schedules = ref<SysScheduleEvent[]>([])
const startDate = ref(formatDate(addDays(new Date(), -6)))
const endDate = ref(formatDate(new Date()))
const granularity = ref<DashboardGranularity>('day')

const granularityOptions: SelectOption[] = [
  { value: 'day', label: '按天' },
  { value: 'hour', label: '按小时' }
]

const quickActions = [
  {
    label: '发起流程',
    description: '进入流程目录，快速发起业务审批',
    path: '/workplace',
    icon: PlayCircle,
    toneClass: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-200'
  },
  {
    label: '任务中心',
    description: '集中处理待办、已办和我的申请',
    path: '/tasks',
    icon: ClipboardCheck,
    toneClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200'
  },
  {
    label: '公告中心',
    description: '查看最新通知、制度变更和全员提醒',
    path: '/announcement',
    icon: Megaphone,
    toneClass: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-200'
  },
  {
    label: '今日日程',
    description: '打开日历，查看会议和个人安排',
    path: '/schedule',
    icon: CalendarDays,
    toneClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
  },
  {
    label: '会议室预订',
    description: '查看会议室资源并发起预订',
    path: '/meeting-room',
    icon: Users,
    toneClass: 'bg-sky-100 text-sky-700 dark:bg-sky-950/30 dark:text-sky-200'
  }
]

const displayName = computed(() => summary.value?.user?.name || auth.user?.name || 'CloudFlow 用户')
const department = computed(() => summary.value?.user?.department || auth.user?.deptName || '默认组织')
const rangeLabel = computed(() => formatRangeLabel(startDate.value, endDate.value))

const stats = computed(() => {
  const item = overview.value
  return [
    {
      title: '待办审批',
      value: formatNumber(item?.pendingCount),
      description: `今日 ${formatNumber(item?.todayTodoCount)} / 本周 ${formatNumber(item?.weekTodoCount)}`,
      icon: ClipboardList
    },
    {
      title: '我的申请',
      value: formatNumber(item?.myAppsCount),
      description: '我发起并跟踪的流程',
      icon: FileText
    },
    {
      title: '抄送未读',
      value: formatNumber(item?.copyCount),
      description: '需要确认的抄送流程',
      icon: Bell
    },
    {
      title: '完成率',
      value: `${formatNumber(item?.completionRate)}%`,
      description: `已办 ${formatNumber(item?.doneCount)} / 超时 ${formatNumber(item?.timeoutCount)}`,
      icon: CheckCircle2
    },
    {
      title: '今日日程',
      value: formatNumber(item?.todayScheduleCount),
      description: '今日会议与个人安排',
      icon: CalendarDays
    },
    {
      title: '未读公告',
      value: formatNumber(item?.unreadAnnouncementCount),
      description: '公司通知与制度提醒',
      icon: Megaphone
    },
    {
      title: '平均耗时',
      value: `${formatNumber(item?.avgDurationMinutes)} 分钟`,
      description: '流程平均处理时长',
      icon: Timer
    },
    {
      title: '月度待办',
      value: formatNumber(item?.monthTodoCount),
      description: '本月累计待处理任务',
      icon: Activity
    }
  ]
})

const distribution = computed(() => [
  {
    label: '待办审批',
    count: todoTasks.value.length,
    description: '当前时间范围内需要处理的审批任务',
    tone: 'cyan' as Tone,
    barClass: 'bg-cyan-500'
  },
  {
    label: '我的申请',
    count: myApplications.value.length,
    description: '我发起并仍在跟踪的流程申请',
    tone: 'green' as Tone,
    barClass: 'bg-emerald-500'
  },
  {
    label: '公告提醒',
    count: announcements.value.length,
    description: '命中当前时间范围的公司公告',
    tone: 'yellow' as Tone,
    barClass: 'bg-amber-500'
  },
  {
    label: '日程安排',
    count: schedules.value.length,
    description: '时间范围内的会议与个人安排',
    tone: 'slate' as Tone,
    barClass: 'bg-slate-500'
  }
])

const distributionMax = computed(() => Math.max(1, ...distribution.value.map((item) => item.count)))

const trendData = computed(() => {
  const buckets = buildTrendBuckets(startDate.value, endDate.value, granularity.value)
  const bucketMap = new Map(buckets.map((bucket) => [bucket.key, bucket]))

  todoTasks.value.forEach((item) => {
    const bucket = bucketMap.get(getBucketKey(getRecordString(item, 'createTime') || getRecordString(item, 'createdTime'), granularity.value))
    if (bucket) bucket.tasks += 1
  })
  myApplications.value.forEach((item) => {
    const bucket = bucketMap.get(getBucketKey(getRecordString(item, 'createTime') || getRecordString(item, 'createdTime'), granularity.value))
    if (bucket) bucket.applications += 1
  })
  announcements.value.forEach((item) => {
    const bucket = bucketMap.get(getBucketKey(item.publishTime || item.createTime, granularity.value))
    if (bucket) bucket.announcements += 1
  })
  schedules.value.forEach((item) => {
    const bucket = bucketMap.get(getBucketKey(item.startTime, granularity.value))
    if (bucket) bucket.schedules += 1
  })

  return buckets
})

const trendMax = computed(() => Math.max(1, ...trendData.value.map((item) => trendTotal(item))))

const recentActivities = computed<ActivityItem[]>(() => {
  const items: ActivityItem[] = []

  todoTasks.value.forEach((item) => {
    const timeValue = getRecordString(item, 'createTime') || getRecordString(item, 'createdTime') || getRecordString(item, 'startTime')
    items.push({
      id: `todo-${getRecordString(item, 'taskId') || getRecordString(item, 'id') || getRecordString(item, 'processInstanceId') || items.length}`,
      title: getRecordString(item, 'title') || getRecordString(item, 'workflowName') || getRecordString(item, 'taskName') || '待办审批',
      description: getRecordString(item, 'nodeName') || getRecordString(item, 'currentNodeName') || getRecordString(item, 'processNo') || '待处理节点',
      timeLabel: formatRelativeTime(timeValue),
      typeLabel: '待办审批',
      tone: 'cyan',
      icon: ClipboardCheck,
      path: '/tasks',
      sortTime: parseDateLike(timeValue)?.getTime() ?? 0
    })
  })

  myApplications.value.forEach((item) => {
    const timeValue = getRecordString(item, 'createTime') || getRecordString(item, 'createdTime') || getRecordString(item, 'startTime')
    items.push({
      id: `app-${getRecordString(item, 'processInstanceId') || getRecordString(item, 'id') || items.length}`,
      title: getRecordString(item, 'title') || getRecordString(item, 'processDefinitionName') || getRecordString(item, 'processName') || '流程申请',
      description: getRecordString(item, 'currentNodeName') || getRecordString(item, 'processNo') || '查看流程当前状态',
      timeLabel: formatRelativeTime(timeValue),
      typeLabel: '我的申请',
      tone: 'green',
      icon: FileText,
      path: '/my-apps',
      sortTime: parseDateLike(timeValue)?.getTime() ?? 0
    })
  })

  announcements.value.forEach((item) => {
    const timeValue = item.publishTime || item.createTime
    items.push({
      id: `notice-${item.announcementId}`,
      title: item.title || '公告提醒',
      description: buildExcerpt(item.content),
      timeLabel: formatRelativeTime(timeValue),
      typeLabel: '公告提醒',
      tone: item.isRead ? 'slate' : 'yellow',
      icon: Bell,
      path: '/announcement',
      sortTime: parseDateLike(timeValue)?.getTime() ?? 0,
      announcementId: item.announcementId
    })
  })

  schedules.value.forEach((item) => {
    const timeValue = item.startTime
    items.push({
      id: `schedule-${item.eventId || items.length}`,
      title: item.title || '日程安排',
      description: item.description || formatScheduleRange(item),
      timeLabel: formatRelativeTime(timeValue),
      typeLabel: '日程安排',
      tone: 'slate',
      icon: CalendarDays,
      path: '/schedule',
      sortTime: parseDateLike(timeValue)?.getTime() ?? 0
    })
  })

  return items.sort((left, right) => right.sortTime - left.sortTime).slice(0, 8)
})

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function formatDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function parseDateLike(value?: string | null) {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return parseLocalDate(value)
  const normalized = value.includes(' ') ? value.replace(' ', 'T') : value
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

function safeNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function parsePercent(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const parsed = Number.parseFloat(String(value || '').replace('%', ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function getRecordString(record: WorkflowRecord, key: string) {
  const value = record[key]
  if (value === null || value === undefined) return ''
  return String(value)
}

function isWithinRange(value: string | undefined, start: string, end: string) {
  const date = parseDateLike(value)
  if (!date) return false
  const startDateValue = parseLocalDate(start)
  const endDateValue = parseLocalDate(end)
  endDateValue.setHours(23, 59, 59, 999)
  return date >= startDateValue && date <= endDateValue
}

function formatRelativeTime(value?: string) {
  const date = parseDateLike(value)
  if (!date) return '刚刚'
  const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60000)
  if (diffMinutes < 1) return '刚刚'
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} 小时前`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays} 天前`
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`
}

function formatTimeOnly(value?: string) {
  const date = parseDateLike(value)
  if (!date) return ''
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatScheduleRange(item: SysScheduleEvent) {
  if (item.isAllDay) return '全天安排'
  const start = formatTimeOnly(item.startTime)
  const end = formatTimeOnly(item.endTime)
  return start && end ? `${start} - ${end}` : start || end || '时间待定'
}

function buildExcerpt(value?: string) {
  return String(value || '暂无公告内容')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 72) || '暂无公告内容'
}

function formatRangeLabel(start: string, end: string) {
  if (start === end) return `${start} 当天`
  const diffDays = Math.floor((parseLocalDate(end).getTime() - parseLocalDate(start).getTime()) / 86400000)
  if (diffDays === 6) return '最近 7 天'
  if (diffDays === 29) return '最近 30 天'
  return `${start} 至 ${end}`
}

function buildTrendBuckets(start: string, end: string, mode: DashboardGranularity) {
  const buckets: TrendBucket[] = []
  const cursor = parseLocalDate(start)
  const endDateValue = parseLocalDate(end)

  if (mode === 'day') {
    while (cursor <= endDateValue) {
      buckets.push({
        key: formatDate(cursor),
        label: `${cursor.getMonth() + 1} 月 ${cursor.getDate()} 日`,
        shortLabel: `${cursor.getMonth() + 1}/${cursor.getDate()}`,
        tasks: 0,
        applications: 0,
        announcements: 0,
        schedules: 0
      })
      cursor.setDate(cursor.getDate() + 1)
    }
    return buckets
  }

  endDateValue.setHours(23, 0, 0, 0)
  while (cursor <= endDateValue) {
    buckets.push({
      key: `${formatDate(cursor)} ${pad(cursor.getHours())}:00`,
      label: `${cursor.getMonth() + 1}/${cursor.getDate()} ${pad(cursor.getHours())}:00`,
      shortLabel: `${pad(cursor.getHours())}:00`,
      tasks: 0,
      applications: 0,
      announcements: 0,
      schedules: 0
    })
    cursor.setHours(cursor.getHours() + 1)
  }
  return buckets
}

function getBucketKey(value: string | undefined, mode: DashboardGranularity) {
  const date = parseDateLike(value)
  if (!date) return ''
  if (mode === 'day') return formatDate(date)
  return `${formatDate(date)} ${pad(date.getHours())}:00`
}

function trendTotal(bucket: TrendBucket) {
  return bucket.tasks + bucket.applications + bucket.announcements + bucket.schedules
}

function barWidth(count: number) {
  return `${Math.max(3, Math.round((count / distributionMax.value) * 100))}%`
}

function trendHeight(count: number) {
  return `${Math.max(count > 0 ? 10 : 3, Math.round((count / trendMax.value) * 100))}%`
}

function applyPreset(days: number) {
  endDate.value = formatDate(new Date())
  startDate.value = formatDate(addDays(new Date(), -days + 1))
  granularity.value = days === 1 ? 'hour' : 'day'
}

async function openActivity(item: ActivityItem) {
  if (item.announcementId) {
    try {
      await markAnnouncementRead(item.announcementId)
      announcements.value = announcements.value.map((announcement) =>
        announcement.announcementId === item.announcementId ? { ...announcement, isRead: true } : announcement
      )
    } catch {
      // 阅读状态失败不阻塞跳转。
    }
  }
  await router.push(item.path)
}

async function fetchOverview() {
  loadingOverview.value = true
  try {
    const today = formatDate(new Date())
    const [summaryResult, taskStatsResult, copyCountResult, announcementsResult, schedulesResult] = await Promise.allSettled([
      getWorkplaceSummary(),
      getTaskStatistics(),
      getCopyUnreadCount(),
      getMyAnnouncements(),
      getMyEvents(today, today)
    ])

    if (summaryResult.status === 'fulfilled') summary.value = summaryResult.value
    const taskStats = taskStatsResult.status === 'fulfilled' ? taskStatsResult.value as TaskStatisticsResponse : {}
    const allAnnouncements = announcementsResult.status === 'fulfilled' ? announcementsResult.value : []
    const todaySchedules = schedulesResult.status === 'fulfilled' ? schedulesResult.value : []

    overview.value = {
      pendingCount: safeNumber(taskStats.status?.todo),
      myAppsCount: safeNumber(taskStats.myInstanceCount),
      copyCount: copyCountResult.status === 'fulfilled' ? safeNumber(copyCountResult.value) : 0,
      doneCount: safeNumber(taskStats.status?.done),
      todayTodoCount: safeNumber(taskStats.timePeriod?.todayTodo),
      weekTodoCount: safeNumber(taskStats.timePeriod?.weekTodo),
      monthTodoCount: safeNumber(taskStats.timePeriod?.monthTodo),
      timeoutCount: safeNumber(taskStats.status?.timeout),
      avgDurationMinutes: safeNumber(taskStats.avgDurationMinutes),
      completionRate: parsePercent(taskStats.completionRate),
      todayScheduleCount: todaySchedules.length,
      unreadAnnouncementCount: allAnnouncements.filter((item) => !item.isRead).length
    }
  } catch (error) {
    toast.error(getErrorMessage(error, '仪表盘统计加载失败'))
  } finally {
    loadingOverview.value = false
  }
}

async function fetchPanels() {
  loadingPanels.value = true
  try {
    const [todoResult, appResult, announcementsResult, schedulesResult] = await Promise.allSettled([
      getTodoTasks({ pageNum: 1, pageSize: 80, startTimeFrom: startDate.value, startTimeTo: endDate.value }),
      getMyInstances({ pageNum: 1, pageSize: 80, startTimeFrom: startDate.value, startTimeTo: endDate.value }),
      getMyAnnouncements(),
      getMyEvents(startDate.value, endDate.value)
    ])

    todoTasks.value = todoResult.status === 'fulfilled' ? normalizeWorkflowRows(todoResult.value) : []
    myApplications.value = appResult.status === 'fulfilled' ? normalizeWorkflowRows(appResult.value) : []
    announcements.value = announcementsResult.status === 'fulfilled'
      ? announcementsResult.value.filter((item) => isWithinRange(item.publishTime || item.createTime, startDate.value, endDate.value))
      : []
    schedules.value = schedulesResult.status === 'fulfilled' ? schedulesResult.value : []
  } catch (error) {
    toast.error(getErrorMessage(error, '近期活动加载失败'))
  } finally {
    loadingPanels.value = false
  }
}

async function refreshDashboard() {
  await Promise.all([fetchOverview(), fetchPanels()])
}

watch([startDate, endDate], () => void fetchPanels())

onMounted(() => void refreshDashboard())
</script>

<template>
  <div class="space-y-5">
    <section class="card-glass overflow-hidden rounded-2xl p-5 md:p-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
            <Activity class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
            Workspace Dashboard
          </div>
          <h1 class="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {{ displayName }} · {{ department }}
          </h1>
          <p class="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            聚合待办、我的申请、公告、抄送和日程，按时间范围查看当前工作压力与最近活动。
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button variant="outline" :disabled="loadingOverview || loadingPanels" @click="refreshDashboard">
            <RefreshCcw class="h-4 w-4" :class="loadingOverview || loadingPanels ? 'animate-spin' : ''" />
            刷新
          </Button>
          <Button @click="router.push('/workplace')">
            <PlayCircle class="h-4 w-4" />
            发起流程
          </Button>
        </div>
      </div>
    </section>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatCard v-for="item in stats" :key="item.title" :title="item.title" :value="item.value" :description="item.description">
        <template #icon>
          <component :is="item.icon" class="h-8 w-8 text-cyan-600 dark:text-cyan-300" />
        </template>
      </StatCard>
    </div>

    <Panel title="时间范围与趋势">
      <template #icon><BarChart3 class="h-4 w-4 text-slate-500" /></template>
      <template #actions>
        <div class="text-xs text-slate-500 dark:text-slate-400">{{ rangeLabel }}</div>
      </template>

      <div class="grid gap-3 lg:grid-cols-[180px_180px_160px_auto]">
        <Input v-model="startDate" label="开始日期" type="date" />
        <Input v-model="endDate" label="结束日期" type="date" />
        <label class="space-y-1.5">
          <span class="text-sm font-medium text-slate-700 dark:text-slate-200">粒度</span>
          <Select v-model="granularity" :options="granularityOptions" />
        </label>
        <div class="flex flex-wrap items-end gap-2">
          <Button variant="outline" @click="applyPreset(1)">今天</Button>
          <Button variant="outline" @click="applyPreset(7)">近 7 天</Button>
          <Button variant="outline" @click="applyPreset(30)">近 30 天</Button>
        </div>
      </div>

      <div class="mt-5 grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <div class="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/50">
          <div v-for="item in distribution" :key="item.label" class="space-y-2">
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <StatusBadge :label="item.label" :tone="item.tone" />
                  <span class="text-sm font-semibold text-slate-900 dark:text-slate-100">{{ formatNumber(item.count) }}</span>
                </div>
                <p class="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{{ item.description }}</p>
              </div>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-white dark:bg-slate-950">
              <div class="h-full rounded-full transition-all duration-300" :class="item.barClass" :style="{ width: barWidth(item.count) }" />
            </div>
          </div>
        </div>

        <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/80">
          <div class="flex h-64 min-w-[720px] items-end gap-2">
            <div v-for="bucket in trendData" :key="bucket.key" class="flex min-w-8 flex-1 flex-col items-center justify-end gap-2">
              <div class="flex h-48 w-full items-end justify-center gap-0.5 rounded-lg bg-slate-50 px-1 pb-1 dark:bg-slate-900/70" :title="bucket.label">
                <div class="w-1.5 rounded-t bg-cyan-500" :style="{ height: trendHeight(bucket.tasks) }" />
                <div class="w-1.5 rounded-t bg-emerald-500" :style="{ height: trendHeight(bucket.applications) }" />
                <div class="w-1.5 rounded-t bg-amber-500" :style="{ height: trendHeight(bucket.announcements) }" />
                <div class="w-1.5 rounded-t bg-slate-500" :style="{ height: trendHeight(bucket.schedules) }" />
              </div>
              <div class="w-full truncate text-center text-[11px] text-slate-400">{{ bucket.shortLabel }}</div>
            </div>
          </div>
          <div class="mt-3 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span class="inline-flex items-center gap-1"><i class="h-2 w-2 rounded-full bg-cyan-500" />待办</span>
            <span class="inline-flex items-center gap-1"><i class="h-2 w-2 rounded-full bg-emerald-500" />申请</span>
            <span class="inline-flex items-center gap-1"><i class="h-2 w-2 rounded-full bg-amber-500" />公告</span>
            <span class="inline-flex items-center gap-1"><i class="h-2 w-2 rounded-full bg-slate-500" />日程</span>
          </div>
        </div>
      </div>
    </Panel>

    <div class="grid gap-4 xl:grid-cols-[1.35fr_0.85fr]">
      <Panel title="最近活动">
        <template #icon><Clock3 class="h-4 w-4 text-slate-500" /></template>
        <template #actions>
          <span class="text-xs text-slate-500 dark:text-slate-400">{{ loadingPanels ? '加载中' : `${recentActivities.length} 条` }}</span>
        </template>
        <div v-if="recentActivities.length" class="space-y-3">
          <button
            v-for="item in recentActivities"
            :key="item.id"
            type="button"
            class="flex w-full items-start justify-between gap-4 rounded-xl border border-slate-100 bg-white p-4 text-left transition hover:border-teal-200 hover:bg-teal-50/50 dark:border-slate-800 dark:bg-slate-950/70 dark:hover:border-teal-900 dark:hover:bg-teal-950/20"
            @click="openActivity(item)"
          >
            <div class="flex min-w-0 gap-3">
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                <component :is="item.icon" class="h-5 w-5" />
              </div>
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <p class="truncate font-medium text-slate-900 dark:text-slate-100">{{ item.title }}</p>
                  <StatusBadge :label="item.typeLabel" :tone="item.tone" />
                </div>
                <p class="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{{ item.description }}</p>
              </div>
            </div>
            <div class="shrink-0 text-xs text-slate-400">{{ item.timeLabel }}</div>
          </button>
        </div>
        <EmptyState v-else title="当前范围暂无活动" description="切换时间范围后可以查看流程、公告和日程活动" />
      </Panel>

      <Panel title="快捷入口">
        <template #icon><PlayCircle class="h-4 w-4 text-slate-500" /></template>
        <div class="grid gap-3">
          <button
            v-for="action in quickActions"
            :key="action.path"
            type="button"
            class="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-4 text-left transition hover:border-teal-200 hover:bg-teal-50/50 dark:border-slate-800 dark:bg-slate-950/70 dark:hover:border-teal-900 dark:hover:bg-teal-950/20"
            @click="router.push(action.path)"
          >
            <div class="flex min-w-0 items-center gap-3">
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" :class="action.toneClass">
                <component :is="action.icon" class="h-5 w-5" />
              </div>
              <div class="min-w-0">
                <div class="font-medium text-slate-900 dark:text-slate-100">{{ action.label }}</div>
                <div class="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{{ action.description }}</div>
              </div>
            </div>
            <ChevronRight class="h-4 w-4 shrink-0 text-slate-400" />
          </button>
        </div>
      </Panel>
    </div>
  </div>
</template>
