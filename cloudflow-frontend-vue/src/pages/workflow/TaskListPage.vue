<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { CheckCircle, Clock, XCircle, FileText } from 'lucide-vue-next'
import { Button, DataTable, Input, Select, Pagination, Panel, StatusBadge, type Column } from '@/components/common'
import { useToastStore } from '@/stores/toast'
import { listMyTasks, approveTask, rejectTask, normalizeWorkflowRows, getWorkflowTotal } from '@/services/api/workflow'
import type { WorkflowRecord } from '@/services/api/workflow'

const router = useRouter()
const toast = useToastStore()

const loading = ref(false)
const tasks = ref<WorkflowRecord[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)

const searchKeyword = ref('')
const statusFilter = ref('')
const typeFilter = ref('')

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'PENDING', label: '待处理' },
  { value: 'APPROVED', label: '已通过' },
  { value: 'REJECTED', label: '已拒绝' }
]

const columns = computed<Column<WorkflowRecord>[]>(() => [
  { key: 'taskId', label: 'ID', class: 'w-20' },
  { key: 'processName', label: '流程名称' },
  { key: 'applicant', label: '申请人', class: 'w-32' },
  { key: 'taskName', label: '当前节点', class: 'w-32' },
  { key: 'createdAt', label: '创建时间', class: 'w-40' },
  { key: 'status', label: '状态', class: 'w-24' },
  { key: 'actions', label: '操作', class: 'w-48 text-right' }
])

const loadTasks = async () => {
  loading.value = true
  try {
    const result = await listMyTasks({
      pageNum: page.value,
      pageSize: pageSize.value,
      keyword: searchKeyword.value,
      status: statusFilter.value,
      processType: typeFilter.value
    })
    tasks.value = normalizeWorkflowRows(result)
    total.value = getWorkflowTotal(result)
  } catch (error) {
    toast.error('加载待办任务失败')
  } finally {
    loading.value = false
  }
}

const handleApprove = async (row: WorkflowRecord) => {
  try {
    await approveTask(row.taskId as string, { comment: '同意' })
    toast.success('审批通过')
    loadTasks()
  } catch (error) {
    toast.error('审批失败')
  }
}

const handleReject = async (row: WorkflowRecord) => {
  try {
    await rejectTask(row.taskId as string, { reason: '不符合要求' })
    toast.success('已拒绝')
    loadTasks()
  } catch (error) {
    toast.error('拒绝失败')
  }
}

const handleViewDetail = (row: WorkflowRecord) => {
  router.push(`/workflow/tasks/${row.taskId}`)
}

onMounted(() => {
  loadTasks()
})
</script>

<template>
  <div class="space-y-4">
    <Panel title="我的待办">
      <template #icon><FileText class="h-5 w-5" /></template>

      <template #actions>
        <Button variant="ghost" @click="loadTasks">
          <Clock class="h-4 w-4" />
          刷新
        </Button>
      </template>

      <div class="mb-4 flex gap-3">
        <Input v-model="searchKeyword" placeholder="搜索流程名称/申请人" class="flex-1" @keyup.enter="loadTasks" />
        <Select v-model="statusFilter" :options="statusOptions" class="w-40" @change="loadTasks" />
        <Button @click="loadTasks">搜索</Button>
      </div>

      <DataTable :columns="columns" :data="tasks" :loading="loading">
        <template #cell-status="{ value }">
          <StatusBadge
            :label="value === 'PENDING' ? '待处理' : value === 'APPROVED' ? '已通过' : '已拒绝'"
            :tone="value === 'PENDING' ? 'yellow' : value === 'APPROVED' ? 'green' : 'red'"
          />
        </template>

        <template #cell-actions="{ row }">
          <div class="flex justify-end gap-2">
            <Button size="sm" variant="ghost" @click="handleViewDetail(row)">
              详情
            </Button>
            <Button v-if="row.status === 'PENDING'" size="sm" variant="primary" @click="handleApprove(row)">
              <CheckCircle class="h-4 w-4" />
              通过
            </Button>
            <Button v-if="row.status === 'PENDING'" size="sm" variant="danger" @click="handleReject(row)">
              <XCircle class="h-4 w-4" />
              拒绝
            </Button>
          </div>
        </template>
      </DataTable>

      <Pagination v-model:page="page" v-model:page-size="pageSize" :total="total" @update:page="loadTasks" @update:page-size="loadTasks" />
    </Panel>
  </div>
</template>
