<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Edit3,
  Eye,
  MapPin,
  Plus,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Users
} from 'lucide-vue-next'
import {
  BaseDialog,
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  Pagination,
  Panel,
  Select,
  StatCard,
  StatusBadge,
  TextArea,
  Toggle,
  type SelectOption
} from '@/components/common'
import {
  createEvent,
  deleteEvent,
  getMeetingRooms,
  getMyEvents,
  updateEvent,
  type MeetingRoom,
  type SysScheduleEvent
} from '@/services/api/schedule'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import { formatNumber } from '@/pages/hr/hrUtils'

type ViewMode = 'month' | 'week' | 'day' | 'list'
type ScheduleScope = 'ALL' | 'TODAY' | 'UPCOMING' | 'ALL_DAY'
type Tone = 'slate' | 'green' | 'red' | 'yellow' | 'cyan'

interface CalendarDay {
  date: Date
  value: string
  day: number
  label: string
  isCurrentMonth: boolean
  isToday: boolean
  isSelected: boolean
}

interface ScheduleForm {
  eventId?: number
  title: string
  description: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  isAllDay: boolean
  type: string
  roomId: string
  attendees: string
}

const toast = useToastStore()
const loading = ref(false)
const saving = ref(false)
const events = ref<SysScheduleEvent[]>([])
const rooms = ref<MeetingRoom[]>([])
const selectedDate = ref(todayValue())
const keyword = ref('')
const typeFilter = ref('ALL')
const scopeFilter = ref<ScheduleScope>('ALL')
const viewMode = ref<ViewMode>('month')
const pageNum = ref(1)
const pageSize = ref(8)
const dialogOpen = ref(false)
const detailEvent = ref<SysScheduleEvent | null>(null)
const editingEvent = ref<SysScheduleEvent | null>(null)
const pendingDelete = ref<SysScheduleEvent | null>(null)

const typeOptions: SelectOption[] = [
  { value: 'ALL', label: '全部类型' },
  { value: 'WORK', label: '工作' },
  { value: 'MEETING', label: '会议' },
  { value: 'PERSONAL', label: '个人' }
]

const scopeOptions: SelectOption[] = [
  { value: 'ALL', label: '全部时间' },
  { value: 'TODAY', label: '今日日程' },
  { value: 'UPCOMING', label: '即将开始' },
  { value: 'ALL_DAY', label: '全天事项' }
]

const form = ref<ScheduleForm>({
  title: '',
  description: '',
  startDate: todayValue(),
  startTime: '09:00',
  endDate: todayValue(),
  endTime: '10:00',
  isAllDay: false,
  type: 'WORK',
  roomId: '',
  attendees: ''
})

const selectedDateObject = computed(() => parseDate(selectedDate.value))
const monthStart = computed(() => new Date(selectedDateObject.value.getFullYear(), selectedDateObject.value.getMonth(), 1))
const monthEnd = computed(() => new Date(selectedDateObject.value.getFullYear(), selectedDateObject.value.getMonth() + 1, 0))
const weekStart = computed(() => startOfWeek(selectedDateObject.value))
const weekEnd = computed(() => addDays(weekStart.value, 6))

const calendarDays = computed<CalendarDay[]>(() => {
  const first = startOfWeek(monthStart.value)
  return Array.from({ length: 42 }, (_, index) => buildCalendarDay(addDays(first, index), monthStart.value.getMonth()))
})

const weekDays = computed<CalendarDay[]>(() =>
  Array.from({ length: 7 }, (_, index) => buildCalendarDay(addDays(weekStart.value, index), selectedDateObject.value.getMonth()))
)

const hours = computed(() => Array.from({ length: 15 }, (_, index) => index + 7))

const rangeStart = computed(() => {
  if (viewMode.value === 'week') return toDateValue(weekStart.value)
  if (viewMode.value === 'day') return selectedDate.value
  return calendarDays.value[0]?.value || toDateValue(monthStart.value)
})

const rangeEnd = computed(() => {
  if (viewMode.value === 'week') return toDateValue(weekEnd.value)
  if (viewMode.value === 'day') return selectedDate.value
  return calendarDays.value[calendarDays.value.length - 1]?.value || toDateValue(monthEnd.value)
})

