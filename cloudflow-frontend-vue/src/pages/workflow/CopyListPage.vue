<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Mail, CheckCircle } from 'lucide-vue-next'
import { Button, DataTable, Pagination, Panel, type Column } from '@/components/common'
import { useToastStore } from '@/stores/toast'
import { listCopyMessages, markCopyAsRead, normalizeWorkflowRows, getWorkflowTotal, type WorkflowRecord } from '@/services/api/workflow'

const toast = useToastStore()
const loading = ref(false)
const messages = ref<WorkflowRecord[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)

const columns: Column<WorkflowRecord>[] = [
  { key: 'messageId', label: 'ID', class: 'w-20' },
  { key: 'processName', label: '流程名称' },
  { key: 'sender', label: '发送人', class: 'w-32' },
  { key: 'content', label: '抄送内容' },
  { key: 'createdAt', label: '时间', class: 'w-40' },
  { key: 'isRead', label: '状态', class: 'w-24' },
  { key: 'actions', label: '操作', class: 'w-32 text-right' }
]

const loadMessages = async () => {
  loading.value = true
  try {
    const result = await listCopyMessages({ pageNum: page.value, pageSize: pageSize.value })
    messages.value = normalizeWorkflowRows(result)
    total.value = getWorkflowTotal(result)
  } catch (error) {
    toast.error('加载抄送列表失败')
  } finally {
    loading.value = false
  }
}

const markAsRead = async (row: WorkflowRecord) => {
  try {
    await markCopyAsRead(row.messageId as string)
    toast.success('已标记为已读')
    loadMessages()
  } catch (error) {
    toast.error('标记失败')
  }
}

onMounted(() => {
  loadMessages()
})
</script>

<template>
  <Panel title="抄送列表">
    <template #icon><Mail class="h-5 w-5" /></template>

    <DataTable :columns="columns" :data="messages" :loading="loading">
      <template #cell-isRead="{ value }">
        <span :class="value ? 'text-gray-500' : 'font-medium text-primary-600'">
          {{ value ? '已读' : '未读' }}
        </span>
      </template>

      <template #cell-actions="{ row }">
        <div class="flex justify-end gap-2">
          <Button v-if="!row.isRead" size="sm" variant="ghost" @click="markAsRead(row)">
            <CheckCircle class="h-4 w-4" />
            标记已读
          </Button>
        </div>
      </template>
    </DataTable>

    <Pagination v-model:page="page" v-model:page-size="pageSize" :total="total" @update:page="loadMessages" @update:page-size="loadMessages" />
  </Panel>
</template>
