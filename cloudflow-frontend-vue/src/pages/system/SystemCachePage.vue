<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ChevronRight, Copy, Database, Folder, FolderOpen, KeyRound, RefreshCcw, Search, ServerCog, Trash2, X } from 'lucide-vue-next'
import { Button, ConfirmDialog, Input, Panel, StatusBadge } from '@/components/common'
import {
  type CacheCommandStat,
  type CacheInfo,
  type CacheKeyDetail,
  type CacheKeyGroup,
  deleteCacheByPrefix,
  deleteCacheKey,
  getCacheInfo,
  getCacheKeyValue,
  getCacheKeys
} from '@/services/api/system'
import { useToastStore } from '@/stores/toast'
import { getErrorMessage } from '@/utils/errorMessage'
import { formatNumber } from '@/pages/hr/hrUtils'

type CacheTab = 'overview' | 'browser'
type DeleteTarget = { type: 'key' | 'prefix'; value: string } | null

interface TreeNode {
  id: string
  name: string
  fullKey?: string
  children: TreeNode[]
  count: number
}

interface FlatTreeNode {
  node: TreeNode
  depth: number
}

const toast = useToastStore()
const loading = ref(false)
const keysLoading = ref(false)
const detailLoading = ref(false)
const activeTab = ref<CacheTab>('overview')
const info = ref<Record<string, string>>({})
const dbSize = ref(0)
const commandStats = ref<CacheCommandStat[]>([])
const keyGroups = ref<CacheKeyGroup[]>([])
const keyTree = ref<TreeNode[]>([])
const expandedKeys = reactive(new Set<string>())
const keySearchInput = ref('')
const keySearch = ref('')
const selectedKey = ref<string | null>(null)
const keyDetail = ref<CacheKeyDetail | null>(null)
const deleteTarget = ref<DeleteTarget>(null)

const tabOptions: { key: CacheTab; label: string }[] = [
  { key: 'overview', label: '概览' },
  { key: 'browser', label: 'Key 浏览器' }
]

const redisVersion = computed(() => info.value.redis_version || '-')
const usedMemoryHuman = computed(() => info.value.used_memory_human || '-')
const usedMemoryPeak = computed(() => info.value.used_memory_peak_human || '-')
const connectedClients = computed(() => info.value.connected_clients || '0')
const uptimeInDays = computed(() => info.value.uptime_in_days || '0')
const maxmemory = computed(() => info.value.maxmemory_human || info.value.maxmemory || '-')
const role = computed(() => info.value.role || '-')
const totalCommandsProcessed = computed(() => info.value.total_commands_processed || '0')
const maxCommandValue = computed(() => Math.max(...commandStats.value.map((item) => Number(item.value || 0)), 1))
const selectedDetailValue = computed(() => keyDetail.value ? formatValue(keyDetail.value.value) : '')

const summary = computed(() => ({
  dbSize: dbSize.value,
  memory: usedMemoryHuman.value,
  clients: connectedClients.value,
  commands: totalCommandsProcessed.value
}))

const flatTree = computed<FlatTreeNode[]>(() => {
  const rows: FlatTreeNode[] = []
  const walk = (nodes: TreeNode[], depth: number) => {
    nodes.forEach((node) => {
      rows.push({ node, depth })
      if (expandedKeys.has(node.id)) walk(node.children, depth + 1)
    })
  }
  walk(keyTree.value, 0)
  return rows
})

const basicRows = computed(() => [
  ['Redis 版本', redisVersion.value],
  ['运行天数', `${uptimeInDays.value} 天`],
  ['已用内存', usedMemoryHuman.value],
  ['峰值内存', usedMemoryPeak.value],
  ['最大内存', maxmemory.value === '0' ? '无限制' : maxmemory.value],
  ['角色', role.value],
  ['处理命令数', Number(totalCommandsProcessed.value || 0).toLocaleString()],
  ['客户端连接数', connectedClients.value]
])

