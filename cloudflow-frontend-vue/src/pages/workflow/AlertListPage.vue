<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { AlertTriangle } from 'lucide-vue-next'
import { Button, DataTable, Pagination, Panel, StatusBadge, type Column } from '@/components/common'
import { useToastStore } from '@/stores/toast'
import { listAlerts, dismissAlert, normalizeWorkflowRows, getWorkflowTotal, type WorkflowRecord } from '@/services/api/workflow'

const toast = useToastStore()
const loading = ref(false)
const alerts = ref<WorkflowRecord[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)

const columns: Column<WorkflowRecord>[] = [
  { key: 'alertId', label: 'ID', class: 'w-20' },
  { key: 'processName', label: '流程名称' },
  { key: 'alertType', label: '预警类型', class: 'w-32' },
  { key: 'message', label: '预警内容' },
  { key: 'severity', label: '严重程度', class: 'w-24' },
  { key: 'createdAt', label: '时间', class: 'w-40' },
  { key: 'actions', label: '操作', class: 'w-24 text-right' }
]

const loadAlerts = async () => {
  loading.value = true
  try {
    const result = await listAlerts({ pageNum: page.value, pageSize: pageSize.value })
    alerts.value = normalizeWorkflowRows(result)
    total.value = getWorkflowTotal(result)
  } catch (error) {
    toast.error('加载预警列表失败')
  } finally {
    loading.value = false
  }
}

const handleDismiss = async (row: WorkflowRecord) => {
  try {
    await dismissAlert(row.alertId as string)
    toast.success('预警已忽略')
    loadAlerts()
  } catch (error) {
    toast.error('操作失败')
  }
}

onMounted(() => {
  loadAlerts()
})
</script>

<template>
  <Panel title="流程预警">
    <template #icon><AlertTriangle class="h-5 w-5" /></template>

    <DataTable :columns="columns" :data="alerts" :loading="loading">
      <template #cell-alertType="{ value }">
        {{ value === 'TIMEOUT' ? '超时预警' : value === 'SLA' ? 'SLA 违规' : '其他' }}
      </template>

      <template #cell-severity="{ value }">
        <StatusBadge
          :label="value === 'HIGH' ? '高' : value === 'MEDIUM' ? '中' : '低'"
          :tone="value === 'HIGH' ? 'red' : value === 'MEDIUM' ? 'yellow' : 'slate'"
        />
      </template>

      <template #cell-actions="{ row }">
        <Button size="sm" variant="ghost" @click="handleDismiss(row)">
          忽略
        </Button>
      </template>
    </DataTable>

    <Pagination v-model:page="page" v-model:page-size="pageSize" :total="total" @update:page="loadAlerts" @update:page-size="loadAlerts" />
  </Panel>
</template>
