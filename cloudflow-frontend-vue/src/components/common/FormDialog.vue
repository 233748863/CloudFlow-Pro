<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { X } from 'lucide-vue-next'
import Button from './Button.vue'

export interface FormField {
  name: string
  label: string
  type?: 'text' | 'number' | 'date' | 'textarea' | 'select'
  required?: boolean
  placeholder?: string
  defaultValue?: string | number
  options?: Array<{ value: string | number; label: string }>
}

interface Props {
  open: boolean
  title: string
  fields: FormField[]
  loading?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
  submit: [data: Record<string, unknown>]
}>()

const formData = ref<Record<string, unknown>>({})

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    const data: Record<string, unknown> = {}
    props.fields.forEach(f => {
      data[f.name] = f.defaultValue ?? ''
    })
    formData.value = data
  }
})

const handleSubmit = () => {
  emit('submit', { ...formData.value })
}

const handleClose = () => {
  formData.value = {}
  emit('close')
}

const isOpen = computed(() => props.open)
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="handleClose">
    <div class="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-slate-800" @click.stop>
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100">{{ title }}</h3>
        <button class="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700" @click="handleClose">
          <X class="h-5 w-5" />
        </button>
      </div>

      <form @submit.prevent="handleSubmit">
        <div class="space-y-4">
          <div v-for="field in fields" :key="field.name">
            <label class="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {{ field.label }}
              <span v-if="field.required" class="text-red-500">*</span>
            </label>
            <textarea
              v-if="field.type === 'textarea'"
              :value="String(formData[field.name] ?? '')"
              :required="field.required"
              :placeholder="field.placeholder"
              class="w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700"
              rows="3"
              @input="formData[field.name] = ($event.target as HTMLTextAreaElement).value"
            />
            <select
              v-else-if="field.type === 'select'"
              :value="String(formData[field.name] ?? '')"
              :required="field.required"
              class="w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700"
              @change="formData[field.name] = ($event.target as HTMLSelectElement).value"
            >
              <option v-for="opt in field.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <input
              v-else
              :value="String(formData[field.name] ?? '')"
              :type="field.type || 'text'"
              :required="field.required"
              :placeholder="field.placeholder"
              class="w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-700"
              @input="formData[field.name] = ($event.target as HTMLInputElement).value"
            />
          </div>
        </div>

        <div class="mt-6 flex justify-end gap-2">
          <Button variant="outline" @click="handleClose">取消</Button>
          <Button type="submit" :disabled="loading">{{ loading ? '提交中...' : '确定' }}</Button>
        </div>
      </form>
    </div>
  </div>
</template>
