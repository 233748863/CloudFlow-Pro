<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Archive } from 'lucide-vue-next'
import { DataTable, Pagination, Panel, type Column } from '@/components/common'
import { useToastStore } from '@/stores/toast'
import { getProcessDefinitions, type ProcessDefinitionQuery, normalizeWorkflowRows, getWorkflowTotal, type WorkflowRecord } from '@/services/api/workflow'

useToastStore()
const loading = ref(false)
const workflows = ref<WorkflowRecord[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)

const columns: Column<WorkflowRecord>[] = [
  { key: 'definitionId', label: 'ID', class: 'w-20' },
  { key: 'processName', label: '流程名称' },
  { key: 'version', label: '版本', class: 'w-24' },
  { key: 'archivedAt', label: '归档时间', class: 'w-40' }
]

const load = async () => {
  loading.value = true
  try {
    const result = await getProcessDefinitions({ pageNum: page.value, pageSize: pageSize.value, status: 'ARCHIVED' } as ProcessDefinitionQuery)
    workflows.value = normalizeWorkflowRows(result)
    total.value = getWorkflowTotal(result)
  } finally {
    loading.value = false
  }
}

onMounted(() => { load() })
</script>

<template>
  <Panel title="归档流程">
    <template #icon><Archive class="h-5 w-5" /></template>
    <DataTable :columns="columns" :data="workflows" :loading="loading" />
    <Pagination v-model:page="page" v-model:page-size="pageSize" :total="total" @update:page="load" @update:page-size="load" />
  </Panel>
</template>
