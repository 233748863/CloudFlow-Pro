<script setup lang="ts">
import { ref } from 'vue'
import { Upload, FileText } from 'lucide-vue-next'
import { Button, Panel } from '@/components/common'
import { useToastStore } from '@/stores/toast'
import { importWorkflow, type ImportResult } from '@/services/api/workflow'

const toast = useToastStore()
const uploading = ref(false)
const result = ref<ImportResult | null>(null)

const handleFileSelect = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  uploading.value = true
  const formData = new FormData()
  formData.append('file', file)

  try {
    result.value = await importWorkflow(file)
    if (result.value) {
      toast.success(result.value.success ? '导入成功' : '导入失败')
    }
  } catch (error) {
    toast.error('导入失败')
  } finally {
    uploading.value = false
  }
}

const openFileInput = () => {
  const el = window.document.getElementById('fileInput')
  if (el) (el as HTMLInputElement).click()
}
</script>

<template>
  <Panel title="流程导入">
    <template #icon><Upload class="h-5 w-5" /></template>

    <div class="space-y-4">
      <div class="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center dark:border-gray-700">
        <FileText class="mx-auto h-12 w-12 text-gray-400" />
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">支持 BPMN 2.0 文件导入</p>
        <input type="file" accept=".bpmn,.xml" class="hidden" @change="handleFileSelect" id="fileInput" />
        <Button class="mt-4" :disabled="uploading" @click="openFileInput">
          <Upload class="h-4 w-4" />
          {{ uploading ? '导入中...' : '选择文件' }}
        </Button>
      </div>

      <div v-if="result" class="rounded-lg bg-gray-50 p-4 dark:bg-gray-900">
        <p class="font-medium" :class="result.success ? 'text-green-600' : 'text-red-600'">
          {{ result.message }}
        </p>
        <p v-if="result.workflowName" class="mt-1 text-sm text-gray-600 dark:text-gray-400">流程名称：{{ result.workflowName }}</p>
      </div>
    </div>
  </Panel>
</template>