const windowTitle = computed(() => {
  const date = selectedDateObject.value
  if (viewMode.value === 'month' || viewMode.value === 'list') return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`
  if (viewMode.value === 'week') return `${formatMonthDay(weekStart.value)} - ${formatMonthDay(weekEnd.value)}`
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`
})

const roomOptions = computed<SelectOption[]>(() => [
  { value: '', label: '无会议室' },
  ...rooms.value.map((room) => ({ value: String(room.roomId ?? ''), label: roomLabel(room) }))
])

const filteredEvents = computed(() => {
  const now = new Date()
  const query = keyword.value.trim().toLowerCase()
  return events.value
    .filter((event) => {
      const searchText = [event.title, event.description, roomName(event.roomId), typeLabel(event.type)].filter(Boolean).join(' ').toLowerCase()
      const matchKeyword = !query || searchText.includes(query)
      const matchType = typeFilter.value === 'ALL' || String(event.type || '').toUpperCase() === typeFilter.value
      const matchScope = matchesScope(event, scopeFilter.value, now)
      return matchKeyword && matchType && matchScope
    })
    .sort((left, right) => eventStartMs(left) - eventStartMs(right))
})

const selectedDayEvents = computed(() => filteredEvents.value.filter((event) => eventOverlapsDay(event, selectedDateObject.value)))
const tableTotal = computed(() => filteredEvents.value.length)
const tableRows = computed(() => {
  const start = (pageNum.value - 1) * pageSize.value
  return filteredEvents.value.slice(start, start + pageSize.value)
})

const summary = computed(() => {
  const now = new Date()
  const today = parseDate(todayValue())
  return [
    { title: '窗口日程', value: formatNumber(filteredEvents.value.length), description: `${rangeStart.value} 至 ${rangeEnd.value}`, icon: CalendarDays },
    { title: '今日日程', value: formatNumber(filteredEvents.value.filter((event) => eventOverlapsDay(event, today)).length), description: '当天会议与个人安排', icon: Clock3 },
    { title: '会议安排', value: formatNumber(filteredEvents.value.filter((event) => String(event.type || '').toUpperCase() === 'MEETING').length), description: '含会议室绑定', icon: Users },
    { title: '即将开始', value: formatNumber(filteredEvents.value.filter((event) => isUpcoming(event, now)).length), description: '未来 24 小时内', icon: MapPin }
  ]
})

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function todayValue() {
  return toDateValue(new Date())
}

function parseDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function parseDateTime(value?: string | null) {
  if (!value) return null
  const normalized = String(value).includes(' ') ? String(value).replace(' ', 'T') : String(value)
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

function toDateValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, Math.min(date.getDate(), 28))
}

function startOfWeek(date: Date) {
  const next = new Date(date)
  const day = next.getDay() || 7
  next.setDate(next.getDate() - day + 1)
  next.setHours(0, 0, 0, 0)
  return next
}

function buildCalendarDay(date: Date, currentMonth: number): CalendarDay {
  const value = toDateValue(date)
  return {
    date,
    value,
    day: date.getDate(),
    label: date.toLocaleDateString('zh-CN', { weekday: 'short' }),
    isCurrentMonth: date.getMonth() === currentMonth,
    isToday: value === todayValue(),
    isSelected: value === selectedDate.value
  }
}

