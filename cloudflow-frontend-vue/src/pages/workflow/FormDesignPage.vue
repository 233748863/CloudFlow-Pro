<script setup lang="ts">
import { ref } from 'vue'
import { Layout, Save } from 'lucide-vue-next'
import { Button, Panel, Input } from '@/components/common'
import { useToastStore } from '@/stores/toast'
import { saveFormDefinition } from '@/services/api/workflow'

const toast = useToastStore()
const formName = ref('')
const fields = ref<Array<{ name: string; label: string; type: string }>>([])

const addField = () => {
  fields.value.push({ name: '', label: '', type: 'text' })
}

const save = async () => {
  try {
    await saveFormDefinition({ formName: formName.value, fieldsJson: JSON.stringify(fields.value) })
    toast.success('保存成功')
  } catch (error) {
    toast.error('保存失败')
  }
}
</script>

<template>
  <Panel title="表单设计器">
    <template #icon><Layout class="h-5 w-5" /></template>
    <template #actions><Button @click="save"><Save class="h-4 w-4" />保存</Button></template>

    <div class="space-y-4">
      <Input v-model="formName" label="表单名称" placeholder="输入表单名称" />

      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium">字段列表</span>
          <Button size="sm" @click="addField">添加字段</Button>
        </div>

        <div v-for="(field, index) in fields" :key="index" class="flex gap-2 rounded-lg border p-3 dark:border-gray-700">
          <Input v-model="field.name" placeholder="字段名" class="flex-1" />
          <Input v-model="field.label" placeholder="标签" class="flex-1" />
          <select v-model="field.type" class="rounded-lg border px-3 py-2 dark:border-gray-600 dark:bg-gray-800">
            <option value="text">文本</option>
            <option value="number">数字</option>
            <option value="date">日期</option>
            <option value="select">下拉</option>
          </select>
          <Button size="sm" variant="danger" @click="fields.splice(index, 1)">删除</Button>
        </div>
      </div>
    </div>
  </Panel>
</template>
