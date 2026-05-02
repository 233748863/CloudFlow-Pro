<script setup lang="ts">
withDefaults(defineProps<{ version?: string }>(), {
  version: '0.1.0'
})
</script>

<template>
  <span class="rounded-lg bg-gray-100 px-2 py-1 text-xs text-gray-500 dark:bg-dark-800 dark:text-dark-400">
    v{{ version }}
  </span>
</template>
