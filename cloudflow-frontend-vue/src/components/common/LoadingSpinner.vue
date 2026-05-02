<script setup lang="ts">
withDefaults(defineProps<{ label?: string; size?: 'sm' | 'md' | 'lg' }>(), {
  label: '加载中',
  size: 'md'
})
</script>

<template>
  <div class="inline-flex items-center gap-2 text-gray-500 dark:text-dark-400">
    <span class="spinner" :class="{ 'h-4 w-4': size === 'sm', 'h-6 w-6': size === 'md', 'h-8 w-8': size === 'lg' }" />
    <span v-if="label" class="text-sm">{{ label }}</span>
  </div>
</template>