function buildKeyTree(keys: string[]) {
  const root: TreeNode = { id: 'root', name: 'root', children: [], count: 0 }
  keys.forEach((key) => {
    const parts = key.split(':').filter(Boolean)
    let current = root
    parts.forEach((part, index) => {
      const id = [...parts.slice(0, index), part].join(':')
      let child = current.children.find((item) => item.name === part)
      if (!child) {
        child = {
          id,
          name: part,
          children: [],
          count: 0,
          fullKey: index === parts.length - 1 ? key : undefined
        }
        current.children.push(child)
      }
      child.count += 1
      current = child
    })
  })

  const sortTree = (nodes: TreeNode[]) => {
    nodes.sort((left, right) => left.name.localeCompare(right.name))
    nodes.forEach((node) => sortTree(node.children))
  }
  sortTree(root.children)
  return root.children
}

function isLeaf(node: TreeNode) {
  return node.children.length === 0 && Boolean(node.fullKey)
}

function findFirstLeaf(node: TreeNode): string {
  if (node.fullKey) return node.fullKey
  for (const child of node.children) {
    const key = findFirstLeaf(child)
    if (key) return key
  }
  return node.name
}

function getNodePrefix(node: TreeNode, depth: number) {
  if (node.fullKey) return node.fullKey
  return findFirstLeaf(node).split(':').slice(0, depth + 1).join(':')
}

function toggleNode(node: TreeNode) {
  if (expandedKeys.has(node.id)) expandedKeys.delete(node.id)
  else expandedKeys.add(node.id)
}

function formatTTL(ttl?: number) {
  const value = Number(ttl ?? -2)
  if (value === -1) return '永不过期'
  if (value === -2) return 'Key 不存在'
  if (value < 60) return `${value} 秒`
  if (value < 3600) return `${Math.floor(value / 60)} 分 ${value % 60} 秒`
  if (value < 86400) return `${Math.floor(value / 3600)} 小时 ${Math.floor((value % 3600) / 60)} 分`
  return `${Math.floor(value / 86400)} 天 ${Math.floor((value % 86400) / 3600)} 小时`
}

function formatValue(value: unknown) {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2)
    } catch {
      return value
    }
  }
  return JSON.stringify(value, null, 2)
}

function typeTone(type?: string) {
  const value = String(type || '').toLowerCase()
  if (['string', 'hash'].includes(value)) return 'green'
  if (['list', 'zset'].includes(value)) return 'cyan'
  if (value === 'set') return 'yellow'
  return 'slate'
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('已复制')
  } catch {
    toast.error('复制失败')
  }
}

async function fetchCacheInfo() {
  loading.value = true
  try {
    const response = await getCacheInfo()
    const data = response as CacheInfo
    info.value = data.info || {}
    dbSize.value = Number(data.dbSize || 0)
    commandStats.value = (data.commandStats || []).map((item) => ({ ...item, value: Number(item.value || 0) }))
    keyGroups.value = (data.keyGroups || []).map((item) => ({ ...item, count: Number(item.count || 0) }))
  } catch (error) {
    toast.error(getErrorMessage(error, '获取缓存信息失败'))
  } finally {
    loading.value = false
  }
}

async function fetchKeys(pattern = '*') {
  keysLoading.value = true
  try {
    const keys = await getCacheKeys(pattern)
    const list = Array.isArray(keys) ? keys : []
    keyTree.value = buildKeyTree(list)
    expandedKeys.clear()
    keyTree.value.slice(0, 8).forEach((node) => expandedKeys.add(node.id))
  } catch (error) {
    toast.error(getErrorMessage(error, '获取 Key 列表失败'))
  } finally {
    keysLoading.value = false
  }
}

async function selectKey(key: string) {
  selectedKey.value = key
  detailLoading.value = true
  try {
    keyDetail.value = await getCacheKeyValue(key)
  } catch (error) {
    keyDetail.value = null
    toast.error(getErrorMessage(error, '获取 Key 详情失败'))
  } finally {
    detailLoading.value = false
  }
}

