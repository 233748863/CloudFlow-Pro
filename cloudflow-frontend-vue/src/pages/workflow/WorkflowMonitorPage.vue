<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Activity, StopCircle, RefreshCcw } from 'lucide-vue-next'
import { Button, DataTable, Input, Pagination, Panel, StatusBadge, type Column } from '@/components/common'
import { useToastStore } from '@/stores/toast'
import { listProcessInstances, terminateProcess, normalizeWorkflowRows, getWorkflowTotal, type WorkflowRecord } from '@/services/api/workflow'

const toast = useToastStore()
const loading = ref(false)
const instances = ref<WorkflowRecord[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const searchKeyword = ref('')

const columns: Column<WorkflowRecord>[] = [
  { key: 'instanceId', label: '实例ID', class: 'w-32' },
  { key: 'processName', label: '流程名称' },
  { key: 'applicant', label: '申请人', class: 'w-32' },
  { key: 'currentNode', label: '当前节点', class: 'w-32' },
  { key: 'status', label: '状态', class: 'w-24' },
  { key: 'startTime', label: '开始时间', class: 'w-40' },
  { key: 'actions', label: '操作', class: 'w-48 text-right' }
]

const loadInstances = async () => {
  loading.value = true
  try {
    const result = await listProcessInstances({ pageNum: page.value, pageSize: pageSize.value, keyword: searchKeyword.value })
    instances.value = normalizeWorkflowRows(result)
    total.value = getWorkflowTotal(result)
  } catch (error) {
    toast.error('加载流程实例失败')
  } finally {
    loading.value = false
  }
}

const handleTerminate = async (row: WorkflowRecord) => {
  if (!confirm('确定要终止此流程吗？')) return
  try {
    await terminateProcess(row.instanceId as string)
    toast.success('流程已终止')
    loadInstances()
  } catch (error) {
    toast.error('终止失败')
  }
}

onMounted(() => {
  loadInstances()
})
</script>

<template>
  <Panel title="流程监控">
    <template #icon><Activity class="h-5 w-5" /></template>

    <template #actions>
      <Button variant="ghost" @click="loadInstances">
        <RefreshCcw class="h-4 w-4" />
        刷新
      </Button>
    </template>

    <div class="mb-4">
      <Input v-model="searchKeyword" placeholder="搜索流程名称/申请人" @keyup.enter="loadInstances" />
    </div>

    <DataTable :columns="columns" :data="instances" :loading="loading">
      <template #cell-status="{ value }">
        <StatusBadge
          :label="value === 'RUNNING' ? '运行中' : value === 'COMPLETED' ? '已完成' : '已终止'"
          :tone="value === 'RUNNING' ? 'cyan' : value === 'COMPLETED' ? 'green' : 'red'"
        />
      </template>

      <template #cell-actions="{ row }">
        <div class="flex justify-end gap-2">
          <Button size="sm" variant="ghost" :to="`/workflow/instances/${row.instanceId}`">
            详情
          </Button>
          <Button v-if="row.status === 'RUNNING'" size="sm" variant="danger" @click="handleTerminate(row)">
            <StopCircle class="h-4 w-4" />
            终止
          </Button>
        </div>
      </template>
    </DataTable>

    <Pagination v-model:page="page" v-model:page-size="pageSize" :total="total" @update:page="loadInstances" @update:page-size="loadInstances" />
  </Panel>
</template>