function formatMonthDay(date: Date) {
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`
}

function toDateOnly(value?: string) {
  return String(value || '').slice(0, 10)
}

function toTimeOnly(value?: string) {
  const date = parseDateTime(value)
  if (date) return `${pad(date.getHours())}:${pad(date.getMinutes())}`
  return String(value || '').replace('T', ' ').slice(11, 16) || '09:00'
}

function eventStartMs(event: SysScheduleEvent) {
  return parseDateTime(event.startTime)?.getTime() ?? 0
}

function eventEndMs(event: SysScheduleEvent) {
  return parseDateTime(event.endTime)?.getTime() ?? eventStartMs(event)
}

function eventOverlapsDay(event: SysScheduleEvent, date: Date) {
  const start = parseDateTime(event.startTime)
  const end = parseDateTime(event.endTime)
  if (!start || !end) return false
  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const nextDay = addDays(dayStart, 1)
  return start < nextDay && end > dayStart
}

function eventsOfDay(day: string) {
  return filteredEvents.value.filter((event) => eventOverlapsDay(event, parseDate(day)))
}

function eventsOfHour(hour: number) {
  const start = new Date(selectedDateObject.value)
  start.setHours(hour, 0, 0, 0)
  const end = new Date(selectedDateObject.value)
  end.setHours(hour + 1, 0, 0, 0)
  return filteredEvents.value.filter((event) => {
    const eventStart = parseDateTime(event.startTime)
    const eventEnd = parseDateTime(event.endTime)
    if (!eventStart || !eventEnd || event.isAllDay) return false
    return eventStart < end && eventEnd > start
  })
}

function isUpcoming(event: SysScheduleEvent, now = new Date()) {
  const start = parseDateTime(event.startTime)
  if (!start) return false
  const diffHours = (start.getTime() - now.getTime()) / 3600000
  return diffHours >= 0 && diffHours <= 24
}

function matchesScope(event: SysScheduleEvent, scope: ScheduleScope, now: Date) {
  if (scope === 'TODAY') return eventOverlapsDay(event, now)
  if (scope === 'UPCOMING') return eventEndMs(event) >= now.getTime()
  if (scope === 'ALL_DAY') return Boolean(event.isAllDay)
  return true
}

function eventTimeRange(event: SysScheduleEvent) {
  if (event.isAllDay) return '全天'
  const start = toTimeOnly(event.startTime)
  const end = toTimeOnly(event.endTime)
  return `${start} - ${end}`
}

function eventFullRange(event: SysScheduleEvent) {
  const startDate = parseDateTime(event.startTime)
  const endDate = parseDateTime(event.endTime)
  if (!startDate || !endDate) return '时间信息不可用'
  if (event.isAllDay) return `${startDate.getFullYear()} 年 ${startDate.getMonth() + 1} 月 ${startDate.getDate()} 日 · 全天`
  if (toDateValue(startDate) === toDateValue(endDate)) {
    return `${formatMonthDay(startDate)} ${toTimeOnly(event.startTime)} - ${toTimeOnly(event.endTime)}`
  }
  return `${formatMonthDay(startDate)} ${toTimeOnly(event.startTime)} - ${formatMonthDay(endDate)} ${toTimeOnly(event.endTime)}`
}

function durationLabel(event: SysScheduleEvent) {
  if (event.isAllDay) return '全天'
  const diffMinutes = Math.max(0, Math.round((eventEndMs(event) - eventStartMs(event)) / 60000))
  const hoursValue = Math.floor(diffMinutes / 60)
  const minutes = diffMinutes % 60
  if (hoursValue > 0 && minutes > 0) return `${hoursValue} 小时 ${minutes} 分钟`
  if (hoursValue > 0) return `${hoursValue} 小时`
  return `${minutes} 分钟`
}

function typeLabel(type?: string) {
  const labels: Record<string, string> = {
    WORK: '工作',
    MEETING: '会议',
    PERSONAL: '个人'
  }
  return labels[String(type || '').toUpperCase()] || type || '工作'
}

function typeTone(type?: string): Tone {
  const value = String(type || '').toUpperCase()
  if (value === 'MEETING') return 'cyan'
  if (value === 'PERSONAL') return 'yellow'
  return 'green'
}

function statusMeta(event: SysScheduleEvent) {
  const now = Date.now()
  const start = eventStartMs(event)
  const end = eventEndMs(event)
  if (!start || !end) return { label: '时间异常', hint: '请检查开始与结束时间', tone: 'red' as Tone }
  if (end <= now) return { label: '已结束', hint: `结束于 ${toTimeOnly(event.endTime)}`, tone: 'slate' as Tone }
  if (start <= now && event.isAllDay) return { label: '全天进行中', hint: '当前日期整天占用', tone: 'yellow' as Tone }
  if (start <= now) return { label: '进行中', hint: `截至 ${toTimeOnly(event.endTime)}`, tone: 'green' as Tone }
  if ((start - now) / 3600000 <= 24) return { label: '即将开始', hint: `${toDateOnly(event.startTime)} ${toTimeOnly(event.startTime)}`, tone: 'cyan' as Tone }
  return { label: '待开始', hint: `${toDateOnly(event.startTime)} ${toTimeOnly(event.startTime)}`, tone: 'cyan' as Tone }
}

function roomLabel(room: MeetingRoom) {
  const name = room.roomName || room.name || `会议室 ${room.roomId}`
  const meta = [room.location, room.capacity ? `${room.capacity} 人` : ''].filter(Boolean).join(' / ')
  return meta ? `${name}（${meta}）` : name
}

function roomName(roomId?: number | null) {
  if (!roomId) return ''
  const room = rooms.value.find((item) => Number(item.roomId) === Number(roomId))
  return room ? roomLabel(room) : `会议室 ${roomId}`
}

function clearFilters() {
  keyword.value = ''
  typeFilter.value = 'ALL'
  scopeFilter.value = 'ALL'
  pageNum.value = 1
}

function shiftWindow(direction: number) {
  if (viewMode.value === 'month' || viewMode.value === 'list') selectedDate.value = toDateValue(addMonths(selectedDateObject.value, direction))
  else selectedDate.value = toDateValue(addDays(selectedDateObject.value, direction * (viewMode.value === 'week' ? 7 : 1)))
}

function resetForm(date = selectedDate.value) {
  form.value = {
    title: '',
    description: '',
    startDate: date,
    startTime: '09:00',
    endDate: date,
    endTime: '10:00',
    isAllDay: false,
    type: 'WORK',
    roomId: '',
    attendees: ''
  }
}

function openCreateDialog(date = selectedDate.value, hour?: number) {
  editingEvent.value = null
  resetForm(date)
  if (hour !== undefined) {
    form.value.startTime = `${pad(hour)}:00`
    form.value.endTime = `${pad(Math.min(hour + 1, 23))}:00`
  }
  dialogOpen.value = true
}

function openEditDialog(event: SysScheduleEvent) {
  editingEvent.value = event
  form.value = {
    eventId: event.eventId,
    title: event.title || '',
    description: event.description || '',
    startDate: toDateOnly(event.startTime) || selectedDate.value,
    startTime: toTimeOnly(event.startTime),
    endDate: toDateOnly(event.endTime) || selectedDate.value,
    endTime: toTimeOnly(event.endTime),
    isAllDay: Boolean(event.isAllDay),
    type: event.type || 'WORK',
    roomId: event.roomId ? String(event.roomId) : '',
    attendees: event.attendees || ''
  }
  detailEvent.value = null
  dialogOpen.value = true
}

function closeDialog() {
  dialogOpen.value = false
  editingEvent.value = null
}

function buildDateTime(date: string, time: string, isEnd = false) {
  if (form.value.isAllDay) return `${date} ${isEnd ? '23:59:59' : '00:00:00'}`
  return `${date} ${time || (isEnd ? '18:00' : '09:00')}:00`
}

function buildPayload() {
  return {
    eventId: form.value.eventId,
    title: form.value.title.trim(),
    description: form.value.description.trim(),
    startTime: buildDateTime(form.value.startDate, form.value.startTime),
    endTime: buildDateTime(form.value.endDate, form.value.endTime, true),
    isAllDay: form.value.isAllDay,
    type: form.value.type,
    roomId: form.value.type === 'MEETING' && form.value.roomId ? Number(form.value.roomId) : null,
    attendees: form.value.attendees.trim()
  }
}

async function fetchSchedules() {
  loading.value = true
  try {
    const [eventsResult, roomsResult] = await Promise.allSettled([
      getMyEvents(rangeStart.value, rangeEnd.value),
      getMeetingRooms()
    ])
    if (eventsResult.status === 'fulfilled') events.value = eventsResult.value || []
    if (roomsResult.status === 'fulfilled') rooms.value = roomsResult.value || []
  } catch (error) {
    toast.error(getErrorMessage(error, '日程加载失败'))
  } finally {
    loading.value = false
  }
}

async function saveSchedule() {
  if (!form.value.title.trim()) {
    toast.error('请填写日程主题')
    return
  }
  if (eventEndMs(buildPayload()) < eventStartMs(buildPayload())) {
    toast.error('结束时间不能早于开始时间')
    return
  }
  saving.value = true
  try {
    const payload = buildPayload()
    if (editingEvent.value) await updateEvent(payload)
    else await createEvent(payload)
    closeDialog()
    toast.success('保存成功')
    await fetchSchedules()
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
  } finally {
    saving.value = false
  }
}

async function confirmDelete() {
  const id = pendingDelete.value?.eventId
  if (!id) return
  saving.value = true
  try {
    await deleteEvent(id)
    pendingDelete.value = null
    detailEvent.value = null
    toast.success('删除成功')
    await fetchSchedules()
  } catch (error) {
    toast.error(getErrorMessage(error, '删除失败'))
  } finally {
    saving.value = false
  }
}

watch([rangeStart, rangeEnd], () => void fetchSchedules())
watch([keyword, typeFilter, scopeFilter], () => { pageNum.value = 1 })

onMounted(() => void fetchSchedules())
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <CalendarDays class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Workspace Schedule
        </div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">我的日程</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">按月、周、日和列表管理个人日程、会议安排与会议室占用</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" :disabled="loading" @click="fetchSchedules">
          <RefreshCcw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />
          刷新
        </Button>
        <Button @click="openCreateDialog()">
          <Plus class="h-4 w-4" />
          新建日程
        </Button>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatCard v-for="item in summary" :key="item.title" :title="item.title" :value="item.value" :description="item.description">
        <template #icon>
          <component :is="item.icon" class="h-8 w-8 text-cyan-600 dark:text-cyan-300" />
        </template>
      </StatCard>
    </div>

    <Panel title="筛选与视图">
      <template #icon><Search class="h-4 w-4 text-slate-500" /></template>
      <div class="grid gap-3 lg:grid-cols-[180px_1fr_170px_170px_auto]">
        <Input v-model="selectedDate" type="date" label="当前日期" />
        <Input v-model="keyword" label="关键词" placeholder="主题/备注/会议室" />
        <label class="space-y-1.5">
          <span class="text-sm font-medium text-slate-700 dark:text-slate-200">类型</span>
          <Select v-model="typeFilter" :options="typeOptions" />
        </label>
        <label class="space-y-1.5">
          <span class="text-sm font-medium text-slate-700 dark:text-slate-200">范围</span>
          <Select v-model="scopeFilter" :options="scopeOptions" />
        </label>
        <div class="flex items-end gap-2">
          <Button variant="outline" @click="clearFilters"><RotateCcw class="h-4 w-4" />重置</Button>
        </div>
      </div>
    </Panel>

    <Panel :title="windowTitle">
      <template #icon><CalendarDays class="h-4 w-4 text-slate-500" /></template>
      <template #actions>
        <div class="flex flex-wrap items-center gap-2">
          <div class="tabs">
            <button type="button" class="tab" :class="viewMode === 'month' && 'tab-active'" @click="viewMode = 'month'">月</button>
            <button type="button" class="tab" :class="viewMode === 'week' && 'tab-active'" @click="viewMode = 'week'">周</button>
            <button type="button" class="tab" :class="viewMode === 'day' && 'tab-active'" @click="viewMode = 'day'">日</button>
            <button type="button" class="tab" :class="viewMode === 'list' && 'tab-active'" @click="viewMode = 'list'">列表</button>
          </div>
          <Button size="icon" variant="outline" @click="shiftWindow(-1)"><ChevronLeft class="h-4 w-4" /></Button>
          <Button size="icon" variant="outline" @click="shiftWindow(1)"><ChevronRight class="h-4 w-4" /></Button>
        </div>
      </template>

      <div v-if="viewMode === 'month'" class="overflow-x-auto">
        <div class="grid min-w-[860px] grid-cols-7 gap-2">
          <div v-for="label in ['周一', '周二', '周三', '周四', '周五', '周六', '周日']" :key="label" class="px-2 pb-1 text-xs font-semibold text-slate-400">
            {{ label }}
          </div>
          <section
            v-for="day in calendarDays"
            :key="day.value"
            class="min-h-[8.5rem] rounded-xl border p-2 transition"
            :class="[
              day.isSelected ? 'border-teal-300 bg-teal-50/70 dark:border-teal-800 dark:bg-teal-950/20' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/70',
              !day.isCurrentMonth && 'opacity-55'
            ]"
          >
            <div class="mb-2 flex items-center justify-between gap-2">
              <button type="button" class="flex items-center gap-1 text-left text-sm font-semibold text-slate-800 dark:text-slate-100" @click="selectedDate = day.value">
                <span>{{ day.day }}</span>
                <span v-if="day.isToday" class="rounded-full bg-cyan-100 px-1.5 py-0.5 text-[10px] text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-200">今</span>
              </button>
              <Button size="icon" variant="ghost" @click="openCreateDialog(day.value)"><Plus class="h-3.5 w-3.5" /></Button>
            </div>
            <div class="space-y-1.5">
              <button
                v-for="event in eventsOfDay(day.value).slice(0, 3)"
                :key="event.eventId"
                type="button"
                class="w-full rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-teal-50 dark:hover:bg-teal-950/20"
                :class="typeTone(event.type) === 'cyan' ? 'bg-cyan-50 text-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-100' : typeTone(event.type) === 'yellow' ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-100' : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100'"
                @click="detailEvent = event"
              >
                <div class="truncate font-medium">{{ event.title || '日程安排' }}</div>
                <div class="mt-0.5 truncate opacity-75">{{ eventTimeRange(event) }}</div>
              </button>
              <div v-if="eventsOfDay(day.value).length > 3" class="text-[11px] text-slate-400">+{{ eventsOfDay(day.value).length - 3 }} 条</div>
            </div>
          </section>
        </div>
      </div>

      <div v-else-if="viewMode === 'week'" class="grid gap-3 xl:grid-cols-7">
        <section
          v-for="day in weekDays"
          :key="day.value"
          class="min-h-[18rem] rounded-xl border p-3 transition"
          :class="day.isSelected ? 'border-teal-300 bg-teal-50/60 dark:border-teal-800 dark:bg-teal-950/20' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/70'"
        >
          <div class="mb-3 flex items-center justify-between">
            <button type="button" class="text-left" @click="selectedDate = day.value">
              <div class="text-xs text-slate-500">{{ day.label }}</div>
              <div class="text-lg font-semibold text-slate-900 dark:text-slate-100">{{ day.day }}</div>
            </button>
            <Button size="icon" variant="ghost" @click="openCreateDialog(day.value)"><Plus class="h-4 w-4" /></Button>
          </div>
          <div class="space-y-2">
            <button
              v-for="event in eventsOfDay(day.value)"
              :key="event.eventId"
              type="button"
              class="w-full rounded-lg border border-slate-100 bg-white p-3 text-left shadow-sm transition hover:border-teal-200 hover:bg-teal-50/60 dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-teal-900 dark:hover:bg-teal-950/20"
              @click="detailEvent = event"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{{ event.title || '日程安排' }}</span>
                <StatusBadge :label="typeLabel(event.type)" :tone="typeTone(event.type)" />
              </div>
              <div class="mt-2 text-xs text-slate-500">{{ eventTimeRange(event) }}</div>
            </button>
            <div v-if="eventsOfDay(day.value).length === 0" class="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400 dark:border-slate-800">无日程</div>
          </div>
        </section>
      </div>

      <div v-else-if="viewMode === 'day'" class="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div class="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/70">
          <div v-for="hour in hours" :key="hour" class="grid min-h-[5rem] grid-cols-[72px_1fr] border-b border-slate-100 last:border-b-0 dark:border-slate-800">
            <div class="border-r border-slate-100 px-3 py-3 text-xs text-slate-400 dark:border-slate-800">{{ pad(hour) }}:00</div>
            <div class="space-y-2 p-3">
              <button
                v-for="event in eventsOfHour(hour)"
                :key="event.eventId"
                type="button"
                class="flex w-full items-center justify-between gap-3 rounded-xl border border-teal-100 bg-teal-50/70 p-3 text-left transition hover:bg-teal-50 dark:border-teal-900 dark:bg-teal-950/20"
                @click="detailEvent = event"
              >
                <div class="min-w-0">
                  <div class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{{ event.title || '日程安排' }}</div>
                  <div class="mt-1 text-xs text-slate-500">{{ eventTimeRange(event) }} · {{ roomName(event.roomId) || typeLabel(event.type) }}</div>
                </div>
                <StatusBadge :label="statusMeta(event).label" :tone="statusMeta(event).tone" />
              </button>
              <Button v-if="eventsOfHour(hour).length === 0" size="sm" variant="ghost" @click="openCreateDialog(selectedDate, hour)">
                <Plus class="h-3.5 w-3.5" />添加
              </Button>
            </div>
          </div>
        </div>
        <div class="space-y-3">
          <div v-if="selectedDayEvents.filter((event) => event.isAllDay).length" class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70">
            <div class="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">全天事项</div>
            <button
              v-for="event in selectedDayEvents.filter((item) => item.isAllDay)"
              :key="event.eventId"
              type="button"
              class="mb-2 w-full rounded-lg bg-amber-50 p-3 text-left text-sm text-amber-800 last:mb-0 dark:bg-amber-950/30 dark:text-amber-100"
              @click="detailEvent = event"
            >
              {{ event.title || '全天安排' }}
            </button>
          </div>
          <EmptyState v-if="selectedDayEvents.length === 0" title="当天暂无日程" description="可以在时间轴上添加新的安排" />
        </div>
      </div>

      <div v-else class="text-sm text-slate-500 dark:text-slate-400">
        当前窗口共有 {{ formatNumber(filteredEvents.length) }} 条日程，下面列表可继续筛选和分页处理。
      </div>
    </Panel>

    <Panel title="日程列表">
      <template #icon><Clock3 class="h-4 w-4 text-slate-500" /></template>
      <template #actions>
        <span class="text-xs text-slate-500 dark:text-slate-400">{{ tableTotal ? `${(pageNum - 1) * pageSize + 1}-${Math.min(pageNum * pageSize, tableTotal)} / ${tableTotal}` : '0 / 0' }}</span>
      </template>
      <div class="overflow-x-auto">
        <table class="table min-w-[1040px] table-fixed">
          <colgroup>
            <col class="w-[34%]" />
            <col class="w-[22%]" />
            <col class="w-[22%]" />
            <col class="w-[12%]" />
            <col class="w-[10%]" />
          </colgroup>
          <thead>
            <tr>
              <th>主题</th>
              <th class="whitespace-nowrap">时间</th>
              <th>地点</th>
              <th class="whitespace-nowrap">状态</th>
              <th class="whitespace-nowrap text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="5" class="py-12 text-center text-slate-500">正在加载日程...</td>
            </tr>
            <tr v-else-if="tableRows.length === 0">
              <td colspan="5" class="py-12">
                <EmptyState title="当前筛选下暂无日程" description="切换类型、时间范围或清空关键词后重新查看" />
              </td>
            </tr>
            <tr v-for="event in tableRows" v-else :key="event.eventId">
              <td>
                <div class="flex min-w-0 items-center gap-2">
                  <span class="h-2 w-2 shrink-0 rounded-full" :class="typeTone(event.type) === 'cyan' ? 'bg-cyan-500' : typeTone(event.type) === 'yellow' ? 'bg-amber-500' : 'bg-emerald-500'" />
                  <div class="min-w-0">
                    <div class="truncate font-medium text-slate-900 dark:text-slate-100">{{ event.title || '日程安排' }}</div>
                    <div class="mt-1 truncate text-xs text-slate-500">{{ event.description || '暂无补充说明' }}</div>
                  </div>
                </div>
              </td>
              <td class="align-top">
                <div class="whitespace-nowrap">{{ eventFullRange(event) }}</div>
                <div class="mt-1 text-xs text-slate-400">{{ durationLabel(event) }}</div>
              </td>
              <td class="align-top">
                <span class="inline-flex min-w-0 items-center gap-1"><MapPin class="h-3.5 w-3.5 shrink-0 text-slate-400" /><span class="truncate">{{ roomName(event.roomId) || (event.type === 'MEETING' ? '未绑定会议室' : '个人安排') }}</span></span>
              </td>
              <td class="align-top">
                <div class="inline-flex flex-col items-start gap-1">
                  <StatusBadge :label="statusMeta(event).label" :tone="statusMeta(event).tone" />
                  <span class="whitespace-nowrap text-[11px] text-slate-400">{{ statusMeta(event).hint }}</span>
                </div>
              </td>
              <td class="align-top">
                <div class="flex justify-end gap-1 whitespace-nowrap">
                  <Button size="icon" variant="ghost" @click="detailEvent = event"><Eye class="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" @click="openEditDialog(event)"><Edit3 class="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" @click="pendingDelete = event"><Trash2 class="h-4 w-4 text-red-500" /></Button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <Pagination v-if="tableTotal > 0" v-model:page="pageNum" v-model:page-size="pageSize" :total="tableTotal" :page-size-options="[8, 16, 32]" @update:page-size="pageNum = 1" />
    </Panel>

    <BaseDialog :show="dialogOpen" :title="editingEvent ? '编辑日程' : '新建日程'" width="wide" @close="closeDialog">
      <div class="grid gap-4 md:grid-cols-2">
        <Input v-model="form.title" label="日程主题" required placeholder="输入日程主题" class="md:col-span-2" />
        <label class="space-y-2">
          <span class="text-sm font-medium">类型</span>
          <Select v-model="form.type" :options="typeOptions.filter((item) => item.value !== 'ALL')" />
        </label>
        <label class="space-y-2">
          <span class="text-sm font-medium">会议室</span>
          <Select v-model="form.roomId" :options="roomOptions" :disabled="form.type !== 'MEETING'" />
        </label>
        <Input v-model="form.startDate" type="date" label="开始日期" />
        <Input v-model="form.endDate" type="date" label="结束日期" />
        <Input v-model="form.startTime" type="time" label="开始时间" :disabled="form.isAllDay" />
        <Input v-model="form.endTime" type="time" label="结束时间" :disabled="form.isAllDay" />
        <label class="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950 md:col-span-2">
          <span class="text-sm font-medium text-slate-700 dark:text-slate-200">全天日程</span>
          <Toggle v-model="form.isAllDay" />
        </label>
        <TextArea v-model="form.attendees" label="参与人 ID" placeholder="JSON 数组或逗号分隔，例如 [1,2,3]" class="md:col-span-2" />
        <TextArea v-model="form.description" label="备注" placeholder="补充议程、目标、注意事项或提醒信息" class="md:col-span-2" />
      </div>
      <template #footer>
        <div class="flex justify-end gap-3">
          <Button variant="outline" @click="closeDialog">取消</Button>
          <Button :disabled="saving" @click="saveSchedule"><Save class="h-4 w-4" />保存</Button>
        </div>
      </template>
    </BaseDialog>

    <BaseDialog :show="Boolean(detailEvent)" :title="detailEvent?.title || '日程详情'" width="wide" @close="detailEvent = null">
      <div v-if="detailEvent" class="space-y-5">
        <div class="flex flex-wrap items-center gap-2">
          <StatusBadge :label="typeLabel(detailEvent.type)" :tone="typeTone(detailEvent.type)" />
          <StatusBadge :label="statusMeta(detailEvent).label" :tone="statusMeta(detailEvent).tone" />
          <StatusBadge v-if="detailEvent.isAllDay" label="全天" tone="yellow" />
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
            <div class="text-xs font-medium text-slate-500">时间范围</div>
            <div class="mt-1.5 text-sm font-medium text-slate-900 dark:text-slate-100">{{ eventFullRange(detailEvent) }}</div>
          </div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
            <div class="text-xs font-medium text-slate-500">预计占用</div>
            <div class="mt-1.5 text-sm font-medium text-slate-900 dark:text-slate-100">{{ durationLabel(detailEvent) }}</div>
          </div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
            <div class="text-xs font-medium text-slate-500">会议室 / 地点</div>
            <div class="mt-1.5 text-sm font-medium text-slate-900 dark:text-slate-100">{{ roomName(detailEvent.roomId) || (detailEvent.type === 'MEETING' ? '未绑定会议室' : '个人安排') }}</div>
          </div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
            <div class="text-xs font-medium text-slate-500">当前状态</div>
            <div class="mt-1.5 text-sm font-medium text-slate-900 dark:text-slate-100">{{ statusMeta(detailEvent).hint }}</div>
          </div>
        </div>

        <div>
          <div class="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">备注说明</div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
            {{ detailEvent.description?.trim() || '暂无补充备注' }}
          </div>
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end gap-3">
          <Button variant="outline" @click="detailEvent = null">关闭</Button>
          <Button v-if="detailEvent" variant="outline" @click="openEditDialog(detailEvent)"><Edit3 class="h-4 w-4" />编辑</Button>
          <Button v-if="detailEvent" variant="danger" @click="pendingDelete = detailEvent"><Trash2 class="h-4 w-4" />删除</Button>
        </div>
      </template>
    </BaseDialog>

    <ConfirmDialog
      :show="Boolean(pendingDelete)"
      title="删除日程"
      :message="pendingDelete ? `确认删除“${pendingDelete.title || pendingDelete.eventId}”？` : ''"
      confirm-text="删除"
      danger
      @cancel="pendingDelete = null"
      @confirm="confirmDelete"
    />

  </div>
</template>
