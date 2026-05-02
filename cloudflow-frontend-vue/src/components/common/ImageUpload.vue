<script setup lang="ts">
import Icon from '@/components/icons/Icon.vue'

defineProps<{ modelValue?: string; label?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const onFileChange = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => emit('update:modelValue', String(reader.result || ''))
  reader.readAsDataURL(file)
}
</script>

<template>
  <label class="block">
    <span v-if="label" class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">{{ label }}</span>
    <span class="flex min-h-28 cursor-pointer items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-4 text-slate-500 dark:border-slate-700 dark:bg-slate-950">
      <img v-if="modelValue" :src="modelValue" alt="" class="max-h-24 max-w-full rounded-lg object-contain" />
      <span v-else class="inline-flex items-center gap-2 text-sm"><Icon name="plus" size="sm" />上传图片</span>
    </span>
    <input type="file" accept="image/*" class="sr-only" @change="onFileChange" />
  </label>
</template>
