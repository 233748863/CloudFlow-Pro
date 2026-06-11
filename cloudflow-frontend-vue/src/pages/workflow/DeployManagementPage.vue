<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Rocket, Upload } from 'lucide-vue-next'
import { Button, DataTable, Pagination, Panel, StatusBadge, type Column } from '@/components/common'
import { useToastStore } from '@/stores/toast'
import { listDeployWindows, deployProcessDefinition, type WorkflowRecord } from '@/services/api/workflow'

const toast = useToastStore()
const loading = ref(false)
const deployments = ref<WorkflowRecord[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)

const columns: Column<WorkflowRecord>[] = [
  { key: 'definitionId', label: 'ID', class: 'w-20' },
  { key: 'processName', label: '流程名称' },
  { key: 'version', label: '版本', class: 'w-24' },
  { key: 'deployTime', label: '部署时间', class: 'w-40' },
  { key: 'status', label: '状态', class: 'w-24' },
  { key: 'actions', label: '操作', class: 'w-32 text-right' }
]

const load = async () => {
  loading.value = true
  try {
    const result = await listDeployWindows()
    deployments.value = Array.isArray(result) ? result : []
    total.value = deployments.value.length
  } finally {
    loading.value = false
  }
}

const handleDeploy = async (row: WorkflowRecord) => {
  try {
    await deployProcessDefinition(row.definitionId as string)
    toast.success('部署成功')
    load()
  } catch (error) {
    toast.error('部署失败')
  }
}

onMounted(() => { load() })
</script>

<template>
  <Panel title="部署管理">
    <template #icon><Rocket class="h-5 w-5" /></template>
    <template #actions><Button variant="ghost" @click="load"><Upload class="h-4 w-4" />刷新</Button></template>

    <DataTable :columns="columns" :data="deployments" :loading="loading">
      <template #cell-status="{ value }">
        <StatusBadge :label="value === 'DEPLOYED' ? '已部署' : '待部署'" :tone="value === 'DEPLOYED' ? 'green' : 'slate'" />
      </template>
      <template #cell-actions="{ row }">
        <Button v-if="row.status !== 'DEPLOYED'" size="sm" @click="handleDeploy(row)">部署</Button>
      </template>
    </DataTable>

    <Pagination v-model:page="page" v-model:page-size="pageSize" :total="total" />
  </Panel>
</template>
