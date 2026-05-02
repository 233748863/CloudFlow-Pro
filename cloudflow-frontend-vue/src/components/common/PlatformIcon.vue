<script setup lang="ts">
import Icon from '@/components/icons/Icon.vue'

defineProps<{ name?: string }>()
</script>

<template>
  <span class="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200">
    <Icon :name="name || 'package'" size="sm" />
  </span>
</template>
