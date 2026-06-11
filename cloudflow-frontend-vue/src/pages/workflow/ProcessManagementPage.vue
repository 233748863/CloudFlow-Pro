<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { List, Plus } from 'lucide-vue-next'
import { Button, DataTable, Input, Pagination, Panel, StatusBadge, type Column } from '@/components/common'
import { useRouter } from 'vue-router'
import { useToastStore } from '@/stores/toast'
import { getProcessDefinitions, deleteProcessDefinition, type ProcessDefinitionQuery, normalizeWorkflowRows, getWorkflowTotal, type WorkflowRecord } from '@/services/api/workflow'

const router = useRouter()
const toast = useToastStore()
const loading = ref(false)
const processes = ref<WorkflowRecord[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const keyword = ref('')

const columns: Column<WorkflowRecord>[] = [
  { key: 'definitionId', label: 'ID', class: 'w-20' },
  { key: 'processName', label: '流程名称' },
  { key: 'version', label: '版本', class: 'w-24' },
  { key: 'status', label: '状态', class: 'w-24' },
  { key: 'actions', label: '操作', class: 'w-48 text-right' }
]

const load = async () => {
  loading.value = true
  try {
    const result = await getProcessDefinitions({ pageNum: page.value, pageSize: pageSize.value, keyword: keyword.value, latestOnly: true } as ProcessDefinitionQuery)
    processes.value = normalizeWorkflowRows(result)
    total.value = getWorkflowTotal(result)
  } finally {
    loading.value = false
  }
}

const handleDelete = async (row: WorkflowRecord) => {
  if (!confirm('确定删除？')) return
  try {
    await deleteProcessDefinition(row.definitionId as string)
    toast.success('删除成功')
    load()
  } catch (error) {
    toast.error('删除失败')
  }
}

onMounted(() => { load() })
</script>

<template>
  <Panel title="流程管理">
    <template #icon><List class="h-5 w-5" /></template>
    <template #actions><Button @click="router.push('/workflow/design')"><Plus class="h-4 w-4" />新建流程</Button></template>

    <div class="mb-4 flex gap-2">
      <Input v-model="keyword" placeholder="搜索流程名称" class="flex-1" @keyup.enter="load" />
      <Button @click="load">搜索</Button>
    </div>

    <DataTable :columns="columns" :data="processes" :loading="loading">
      <template #cell-status="{ value }">
        <StatusBadge :label="value === 'ACTIVE' ? '已激活' : '草稿'" :tone="value === 'ACTIVE' ? 'green' : 'slate'" />
      </template>
      <template #cell-actions="{ row }">
        <div class="flex justify-end gap-2">
          <Button size="sm" variant="ghost" @click="router.push(`/workflow/design/${row.definitionId}`)">编辑</Button>
          <Button size="sm" variant="danger" @click="handleDelete(row)">删除</Button>
        </div>
      </template>
    </DataTable>

    <Pagination v-model:page="page" v-model:page-size="pageSize" :total="total" @update:page="load" @update:page-size="load" />
  </Panel>
</template>