function switchTab(tab: CacheTab) {
  activeTab.value = tab
  if (tab === 'browser' && keyTree.value.length === 0) void fetchKeys()
}

function searchKeys() {
  const keyword = keySearchInput.value.trim()
  keySearch.value = keyword
  selectedKey.value = null
  keyDetail.value = null
  void fetchKeys(keyword ? `*${keyword}*` : '*')
}

function resetSearch() {
  keySearchInput.value = ''
  keySearch.value = ''
  selectedKey.value = null
  keyDetail.value = null
  void fetchKeys('*')
}

async function refreshAll() {
  await fetchCacheInfo()
  if (activeTab.value === 'browser') {
    await fetchKeys(keySearch.value ? `*${keySearch.value}*` : '*')
  }
}

async function confirmDelete() {
  const target = deleteTarget.value
  if (!target) return
  try {
    if (target.type === 'key') {
      await deleteCacheKey(target.value)
      if (selectedKey.value === target.value) {
        selectedKey.value = null
        keyDetail.value = null
      }
      toast.success('删除成功')
    } else {
      const count = await deleteCacheByPrefix(`${target.value}:`)
      selectedKey.value = null
      keyDetail.value = null
      toast.success(`已删除 ${formatNumber(count)} 个 Key`)
    }
    deleteTarget.value = null
    await refreshAll()
  } catch (error) {
    toast.error(getErrorMessage(error, '删除缓存失败'))
  }
}

