<script setup lang="ts">
import LoadingSpinner from './LoadingSpinner.vue'

withDefaults(defineProps<{
  title?: string
  description?: string
}>(), {
  title: '正在加载工作区资源',
  description: '请稍候'
})
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 px-4 text-gray-600 dark:bg-dark-950 dark:text-dark-300">
    <div class="glass-card flex h-20 w-20 items-center justify-center overflow-hidden">
      <img src="/icon.svg" alt="CloudFlow Pro" class="h-14 w-14 object-contain" />
    </div>
    <div class="text-center">
      <LoadingSpinner :label="title" size="md" />
      <p class="mt-2 text-xs text-gray-500 dark:text-dark-400">{{ description }}</p>
    </div>
  </div>
</template>
