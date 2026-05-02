<script setup lang="ts">
import BaseDialog from './BaseDialog.vue'

withDefaults(defineProps<{
  show: boolean
  title?: string
  progress?: number
  message?: string
}>(), {
  title: '导出进度',
  progress: 0,
  message: ''
})

defineEmits<{ close: [] }>()
</script>

<template>
  <BaseDialog :show="show" :title="title" width="narrow" @close="$emit('close')">
    <div class="space-y-3">
      <div class="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div class="h-full rounded-full bg-teal-600 transition-all" :style="{ width: `${Math.min(Math.max(progress, 0), 100)}%` }" />
      </div>
      <p class="text-sm text-slate-500 dark:text-slate-400">{{ message || `${Math.round(progress)}%` }}</p>
    </div>
  </BaseDialog>
</template>
