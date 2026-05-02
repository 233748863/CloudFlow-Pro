<script setup lang="ts">
defineProps<{
  start?: string
  end?: string
  startLabel?: string
  endLabel?: string
}>()

const emit = defineEmits<{
  'update:start': [value: string]
  'update:end': [value: string]
}>()
</script>

<template>
  <div class="grid gap-3 sm:grid-cols-2">
    <label class="space-y-1.5">
      <span class="text-sm font-medium text-slate-700 dark:text-slate-200">{{ startLabel || '开始日期' }}</span>
      <input :value="start" type="date" class="input" @input="emit('update:start', ($event.target as HTMLInputElement).value)" />
    </label>
    <label class="space-y-1.5">
      <span class="text-sm font-medium text-slate-700 dark:text-slate-200">{{ endLabel || '结束日期' }}</span>
      <input :value="end" type="date" class="input" @input="emit('update:end', ($event.target as HTMLInputElement).value)" />
    </label>
  </div>
</template>