onMounted(() => {
  void fetchCacheInfo()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <Database class="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Cache Monitor
        </div>
        <h1 class="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">缓存监控</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">查看 Redis 运行状态、命令统计、Key 分组与缓存详情</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" :disabled="loading || keysLoading" @click="refreshAll">
          <RefreshCcw class="h-4 w-4" :class="loading || keysLoading ? 'animate-spin' : ''" />
          刷新缓存
        </Button>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-4">
      <div class="card p-4"><div class="text-xs text-slate-500">Key 总数</div><div class="mt-2 text-2xl font-semibold">{{ formatNumber(summary.dbSize) }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">已用内存</div><div class="mt-2 text-2xl font-semibold text-cyan-600 dark:text-cyan-300">{{ summary.memory }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">客户端连接</div><div class="mt-2 text-2xl font-semibold text-emerald-600 dark:text-emerald-300">{{ summary.clients }}</div></div>
      <div class="card p-4"><div class="text-xs text-slate-500">处理命令数</div><div class="mt-2 text-2xl font-semibold text-amber-600 dark:text-amber-300">{{ formatNumber(summary.commands) }}</div></div>
    </div>

    <Panel title="缓存工作区">
      <template #icon><ServerCog class="h-4 w-4 text-slate-500" /></template>
      <template #actions>
        <div class="tabs">
          <button
            v-for="item in tabOptions"
            :key="item.key"
            class="tab"
            :class="{ active: activeTab === item.key }"
            @click="switchTab(item.key)"
          >
            {{ item.label }}
          </button>
        </div>
      </template>

      <div v-if="activeTab === 'overview'" class="space-y-4">
        <div class="grid gap-4 xl:grid-cols-2">
          <div class="rounded-xl border border-slate-200 dark:border-slate-800">
            <div class="border-b border-slate-100 px-4 py-3 text-sm font-semibold dark:border-slate-800">基本信息</div>
            <div v-if="loading && Object.keys(info).length === 0" class="px-4 py-16 text-center text-sm text-slate-500">正在加载缓存信息...</div>
            <table v-else class="w-full text-sm">
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                <tr v-for="[label, value] in basicRows" :key="label">
                  <td class="w-1/3 px-4 py-3 text-slate-500">{{ label }}</td>
                  <td class="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{{ value }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="rounded-xl border border-slate-200 dark:border-slate-800">
            <div class="border-b border-slate-100 px-4 py-3 text-sm font-semibold dark:border-slate-800">命令统计 Top 10</div>
            <div v-if="loading && commandStats.length === 0" class="px-4 py-16 text-center text-sm text-slate-500">正在加载命令统计...</div>
            <div v-else-if="commandStats.length === 0" class="px-4 py-16 text-center text-sm text-slate-500">暂无命令统计数据</div>
            <div v-else class="space-y-3 p-4">
              <div v-for="cmd in commandStats.slice(0, 10)" :key="cmd.name">
                <div class="mb-1 flex justify-between gap-3 text-sm">
                  <span class="font-mono text-slate-700 dark:text-slate-200">{{ cmd.name }}</span>
                  <span class="text-slate-500">{{ formatNumber(cmd.value) }}</span>
                </div>
                <div class="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                  <div class="h-2 rounded-full bg-cyan-500 transition-all" :style="{ width: `${Math.round((Number(cmd.value || 0) / maxCommandValue) * 100)}%` }" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="rounded-xl border border-slate-200 dark:border-slate-800">
          <div class="border-b border-slate-100 px-4 py-3 text-sm font-semibold dark:border-slate-800">Key 分组</div>
          <div class="table-wrapper">
            <table class="table min-w-[560px]">
              <thead>
                <tr><th>前缀</th><th>数量</th><th>占比</th></tr>
              </thead>
              <tbody>
                <tr v-if="loading && keyGroups.length === 0"><td colspan="3" class="py-12 text-center text-slate-500">正在加载 Key 分组...</td></tr>
                <tr v-else-if="keyGroups.length === 0"><td colspan="3" class="py-12 text-center text-slate-500">暂无 Key 数据</td></tr>
                <tr v-else v-for="group in keyGroups" :key="group.prefix">
                  <td class="font-mono">{{ group.prefix }}*</td>
                  <td>{{ formatNumber(group.count) }}</td>
                  <td>
                    <div class="flex items-center gap-2">
                      <div class="h-2 w-24 rounded-full bg-slate-100 dark:bg-slate-800">
                        <div class="h-2 rounded-full bg-emerald-500" :style="{ width: `${dbSize > 0 ? Math.min((group.count / dbSize) * 100, 100) : 0}%` }" />
                      </div>
                      <span class="text-slate-500">{{ dbSize > 0 ? ((group.count / dbSize) * 100).toFixed(1) : '0.0' }}%</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div v-else class="space-y-4">
        <div class="flex flex-wrap items-end gap-3">
          <Input v-model="keySearchInput" class="min-w-[220px] flex-1" label="Key 搜索" placeholder="输入关键字，自动拼接 *keyword*" @enter="searchKeys" />
          <Button @click="searchKeys"><Search class="h-4 w-4" />搜索</Button>
          <Button variant="outline" @click="resetSearch"><X class="h-4 w-4" />清空</Button>
        </div>

        <div class="grid min-h-[36rem] overflow-hidden rounded-xl border border-slate-200 xl:grid-cols-[340px_minmax(0,1fr)] dark:border-slate-800">
          <div class="border-b border-slate-200 xl:border-b-0 xl:border-r dark:border-slate-800">
            <div class="border-b border-slate-100 px-4 py-3 text-sm font-semibold dark:border-slate-800">Key 树</div>
            <div class="max-h-[68vh] overflow-y-auto p-2">
              <div v-if="keysLoading" class="px-4 py-16 text-center text-sm text-slate-500">正在加载 Key 列表...</div>
              <div v-else-if="flatTree.length === 0" class="px-4 py-16 text-center text-sm text-slate-500">暂无 Key 数据</div>
              <button
                v-else
                v-for="{ node, depth } in flatTree"
                :key="node.id"
                class="group flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm transition"
                :class="selectedKey === node.fullKey ? 'border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/30 dark:text-cyan-200' : 'text-slate-700 hover:bg-slate-50 hover:text-cyan-700 dark:text-slate-200 dark:hover:bg-slate-900/70 dark:hover:text-cyan-200'"
                :style="{ paddingLeft: `${depth * 16 + 8}px` }"
                @click="isLeaf(node) && node.fullKey ? selectKey(node.fullKey) : toggleNode(node)"
              >
                <KeyRound v-if="isLeaf(node)" class="h-3.5 w-3.5 shrink-0 text-cyan-500" />
                <ChevronRight v-else class="h-3.5 w-3.5 shrink-0 text-slate-400 transition" :class="expandedKeys.has(node.id) ? 'rotate-90' : ''" />
                <FolderOpen v-if="!isLeaf(node) && expandedKeys.has(node.id)" class="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <Folder v-else-if="!isLeaf(node)" class="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span class="min-w-0 flex-1 truncate font-mono text-xs">{{ node.name }}</span>
                <span v-if="!isLeaf(node)" class="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-900">{{ node.count }}</span>
                <button
                  v-if="!isLeaf(node)"
                  type="button"
                  class="opacity-0 transition group-hover:opacity-100"
                  @click.stop="deleteTarget = { type: 'prefix', value: getNodePrefix(node, depth) }"
                >
                  <Trash2 class="h-3.5 w-3.5 text-red-500" />
                </button>
              </button>
            </div>
          </div>

          <div class="min-w-0">
            <div class="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <div>
                <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">{{ selectedKey ? 'Key 详情' : '详情预览' }}</div>
                <div v-if="keyDetail" class="mt-2 flex flex-wrap gap-2">
                  <StatusBadge :label="keyDetail.type.toUpperCase()" :tone="typeTone(keyDetail.type)" />
                  <StatusBadge :label="`TTL ${formatTTL(keyDetail.ttl)}`" tone="slate" />
                  <StatusBadge v-if="keyDetail.size !== undefined" :label="`元素 ${formatNumber(keyDetail.size)}`" tone="cyan" />
                </div>
              </div>
              <div v-if="keyDetail" class="flex gap-1">
                <Button size="icon" variant="ghost" @click="copyToClipboard(keyDetail.key)"><Copy class="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" @click="deleteTarget = { type: 'key', value: keyDetail.key }"><Trash2 class="h-4 w-4 text-red-500" /></Button>
                <Button size="icon" variant="ghost" @click="selectedKey = null; keyDetail = null"><X class="h-4 w-4" /></Button>
              </div>
            </div>

            <div v-if="!selectedKey" class="flex min-h-[28rem] items-center justify-center text-sm text-slate-500">选择左侧 Key 查看详情</div>
            <div v-else-if="detailLoading" class="flex min-h-[28rem] items-center justify-center text-sm text-slate-500">正在加载 Key 详情...</div>
            <div v-else-if="keyDetail" class="space-y-4 p-4">
              <div class="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/40">
                <div class="flex items-center gap-2">
                  <KeyRound class="h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-300" />
                  <span class="truncate font-mono text-sm text-slate-800 dark:text-slate-100" :title="keyDetail.key">{{ keyDetail.key }}</span>
                </div>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-xs font-medium text-slate-500">值</span>
                <button class="inline-flex items-center gap-1 text-xs text-cyan-600 transition hover:text-cyan-700 dark:text-cyan-300" @click="copyToClipboard(selectedDetailValue)">
                  <Copy class="h-3 w-3" />
                  复制值
                </button>
              </div>
              <pre class="max-h-[52vh] overflow-auto whitespace-pre-wrap break-all rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200">{{ selectedDetailValue }}</pre>
            </div>
            <div v-else class="flex min-h-[28rem] items-center justify-center text-sm text-slate-500">加载失败，请重试</div>
          </div>
        </div>
      </div>
    </Panel>

    <ConfirmDialog
      :show="Boolean(deleteTarget)"
      :title="deleteTarget?.type === 'prefix' ? '确认批量删除前缀' : '确认删除缓存 Key'"
      :message="deleteTarget?.type === 'prefix' ? `确定删除前缀“${deleteTarget.value}:*”下的所有 Key 吗？此操作不可恢复。` : `确定删除 Key“${deleteTarget?.value || ''}”吗？`"
      confirm-text="删除"
      danger
      @cancel="deleteTarget = null"
      @confirm="confirmDelete"
    />
  </div>
</template>
